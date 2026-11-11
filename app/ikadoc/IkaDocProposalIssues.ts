import { IkaDocGuidedWorkspaceIssue, IkaDocGuidedWorkspaceResult } from "app/ikadoc/IkaDocGuidedWorkspace";

/** The host event that tells the grid which cells IkaDoc refused when applying a proposal. */
export const IKADOC_PROPOSAL_ISSUES_EVENT = "owarelin:proposalIssues";

const MAX_ISSUES = 500;

/**
 * GW-COL-05: the cells IkaDoc refused when it applied a write-back proposal, as the result the
 * grid's issue markers read. Entries that do not name a table, row and column are dropped; an
 * empty list clears the markers.
 */
export function parseIkaDocProposalIssues(detail: Record<string, unknown>): IkaDocGuidedWorkspaceResult {
  const issues = Array.isArray(detail.issues) ? detail.issues.slice(0, MAX_ISSUES) : [];

  return {
    success: false,
    simulated: false,
    importedCounts: {},
    updatedCounts: {},
    errors: issues.map(toIssue).filter((issue): issue is IkaDocGuidedWorkspaceIssue => issue !== undefined),
    warnings: [],
    conflicts: [],
  };
}

function toIssue(value: unknown): IkaDocGuidedWorkspaceIssue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const { tableId, rowId, columnId, message } = value as Record<string, unknown>;
  const named = typeof tableId === "string" && typeof columnId === "string" && typeof message === "string";
  if (!named || !Number.isInteger(rowId)) {
    return undefined;
  }

  return { schemaType: "", tableId, gristRowId: rowId as number, metadataCode: columnId, message };
}
