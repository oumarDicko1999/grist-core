import { makeT } from "app/client/lib/localization";
import { getIkaDocRuntimeConfig } from "app/client/ui/IkaDocRuntimeAccess";
import { hoverTooltip } from "app/client/ui/tooltips";
import { theme } from "app/client/ui2018/cssVars";
import { icon } from "app/client/ui2018/icons";

import { DomElementArg, styled } from "grainjs";

const t = makeT("IkaDocLockedColumns");

/**
 * GW-RFR-03: whether a column holds IkaDoc data (listed in the session's `lockedColumns`).
 * Such columns change only through IkaDoc (materialize, refresh); the server refuses edits too.
 */
export function isIkaDocLockedColumn(tableId: string, colId: string): boolean {
  return getIkaDocRuntimeConfig()?.lockedColumns?.[tableId]?.includes(colId) ?? false;
}

/** Seam for the grid header (GridView): a lock beside the name of an IkaDoc column. */
export function ikaDocLockedColumnIcon(tableId: string, colId: string): DomElementArg {
  if (!isIkaDocLockedColumn(tableId, colId)) {
    return null;
  }

  const label = t("IkaDoc data: updated when the source is refreshed");

  return cssLockIcon(
    "Lock",
    { "role": "img", "aria-label": label },
    hoverTooltip(label),
  );
}

const cssLockIcon = styled(icon, `
  flex: none;
  width: 12px;
  height: 12px;
  margin-left: 6px;
  --icon-color: ${theme.lightText};
`);
