import { GristDoc } from "app/client/components/GristDoc";
import { IkaDocGuidedWorkspaceDescriptor, IkaDocGuidedWorkspaceResult } from "app/ikadoc/IkaDocGuidedWorkspace";

import type { UserAction } from "app/common/DocActions";

/** Where a guided row stands after IkaDoc validated or applied the workspace. */
const GUIDED_ROW_STATE_COLUMN = "ikadoc_row_state";
const VALIDATED = "validated";
const APPLIED = "applied";
const CONFLICT = "conflict";

export type GuidedWorkspaceRowStateOperation = "validate" | "apply";

/** Writes each guided row's state after [operation], so the grid shows what IkaDoc decided. */
export async function updateGuidedWorkspaceRowStates(
  gristDoc: GristDoc,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  result: IkaDocGuidedWorkspaceResult,
  operation: GuidedWorkspaceRowStateOperation,
  description: string,
): Promise<void> {
  const rowIdsByTable = (tableId: string) => gristDoc.docData.getTable(tableId)?.getRowIds() ?? [];

  const actions = buildGuidedWorkspaceRowStateActions(descriptor, result, operation, rowIdsByTable);
  if (actions.length > 0) {
    await gristDoc.docData.sendActions(actions, description);
  }
}

/**
 * Rows IkaDoc reported a problem on are in conflict; the others are applied when the apply
 * succeeded, else validated. An error IkaDoc could not place on a row leaves every state as is.
 */
export function buildGuidedWorkspaceRowStateActions(
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  result: IkaDocGuidedWorkspaceResult,
  operation: GuidedWorkspaceRowStateOperation,
  rowIdsByTable: (tableId: string) => readonly number[],
): UserAction[] {
  if (result.errors.some(error => !error.tableId || !error.gristRowId)) {
    return [];
  }

  const conflicted = new Set<string>();
  for (const issue of [...result.errors, ...result.warnings, ...result.conflicts]) {
    if (issue.tableId && issue.gristRowId) {
      conflicted.add(rowKey(issue.tableId, issue.gristRowId));
    }
  }

  const otherRowsState = operation === "apply" && result.success ? APPLIED : VALIDATED;

  return descriptor.tables.flatMap(({ tableId }) => {
    const rowIds = [...rowIdsByTable(tableId)];
    if (rowIds.length === 0) {
      return [];
    }

    const states = rowIds.map(rowId => conflicted.has(rowKey(tableId, rowId)) ? CONFLICT : otherRowsState);

    return [["BulkUpdateRecord", tableId, rowIds, { [GUIDED_ROW_STATE_COLUMN]: states }] as UserAction];
  });
}

function rowKey(tableId: string, rowId: number): string {
  return `${tableId}\u0000${rowId}`;
}
