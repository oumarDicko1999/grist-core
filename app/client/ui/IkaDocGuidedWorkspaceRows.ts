import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { getIkaDocRuntimeConfig } from "app/client/ui/IkaDocRuntimeAccess";
import { IkaDocGuidedWorkspaceDescriptor } from "app/ikadoc/IkaDocGuidedWorkspace";
import { IkaDocRequestError, requestIkaDocJson } from "app/ikadoc/IkaDocRequest";

import type { BulkColValues, UserAction } from "app/common/DocActions";
import type { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

const t = makeT("IkaDocGuidedWorkspaceRows");

/** IkaDoc's key for a guided row; rows without one have not been admitted yet. */
const GUIDED_ROW_KEY_COLUMN = "ikadoc_row_key";

/** A row key IkaDoc issued, with the protected values (key, state...) the row must carry. */
export interface GuidedWorkspaceAllocatedRow {
  rowKey: string;
  protectedValues: Record<string, string>;
}

/** The same, for a row that already exists in Grist. */
export interface GuidedWorkspaceAdmittedRow extends GuidedWorkspaceAllocatedRow {
  rowId: number;
}

type GuidedRowsConfig = IkaDocRuntimeConfig &
  Required<Pick<IkaDocRuntimeConfig, "guidedWorkspace" | "guidedWorkspaceUrls">>;

/** Why a guided-workspace row step failed; kept for tests and logs, never shown. */
export type IkaDocGuidedWorkspaceRowsFailure =
  "request-failed" |
  "malformed-response" |
  "unexpected-row-count" |
  "misaligned-paste";

/**
 * A guided-workspace row step that failed.
 * Grist shows the message in a toast, so it is localized; the cause stays in `failure`/`detail`.
 */
export class IkaDocGuidedWorkspaceRowsError extends Error {
  public constructor(
    public readonly failure: IkaDocGuidedWorkspaceRowsFailure,
    public readonly detail: string,
  ) {
    super(failure === "misaligned-paste" ?
      t("The pasted values do not line up with the rows being added. Paste them again.") :
      t("IkaDoc could not prepare the new rows. Try again, and reload the spreadsheet if it keeps failing."));

    this.name = "IkaDocGuidedWorkspaceRowsError";
  }
}

/**
 * Seam for Grist's "add row" (BaseView).
 * Adds IkaDoc's protected values to a row added to a guided workspace table.
 */
export async function ikaDocNewRowValues(
  tableId: string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allocated = await allocateGuidedWorkspaceRows(tableId, 1);

  return allocated ? { ...values, ...allocated[0].protectedValues } : values;
}

/**
 * Seam for Grist's paste (GridView).
 * Only `BulkAddRecord` actions change, and only for guided workspace tables.
 */
export async function ikaDocPasteActions(tableId: string, actions: UserAction[]): Promise<UserAction[]> {
  return Promise.all(actions.map(async (action) => {
    if (action[0] !== "BulkAddRecord") {
      return action;
    }

    const [name, rowIds, values] = action as [string, unknown[], BulkColValues];
    const allocated = await allocateGuidedWorkspaceRows(tableId, rowIds.length);

    return allocated ? [name, rowIds, mergeGuidedWorkspaceProtectedValues(values, allocated)] : action;
  }));
}

/** Row keys for [count] new rows of a guided table; null when [tableId] is not one. */
export async function allocateGuidedWorkspaceRows(
  tableId: string,
  count: number,
): Promise<GuidedWorkspaceAllocatedRow[] | null> {
  const config = guidedRowsConfig();
  if (!config || !isBoundTable(config, tableId)) {
    return null;
  }

  const rows = await requestRows(config, config.guidedWorkspaceUrls.allocateRowsUrl, { tableId, count });

  return requireGuidedWorkspaceAllocatedRows(rows.map(parseAllocatedRow), count);
}

export function requireGuidedWorkspaceAllocatedRows(
  rows: GuidedWorkspaceAllocatedRow[],
  expectedCount: number,
): GuidedWorkspaceAllocatedRow[] {
  if (rows.length !== expectedCount) {
    throw new IkaDocGuidedWorkspaceRowsError(
      "unexpected-row-count",
      `allocated ${rows.length} rows, expected ${expectedCount}`,
    );
  }

  return rows;
}

/**
 * Gives a row key to the rows of the guided tables that have none yet (rows the user typed
 * before IkaDoc knew the table), one table at a time: a later failure keeps earlier tables' keys.
 */
export async function admitExistingGuidedWorkspaceRows(
  gristDoc: GristDoc,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  description: string,
): Promise<void> {
  const config = guidedRowsConfig();
  if (!config) {
    return;
  }

  for (const { tableId } of descriptor.tables) {
    const tableData = gristDoc.docData.getTable(tableId);
    if (!tableData || !isBoundTable(config, tableId)) {
      continue;
    }

    const rowIds = tableData.getRowIds().filter((rowId) => {
      const rowKey = tableData.getValue(rowId, GUIDED_ROW_KEY_COLUMN);
      return rowId > 0 && !(typeof rowKey === "string" && rowKey.trim());
    });
    if (rowIds.length === 0) {
      continue;
    }

    const rows = await requestRows(config, config.guidedWorkspaceUrls.admitRowsUrl, { tableId, rowIds });
    const actions = buildGuidedWorkspaceAdmissionActions(tableId, rows.map(parseAdmittedRow));

    if (actions.length > 0) {
      await gristDoc.docData.sendActions(actions, description);
    }
  }
}

export function buildGuidedWorkspaceAdmissionActions(
  tableId: string,
  admittedRows: readonly GuidedWorkspaceAdmittedRow[],
): UserAction[] {
  if (admittedRows.length === 0) {
    return [];
  }

  const rowIds = admittedRows.map(row => row.rowId);

  const values: Record<string, string[]> = {};
  for (const columnId of protectedColumnIds(admittedRows)) {
    values[columnId] = admittedRows.map(row => row.protectedValues[columnId]);
  }

  return [["BulkUpdateRecord", tableId, rowIds, values]];
}

/** Adds the protected values to a paste's added rows; the pasted columns must cover every row. */
export function mergeGuidedWorkspaceProtectedValues(
  values: BulkColValues,
  allocatedRows: readonly GuidedWorkspaceAllocatedRow[],
): BulkColValues {
  if (allocatedRows.length === 0) {
    return values;
  }

  if (Object.values(values).some(column => column.length !== allocatedRows.length)) {
    throw new IkaDocGuidedWorkspaceRowsError("misaligned-paste", "paste values are not aligned");
  }

  const merged: BulkColValues = { ...values };
  for (const columnId of protectedColumnIds(allocatedRows)) {
    merged[columnId] = allocatedRows.map(row => row.protectedValues[columnId]);
  }

  return merged;
}

/** The config when this editor session may add guided rows; null otherwise. */
function guidedRowsConfig(): GuidedRowsConfig | null {
  // The page config carries the guided workspace fields the owned config type declares.
  const config: IkaDocRuntimeConfig | null = getIkaDocRuntimeConfig();

  const canAddRows = config?.mode === "editor" &&
    config.capabilities.canEditCells &&
    config.guidedWorkspace &&
    config.guidedWorkspaceUrls;

  return canAddRows ? config as GuidedRowsConfig : null;
}

function isBoundTable(config: GuidedRowsConfig, tableId: string): boolean {
  return config.guidedWorkspace.tableBindings.some(binding => binding.tableId === tableId);
}

/** Posts to an IkaDoc row endpoint; IkaDoc's own error text never reaches the browser. */
async function requestRows(config: GuidedRowsConfig, url: string, body: Record<string, unknown>): Promise<unknown[]> {
  const payload = await requestIkaDocJson(config, url, { method: "POST", body }).catch((error) => {
    const status = error instanceof IkaDocRequestError ? `HTTP ${error.status}` : String(error);
    throw new IkaDocGuidedWorkspaceRowsError("request-failed", status);
  });

  const rows = isObject(payload) ? payload.rows : undefined;
  if (!Array.isArray(rows)) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row response is missing rows");
  }

  return rows;
}

function parseAllocatedRow(row: unknown): GuidedWorkspaceAllocatedRow {
  if (!isObject(row) || typeof row.rowKey !== "string" || !row.rowKey) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row entry is missing row key");
  }

  const protectedValues = row.protectedValues;
  if (!isObject(protectedValues) || Object.values(protectedValues).some(value => typeof value !== "string")) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row entry is missing protected values");
  }

  return { rowKey: row.rowKey, protectedValues: protectedValues as Record<string, string> };
}

function parseAdmittedRow(row: unknown): GuidedWorkspaceAdmittedRow {
  const allocated = parseAllocatedRow(row);

  const rowId = (row as Record<string, unknown>).rowId;
  if (typeof rowId !== "number" || !Number.isInteger(rowId) || rowId <= 0) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "admitted row entry is missing row id");
  }

  return { ...allocated, rowId };
}

function protectedColumnIds(rows: readonly GuidedWorkspaceAllocatedRow[]): string[] {
  return [...new Set(rows.flatMap(row => Object.keys(row.protectedValues)))];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
