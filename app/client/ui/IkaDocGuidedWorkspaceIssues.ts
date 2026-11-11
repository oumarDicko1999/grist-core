import {
  IkaDocGuidedWorkspaceCellConflict,
  IkaDocGuidedWorkspaceIssue,
  IkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";

import i18next from "i18next";
import ko from "knockout";

const MAX_CONFLICT_VALUE_LENGTH = 80;
const TRANSLATION_SCOPE = "IkaDocGuidedWorkspaceIssues";

type IssueTranslator = (key: string, args?: Record<string, string>) => string;

let scopedIssueTranslator: IssueTranslator | null = null;

interface GuidedWorkspaceCellIssue {
  severity: "error" | "warning";
  message: string;
}

const guidedWorkspaceIssueRevision = ko.observable(0);
let issuesByCell = new Map<string, GuidedWorkspaceCellIssue>();

export function setIkaDocGuidedWorkspaceIssues(
  result: IkaDocGuidedWorkspaceResult | null,
): void {
  issuesByCell = result ? buildIssueMap(result) : new Map();
  guidedWorkspaceIssueRevision(guidedWorkspaceIssueRevision() + 1);
}

export function getIkaDocGuidedWorkspaceCellIssue(
  tableId: string,
  rowId: number | string,
  columnId: string,
): GuidedWorkspaceCellIssue | null {
  guidedWorkspaceIssueRevision();
  if (typeof rowId !== "number") {
    return null;
  }
  return issuesByCell.get(cellIssueKey(tableId, rowId, columnId)) ?? null;
}

function buildIssueMap(
  result: IkaDocGuidedWorkspaceResult,
): Map<string, GuidedWorkspaceCellIssue> {
  const next = new Map<string, GuidedWorkspaceCellIssue>();
  for (const issue of result.warnings) {
    addIssue(next, issue, "warning");
  }
  for (const issue of result.errors) {
    addIssue(next, issue, "error");
  }
  for (const conflict of result.conflicts) {
    addConflict(next, conflict);
  }
  return next;
}

function addConflict(
  issues: Map<string, GuidedWorkspaceCellIssue>,
  conflict: IkaDocGuidedWorkspaceCellConflict,
): void {
  if (!conflict.tableId || !conflict.gristRowId) {
    return;
  }
  issues.set(
    cellIssueKey(conflict.tableId, conflict.gristRowId, conflict.metadataCode),
    {
      severity: "error",
      message: conflictMessage(conflict),
    },
  );
}

function addIssue(
  issues: Map<string, GuidedWorkspaceCellIssue>,
  issue: IkaDocGuidedWorkspaceIssue,
  severity: "error" | "warning",
): void {
  if (!issue.tableId || !issue.gristRowId) {
    return;
  }
  const columnId = issue.metadataCode ?? issue.column;
  if (!columnId) {
    return;
  }
  issues.set(cellIssueKey(issue.tableId, issue.gristRowId, columnId), {
    severity,
    message: issue.message,
  });
}

function cellIssueKey(
  tableId: string,
  rowId: number,
  columnId: string,
): string {
  return `${tableId}\u0000${rowId}\u0000${columnId}`;
}

function conflictMessage(conflict: IkaDocGuidedWorkspaceCellConflict): string {
  if (conflict.valuesRedacted) {
    return tIssue("Conflict on {{metadataCode}}: values are restricted", {
      metadataCode: conflict.metadataCode,
    });
  }
  return [
    tIssue("Conflict on {{metadataCode}}", {
      metadataCode: conflict.metadataCode,
    }),
    tIssue("original={{value}}", {
      value: formatConflictValue(conflict.originalValue),
    }),
    tIssue("yours={{value}}", {
      value: formatConflictValue(conflict.proposedValue),
    }),
    tIssue("current={{value}}", {
      value: formatConflictValue(conflict.currentValue),
    }),
  ].join("; ");
}

function formatConflictValue(value: unknown): string {
  if (value === undefined || value === null) {
    return tIssue("empty");
  }
  if (typeof value === "string") {
    return truncateConflictValue(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return truncateConflictValue(JSON.stringify(value) ?? String(value));
}

function truncateConflictValue(value: string): string {
  if (value.length <= MAX_CONFLICT_VALUE_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_CONFLICT_VALUE_LENGTH - 3)}...`;
}

function tIssue(key: string, args?: Record<string, string>): string {
  if (!scopedIssueTranslator) {
    const scopedInstance = i18next.cloneInstance({
      keySeparator: false,
      nsSeparator: false,
    });
    const fixedTranslator = scopedInstance.getFixedT(
      null,
      null,
      TRANSLATION_SCOPE,
    );
    scopedIssueTranslator = (
      translationKey: string,
      translationArgs?: Record<string, string>,
    ) =>
      fixedTranslator(translationKey, {
        defaultValue: translationKey,
        ...translationArgs,
      });
  }
  const translator = scopedIssueTranslator;
  return translator(key, args);
}
