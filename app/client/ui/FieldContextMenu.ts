import { allCommands } from "app/client/components/commands";
import { makeT } from "app/client/lib/localization";
import { ViewFieldRec } from "app/client/models/entities/ViewFieldRec";
import { canUseIkaDocRuntimeComments } from "app/client/ui/IkaDocRuntimeAccess";
import { menuDivider, menuItemCmd } from "app/client/ui2018/menus";

import { dom } from "grainjs";

const t = makeT("FieldContextMenu");

export interface IFieldContextMenu {
  disableModify: boolean;
  isReadonly: boolean;
  isStructureReadonly: boolean;
  field: ViewFieldRec;
  isAddRow: boolean;
}

export function FieldContextMenu(fieldOptions: IFieldContextMenu) {
  const { disableModify, isReadonly, isStructureReadonly, field, isAddRow } = fieldOptions;
  const disableForReadonlyField = dom.cls("disabled", disableModify || isReadonly);
  const disableForReadonlyStructure = dom.cls("disabled", disableModify || isStructureReadonly);

  const isVirtual = typeof field.colRef.peek() === "string";
  const disabledForVirtual = dom.cls("disabled", isVirtual);
  const canUseComments = canUseIkaDocRuntimeComments();

  if (isReadonly && isStructureReadonly) {
    return [
      menuItemCmd(allCommands.contextMenuCopy, t("Copy")),
      menuDivider(),
      menuItemCmd(allCommands.copyLink, t("Copy anchor link"), disabledForVirtual),
    ];
  }

  return [
    menuItemCmd(allCommands.contextMenuCut, t("Cut"), disableForReadonlyField),
    menuItemCmd(allCommands.contextMenuCopy, t("Copy")),
    menuItemCmd(allCommands.contextMenuPaste, t("Paste"), disableForReadonlyField),
    menuDivider(),
    menuItemCmd(allCommands.clearValues, t("Clear field"), disableForReadonlyField),
    menuItemCmd(allCommands.hideCardFields, t("Hide field"), disableForReadonlyStructure),
    menuDivider(),
    canUseComments ?
      menuItemCmd(allCommands.openDiscussion,
        t("Comment"),
        dom.cls("disabled", isReadonly || isVirtual || isAddRow)) :
      null,
    menuItemCmd(allCommands.copyLink, t("Copy anchor link"), disabledForVirtual),
  ];
}
