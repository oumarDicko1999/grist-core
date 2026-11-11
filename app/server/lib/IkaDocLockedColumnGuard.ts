import { DocAction } from "app/common/DocActions";
import { IkaDocLockedColumns } from "app/ikadoc/IkaDocRuntimeConfig";
import { AuthSession } from "app/server/lib/AuthSession";
import { ikaDocRuntimeSessionFromAuthSession } from "app/server/lib/IkaDocRuntimeAuth";
import { deniedIkaDocRuntimeOperation } from "app/server/lib/IkaDocRuntimeDenial";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";

/** Changes to a column itself: its name, type or formula, or its removal. Element 2 is the column. */
const COLUMN_CHANGES = new Set(["RenameColumn", "ModifyColumn", "RemoveColumn"]);

/** Changes to a whole table, which would take its IkaDoc columns with it. */
const TABLE_CHANGES = new Set(["RemoveTable", "RenameTable"]);

/** Value updates. Element 3 maps column ids to new values. */
const VALUE_UPDATES = new Set(["UpdateRecord", "BulkUpdateRecord"]);

/**
 * GW-RFR-03, SEC-2: IkaDoc's columns change only through IkaDoc. The user-action policy refuses the
 * obvious edits up front, but Grist turns other actions into the same changes: a `colId`, `type` or
 * `formula` written into `_grist_Tables_column`, a `RemoveTable`, a column copied or converted into
 * another. This checks the DocActions Grist actually computed, whatever action produced them, and
 * refuses the bundle so Grist reverts it. Requests without an admitted person (IkaDoc's service) are
 * not held to it.
 */
export function assertIkaDocLockedColumnsKept(authSession: AuthSession, docActions: DocAction[]): void {
  const session = ikaDocRuntimeSessionFromAuthSession(authSession);
  const lockedColumns = session?.config.lockedColumns;
  if (!session || !lockedColumns) {
    return;
  }

  for (const docAction of docActions) {
    const touched = touchedLockedColumn(lockedColumns, docAction);
    if (touched) {
      refuse(session, touched);
    }
  }
}

function touchedLockedColumn(lockedColumns: IkaDocLockedColumns, docAction: DocAction): string | undefined {
  const [actionName, tableId] = docAction;
  const locked = lockedColumns[tableId];
  if (!locked?.length) {
    return undefined;
  }

  if (TABLE_CHANGES.has(actionName)) {
    return locked[0];
  }

  if (COLUMN_CHANGES.has(actionName)) {
    const columnId = docAction[2];

    return typeof columnId === "string" && locked.includes(columnId) ? columnId : undefined;
  }

  if (VALUE_UPDATES.has(actionName)) {
    const values = docAction[3];

    return values && typeof values === "object" ?
      Object.keys(values).find(columnId => locked.includes(columnId)) :
      undefined;
  }

  return undefined;
}

function refuse(session: IkaDocRuntimeSession, columnId: string): never {
  throw deniedIkaDocRuntimeOperation(`change the IkaDoc column ${columnId}`, session);
}
