import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { getIkaDocRuntimeConfig } from "app/client/ui/IkaDocRuntimeAccess";
import {
  IkaDocGuidedWorkspaceDescriptor,
  IkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";
import { IkaDocRequestError, requestIkaDocJson } from "app/ikadoc/IkaDocRequest";

import type { BulkColValues, UserAction } from "app/common/DocActions";
import type { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

export interface GuidedWorkspaceAllocatedRow {
  rowKey: string;
  protectedValues: Record<string, string>;
}

export interface GuidedWorkspaceAdmittedRow extends GuidedWorkspaceAllocatedRow {
  rowId: number;
}

interface GuidedWorkspaceRowsResponse {
  rows: GuidedWorkspaceAllocatedRow[];
}

interface GuidedWorkspaceAdmissionResponse {
  rows: GuidedWorkspaceAdmittedRow[];
}

const GUIDED_ROW_KEY_COLUMN = "ikadoc_row_key";
const GUIDED_ROW_STATE_COLUMN = "ikadoc_row_state";
const GUIDED_ROW_STATE_VALIDATED = "validated";
const GUIDED_ROW_STATE_APPLIED = "applied";
const GUIDED_ROW_STATE_CONFLICT = "conflict";

type GuidedWorkspaceRowStateOperation = "validate" | "apply";
type GuidedWorkspaceRowStateAction = [
  "BulkUpdateRecord",
  string,
  number[],
  Record<string, string[]>,
];
type GuidedWorkspaceAdmissionAction = GuidedWorkspaceRowStateAction;
type GuidedWorkspaceRowIdsByTable = (tableId: string) => readonly number[];

const t = makeT("IkaDocGuidedWorkspaceRows");

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
    super(guidedRowsErrorMessage(failure));

    this.name = "IkaDocGuidedWorkspaceRowsError";
  }
}

function guidedRowsErrorMessage(failure: IkaDocGuidedWorkspaceRowsFailure): string {
  if (failure === "misaligned-paste") {
    return t("The pasted values do not line up with the rows being added. Paste them again.");
  }

  return t("IkaDoc could not prepare the new rows. Try again, and reload the spreadsheet if it keeps failing.");
}

export function isGuidedWorkspaceTable(tableId: string): boolean {
  const config = getIkaDocRuntimeConfig();
  if (!canUseGuidedWorkspaceRows(config)) {
    return false;
  }
  return config.guidedWorkspace.tableBindings.some(
    binding => binding.tableId === tableId,
  );
}

export async function allocateGuidedWorkspaceRows(
  tableId: string,
  count: number,
): Promise<GuidedWorkspaceAllocatedRow[] | null> {
  const config = getIkaDocRuntimeConfig();
  if (
    !canUseGuidedWorkspaceRows(config) ||
    !isBoundGuidedTable(config, tableId)
  ) {
    return null;
  }

  const response = await requestGuidedWorkspaceRows(
    config,
    config.guidedWorkspaceUrls.allocateRowsUrl,
    { tableId, count },
  );
  return response.rows;
}

export async function admitExistingGuidedWorkspaceRows(
  gristDoc: GristDoc,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  description: string,
): Promise<void> {
  const config = getIkaDocRuntimeConfig();
  if (!canUseGuidedWorkspaceRows(config)) {
    return;
  }

  for (const table of descriptor.tables) {
    if (!isBoundGuidedTable(config, table.tableId)) {
      continue;
    }
    const tableData = gristDoc.docData.getTable(table.tableId);
    if (!tableData) {
      continue;
    }
    const rowIds = missingGuidedRowKeyIds(tableData);
    if (rowIds.length === 0) {
      continue;
    }
    const admission = await requestGuidedWorkspaceAdmission(
      config,
      table.tableId,
      rowIds,
    );
    const actions = buildGuidedWorkspaceAdmissionActions(
      table.tableId,
      admission.rows,
    );
    if (actions.length > 0) {
      await gristDoc.docData.sendActions(actions, description);
    }
  }
}

