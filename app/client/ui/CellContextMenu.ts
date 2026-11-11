import { allCommands } from "app/client/components/commands";
import { ariaDisabled } from "app/client/lib/domUtils";
import { makeT } from "app/client/lib/localization";
import { IMultiColumnContextMenu } from "app/client/ui/GridViewMenus";
import { canUseIkaDocRuntimeComments } from "app/client/ui/IkaDocRuntimeAccess";
import { menuDivider, menuItemCmd } from "app/client/ui2018/menus";

const t = makeT("CellContextMenu");

export interface ICellContextMenu {
  isReadonly: boolean;
  disableInsert: boolean;
  disableDelete: boolean;
  isViewSorted: boolean;
  numRows: number;
  disableAnchorLink?: boolean;
  onlyAddRowSelected?: boolean;
}

export function CellContextMenu(cellOptions: ICellContextMenu, colOptions: IMultiColumnContextMenu) {
  const { disableInsert, disableDelete, isReadonly, isViewSorted, numRows, onlyAddRowSelected } = cellOptions;
  const { numColumns, disableModify, isReadonly: isColumnReadonly, isFiltered } = colOptions;

  // disableModify is true if the column is a summary column or is being transformed.
  // isReadonly is true for readonly mode.
  const disableForReadonlyCell = ariaDisabled(Boolean(disableModify) || isReadonly);
  const disableForReadonlyColumn = ariaDisabled(Boolean(disableModify) || isColumnReadonly);
  const disableForReadonlyView = ariaDisabled(isColumnReadonly);

  const nameClearColumns = isFiltered ?
    t("Reset {{count}} entire columns", { count: numColumns }) :
    t("Reset {{count}} columns", { count: numColumns });
  const nameDeleteColumns = t("Delete {{count}} columns", { count: numColumns });

  const nameDeleteRows = t("Delete {{count}} rows", { count: numRows });

  const nameClearCells = (numRows > 1 || numColumns > 1) ? t("Clear values") : t("Clear cell");
  const canUseComments = canUseIkaDocRuntimeComments();

  const result: (Element | null)[] = [];

  if (isReadonly && isColumnReadonly) {
    result.push(
      menuItemCmd(allCommands.contextMenuCopy, t("Copy")),
      menuItemCmd(allCommands.contextMenuCopyWithHeaders, t("Copy with headers")),
    );
    if (numColumns === 1 && numRows === 1) {
      result.push(
        menuDivider(),
        menuItemCmd(allCommands.copyLink,
          t("Copy anchor link"),
          ariaDisabled(cellOptions.disableAnchorLink ?? false),
        ),
      );
    }
    return result;
  }

  result.push(
    menuItemCmd(allCommands.contextMenuCut, t("Cut"), disableForReadonlyCell),
    menuItemCmd(allCommands.contextMenuCopy, t("Copy")),
    menuItemCmd(allCommands.contextMenuCopyWithHeaders, t("Copy with headers")),
    menuItemCmd(allCommands.contextMenuPaste, t("Paste"), disableForReadonlyCell),
    menuDivider(),
    colOptions.isFormula ?
      null :
      menuItemCmd(allCommands.clearValues, nameClearCells, disableForReadonlyCell),
    menuItemCmd(allCommands.clearColumns, nameClearColumns, disableForReadonlyCell),

    ...(
      (numColumns > 1 || numRows > 1) ? [] : [
        menuDivider(),
        menuItemCmd(allCommands.copyLink,
          t("Copy anchor link"),
          ariaDisabled(cellOptions.disableAnchorLink ?? false),
        ),
        menuDivider(),
        menuItemCmd(allCommands.filterByThisCellValue, t("Filter by this value")),
        canUseComments ?
          menuItemCmd(allCommands.openDiscussion, t("Comment"), ariaDisabled(
            isReadonly || numRows === 0 || numColumns === 0 || Boolean(onlyAddRowSelected),
          )) :
          null,
      ]
    ),

    menuDivider(),

    // inserts
    ...(
      isViewSorted ?
        // When the view is sorted, any newly added records get shifts instantly at the top or
        // bottom. It could be very confusing for users who might expect the record to stay above or
        // below the active row. Thus in this case we show a single `insert row` command.
        [menuItemCmd(allCommands.insertRecordAfter, t("Insert row"),
          ariaDisabled(disableInsert))] :

        [menuItemCmd(allCommands.insertRecordBefore, t("Insert row above"),
          ariaDisabled(disableInsert)),
        menuItemCmd(allCommands.insertRecordAfter, t("Insert row below"),
          ariaDisabled(disableInsert))]
    ),
    menuItemCmd(allCommands.duplicateRows, t("Duplicate rows", { count: numRows }),
      ariaDisabled(disableInsert || numRows === 0)),
    menuItemCmd(allCommands.insertFieldBefore, t("Insert column to the left"),
      disableForReadonlyView),
    menuItemCmd(allCommands.insertFieldAfter, t("Insert column to the right"),
      disableForReadonlyView),

    menuDivider(),

    // deletes
    menuItemCmd(allCommands.deleteRecords, nameDeleteRows, ariaDisabled(disableDelete)),

    menuItemCmd(allCommands.deleteFields, nameDeleteColumns, disableForReadonlyColumn),

    // todo: add "hide N columns"
  );

  return result;
}
