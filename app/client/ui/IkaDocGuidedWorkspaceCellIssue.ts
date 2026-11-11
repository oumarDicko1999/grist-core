import * as kd from "app/client/lib/koDom";
import { getIkaDocGuidedWorkspaceCellIssue } from "app/client/ui/IkaDocGuidedWorkspaceIssues";

import { dom, DomElementArg } from "grainjs";
import ko from "knockout";

/**
 * Seam for Grist's grid cells (GridView).
 * Marks a cell the guided workspace reported a problem on: one class per severity, plus a tooltip.
 */
export function ikaDocGuidedCellIssue(
  tableId: () => string,
  rowId: () => number | string,
  columnId: () => string,
): DomElementArg[] {
  const issue = ko.pureComputed(() =>
    getIkaDocGuidedWorkspaceCellIssue(tableId(), rowId(), columnId()),
  );

  return [
    dom.autoDispose(issue),

    kd.toggleClass("ikadoc-guided-issue", () => Boolean(issue())),
    kd.toggleClass("ikadoc-guided-issue-error", () => issue()?.severity === "error"),
    kd.toggleClass("ikadoc-guided-issue-warning", () => issue()?.severity === "warning"),

    dom.attr("title", use => use(issue)?.message ?? null),
  ];
}