export function buildGuidedWorkspaceAdmissionActions(
  tableId: string,
  admittedRows: readonly GuidedWorkspaceAdmittedRow[],
): GuidedWorkspaceAdmissionAction[] {
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

export function mergeGuidedWorkspaceProtectedValues(
  bulkUpdate: BulkColValues,
  allocatedRows: readonly GuidedWorkspaceAllocatedRow[],
): BulkColValues {
  if (allocatedRows.length === 0) {
    return bulkUpdate;
  }

  ensureProtectedRowValuesMatchAddedRows(bulkUpdate, allocatedRows.length);

  const merged: BulkColValues = { ...bulkUpdate };
  for (const columnId of protectedColumnIds(allocatedRows)) {
    merged[columnId] = allocatedRows.map(
      row => row.protectedValues[columnId],
    );
  }
  return merged;
}

export function addGuidedWorkspaceProtectedValues(
  values: Record<string, unknown>,
  allocatedRow: GuidedWorkspaceAllocatedRow,
): Record<string, unknown> {
  return { ...values, ...allocatedRow.protectedValues };
}

export function requireGuidedWorkspaceAllocatedRows(
  rows: readonly GuidedWorkspaceAllocatedRow[] | null,
  expectedCount: number,
): readonly GuidedWorkspaceAllocatedRow[] | null {
  if (rows && rows.length !== expectedCount) {
    throw new IkaDocGuidedWorkspaceRowsError(
      "unexpected-row-count",
      `allocated ${rows.length} rows, expected ${expectedCount}`,
    );
  }
  return rows;
}

/**
 * Seam for Grist's "add row" (BaseView).
 * Adds IkaDoc's protected values to a row added to a guided workspace table.
 */
export async function ikaDocNewRowValues(
  tableId: string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const allocatedRows = requireGuidedWorkspaceAllocatedRows(
    await allocateGuidedWorkspaceRows(tableId, 1),
    1,
  );

  if (!allocatedRows) {
    return values;
  }

  return addGuidedWorkspaceProtectedValues(values, allocatedRows[0]);
}

/** Adds IkaDoc's protected values to the rows a paste adds to a guided workspace table. */
export async function ikaDocPastedRowValues(
  tableId: string,
  values: BulkColValues,
  addedRowCount: number,
): Promise<BulkColValues> {
  const allocatedRows = requireGuidedWorkspaceAllocatedRows(
    await allocateGuidedWorkspaceRows(tableId, addedRowCount),
    addedRowCount,
  );

  if (!allocatedRows) {
    return values;
  }

  return mergeGuidedWorkspaceProtectedValues(values, allocatedRows);
}

/**
 * Seam for Grist's paste (GridView).
 * Only `BulkAddRecord` actions change, and only for guided workspace tables.
 */
export async function ikaDocPasteActions(
  tableId: string,
  actions: UserAction[],
): Promise<UserAction[]> {
  return Promise.all(actions.map(async (action) => {
    if (action[0] !== "BulkAddRecord") {
      return action;
    }

    const [name, rowIds, values] = action as [string, unknown[], BulkColValues];
    const valuesWithProtection = await ikaDocPastedRowValues(tableId, values, rowIds.length);

    return [name, rowIds, valuesWithProtection];
  }));
}

export async function updateGuidedWorkspaceRowStates(
  gristDoc: GristDoc,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  result: IkaDocGuidedWorkspaceResult,
  operation: GuidedWorkspaceRowStateOperation,
  description: string,
): Promise<void> {
  const actions = buildGuidedWorkspaceRowStateActions(
    descriptor,
    result,
    operation,
    (tableId) => {
      const tableData = gristDoc.docData.getTable(tableId);
      return tableData ? (tableData.getRowIds() as number[]) : [];
    },
  );
  if (actions.length === 0) {
    return;
  }
  await gristDoc.docData.sendActions(actions, description);
}

export function buildGuidedWorkspaceRowStateActions(
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  result: IkaDocGuidedWorkspaceResult,
  operation: GuidedWorkspaceRowStateOperation,
  rowIdsByTable: GuidedWorkspaceRowIdsByTable,
): GuidedWorkspaceRowStateAction[] {
  if (hasUnlocatedGuidedWorkspaceErrors(result)) {
    return [];
  }
  const conflictedRows = guidedWorkspaceConflictedRows(result);
  return descriptor.tables.flatMap((table) => {
    const rowIds = [...rowIdsByTable(table.tableId)];
    if (rowIds.length === 0) {
      return [];
    }
    const states = rowIds.map((rowId) => {
      if (conflictedRows.has(rowStateKey(table.tableId, rowId))) {
        return GUIDED_ROW_STATE_CONFLICT;
      }
      if (operation === "apply" && result.success) {
        return GUIDED_ROW_STATE_APPLIED;
      }
      return GUIDED_ROW_STATE_VALIDATED;
    });
    return [
      [
        "BulkUpdateRecord",
        table.tableId,
        rowIds,
        { [GUIDED_ROW_STATE_COLUMN]: states },
      ],
    ];
  });
}

function hasUnlocatedGuidedWorkspaceErrors(
  result: IkaDocGuidedWorkspaceResult,
): boolean {
  return result.errors.some(error => !error.tableId || !error.gristRowId);
}

function guidedWorkspaceConflictedRows(
  result: IkaDocGuidedWorkspaceResult,
): Set<string> {
  const conflicted = new Set<string>();
  for (const issue of [...result.errors, ...result.warnings]) {
    if (issue.tableId && issue.gristRowId) {
      conflicted.add(rowStateKey(issue.tableId, issue.gristRowId));
    }
  }
  for (const conflict of result.conflicts) {
    if (conflict.tableId && conflict.gristRowId) {
      conflicted.add(rowStateKey(conflict.tableId, conflict.gristRowId));
    }
  }
  return conflicted;
}

function rowStateKey(tableId: string, rowId: number): string {
  return `${tableId}\u0000${rowId}`;
}

function canUseGuidedWorkspaceRows(
  config: IkaDocRuntimeConfig | null,
): config is IkaDocRuntimeConfig &
Required<
  Pick<IkaDocRuntimeConfig, "guidedWorkspace" | "guidedWorkspaceUrls">
> {
  return Boolean(
    config?.mode === "editor" &&
    config.capabilities.canEditCells &&
    config.guidedWorkspace &&
    config.guidedWorkspaceUrls,
  );
}

function isBoundGuidedTable(
  config: IkaDocRuntimeConfig &
    Required<Pick<IkaDocRuntimeConfig, "guidedWorkspace">>,
  tableId: string,
): boolean {
  return config.guidedWorkspace.tableBindings.some(
    binding => binding.tableId === tableId,
  );
}

async function requestGuidedWorkspaceRows(
  config: IkaDocRuntimeConfig,
  url: string,
  body: Record<string, unknown>,
): Promise<GuidedWorkspaceRowsResponse> {
  const payload = await requestIkaDocJson(config, url, { method: "POST", body }).catch((error) => {
    const status = error instanceof IkaDocRequestError ? `HTTP ${error.status}` : String(error);
    throw new IkaDocGuidedWorkspaceRowsError("request-failed", status);
  });

  return parseGuidedWorkspaceRowsResponse(payload);
}

async function requestGuidedWorkspaceAdmission(
  config: IkaDocRuntimeConfig &
    Required<Pick<IkaDocRuntimeConfig, "guidedWorkspaceUrls">>,
  tableId: string,
  rowIds: readonly number[],
): Promise<GuidedWorkspaceAdmissionResponse> {
  const response = await requestGuidedWorkspaceRows(
    config,
    config.guidedWorkspaceUrls.admitRowsUrl,
    { tableId, rowIds },
  );
  return { rows: response.rows.map(parseGuidedWorkspaceAdmittedRow) };
}

function parseGuidedWorkspaceRowsResponse(
  payload: unknown,
): GuidedWorkspaceRowsResponse {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row response is malformed");
  }
  const rows = (payload as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row response is missing rows");
  }
  return { rows: rows.map(parseGuidedWorkspaceAllocatedRow) };
}

function parseGuidedWorkspaceAllocatedRow(
  row: unknown,
): GuidedWorkspaceAllocatedRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row entry is malformed");
  }
  const raw = row as Record<string, unknown>;
  if (typeof raw.rowKey !== "string" || raw.rowKey.length === 0) {
    throw new IkaDocGuidedWorkspaceRowsError("malformed-response", "row entry is missing row key");
  }
  if (
    !raw.protectedValues ||
    typeof raw.protectedValues !== "object" ||
    Array.isArray(raw.protectedValues)
  ) {
    throw new IkaDocGuidedWorkspaceRowsError(
      "malformed-response",
      "row entry is missing protected values",
    );
  }
  const protectedValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.protectedValues)) {
    if (typeof value !== "string") {
      throw new IkaDocGuidedWorkspaceRowsError(
        "malformed-response",
        "protected value is malformed",
      );
    }
    protectedValues[key] = value;
  }
  const parsed: GuidedWorkspaceAllocatedRow & { rowId?: number } = {
    rowKey: raw.rowKey,
    protectedValues,
  };
  if (typeof raw.rowId === "number") {
    parsed.rowId = raw.rowId;
  }
  return parsed;
}

function parseGuidedWorkspaceAdmittedRow(
  row: GuidedWorkspaceAllocatedRow,
): GuidedWorkspaceAdmittedRow {
  const raw = row as GuidedWorkspaceAllocatedRow & { rowId?: unknown };
  if (
    typeof raw.rowId !== "number" ||
    !Number.isInteger(raw.rowId) ||
    raw.rowId <= 0
  ) {
    throw new IkaDocGuidedWorkspaceRowsError(
      "malformed-response",
      "admitted row entry is missing row id",
    );
  }
  return {
    rowId: raw.rowId,
    rowKey: row.rowKey,
    protectedValues: row.protectedValues,
  };
}

function missingGuidedRowKeyIds(tableData: {
  getRowIds(): readonly number[];
  getValue(rowId: number, colId: string): unknown;
}): number[] {
  return tableData
    .getRowIds()
    .filter(
      rowId =>
        rowId > 0 &&
        !hasGuidedRowKey(tableData.getValue(rowId, GUIDED_ROW_KEY_COLUMN)),
    );
}

function hasGuidedRowKey(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureProtectedRowValuesMatchAddedRows(
  bulkUpdate: BulkColValues,
  addedRowCount: number,
): void {
  for (const values of Object.values(bulkUpdate)) {
    if (values.length !== addedRowCount) {
      throw new IkaDocGuidedWorkspaceRowsError("misaligned-paste", "paste values are not aligned");
    }
  }
}

function protectedColumnIds(
  rows: readonly GuidedWorkspaceAllocatedRow[],
): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const columnId of Object.keys(row.protectedValues)) {
      ids.add(columnId);
    }
  }
  return [...ids];
}
