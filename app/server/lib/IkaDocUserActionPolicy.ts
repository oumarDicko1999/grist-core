import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { deniedIkaDocRuntimeOperation, reportBlockedCapability } from "app/server/lib/IkaDocRuntimeDenial";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";

export type IkaDocCapabilityName = keyof IkaDocCapabilities;

/** Capabilities a viewer never has, whatever IkaDoc granted. */
const EDITOR_ONLY_CAPABILITIES = new Set<IkaDocCapabilityName>([
  "canEditCells",
  "canEditStructure",
  "canUseFormulas",
  "canCreateCharts",
  "canRefreshSource",
  "canSaveToIkaDoc",
  "canDiscard",
  "canUseComments",
  "canUseAttachments",
  "canUseExternalData",
  "canImportLocalFiles",
  "canUseCustomWidgets",
  "canInviteCollaborators",
  "canShare",
  "canFork",
  "canPublish",
  "canManageAccess",
  "canUsePlugins",
]);

/** Upstream's Widget Creator section type: a custom widget whose code is kept in the document. */
const WIDGET_CREATOR_TYPE = "creator";

const CELL_EDIT_ACTIONS = new Set([
  "AddRecord",
  "BulkAddRecord",
  "UpdateRecord",
  "BulkUpdateRecord",
  "RemoveRecord",
  "BulkRemoveRecord",
  "ReplaceTableData",
]);

/** Actions whose 4th element maps column ids to new values. */
const LOCKED_COLUMN_VALUE_ACTIONS = new Set([
  "AddRecord",
  "BulkAddRecord",
  "UpdateRecord",
  "BulkUpdateRecord",
]);

/** Actions whose 3rd element is the column they change or remove. */
const LOCKED_COLUMN_STRUCTURE_ACTIONS = new Set([
  "ModifyColumn",
  "RenameColumn",
  "RemoveColumn",
]);

/** Whether the session may use [capability]: granted by IkaDoc, and never an editor's in a viewer. */
export function isIkaDocCapabilityAllowed(
  session: IkaDocRuntimeSession,
  capability: IkaDocCapabilityName,
): boolean {
  if (session.config.mode !== "editor" && EDITOR_ONLY_CAPABILITIES.has(capability)) {
    return false;
  }

  return session.config.capabilities[capability];
}

/**
 * Refuses the batch unless the person may apply every action in it: each action needs its
 * capabilities (formulas, charts, structure, cells...), and none may touch IkaDoc's columns.
 */
export function assertIkaDocUserActionsAllowedForSession(
  session: IkaDocRuntimeSession,
  actions: unknown,
): void {
  if (!Array.isArray(actions)) {
    throw deniedIkaDocRuntimeOperation("apply malformed document edits", session);
  }

  for (const action of actions) {
    assertIkaDocUserActionAllowed(session, action);
  }
}

function assertIkaDocUserActionAllowed(
  session: IkaDocRuntimeSession,
  action: unknown,
): void {
  if (!Array.isArray(action) || typeof action[0] !== "string") {
    throw deniedIkaDocRuntimeOperation("apply malformed document edits", session);
  }

  const actionName = action[0];
  const tableId = typeof action[1] === "string" ? action[1] : undefined;
  const operation = `apply ${actionName}`;

  for (const capability of capabilitiesForUserAction(actionName, tableId, action)) {
    if (!isIkaDocCapabilityAllowed(session, capability)) {
      reportBlockedCapability(session, operation, undefined, { missingCapability: capability, actionName, tableId });
      throw deniedIkaDocRuntimeOperation(operation, session);
    }
  }

  const lockedColumn = touchedLockedColumn(session, actionName, tableId, action);
  if (lockedColumn) {
    throw deniedIkaDocRuntimeOperation(`change the IkaDoc column ${lockedColumn}`, session);
  }
}

/**
 * GW-RFR-03: columns IkaDoc owns change only through IkaDoc (service account).
 * Returns the first locked column the action writes or restructures.
 */
function touchedLockedColumn(
  session: IkaDocRuntimeSession,
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): string | undefined {
  const locked = tableId ? session.config.lockedColumns?.[tableId] : undefined;
  if (!locked?.length) {
    return undefined;
  }

  if (LOCKED_COLUMN_STRUCTURE_ACTIONS.has(actionName)) {
    const columnId = action[2];

    return typeof columnId === "string" && locked.includes(columnId) ? columnId : undefined;
  }

  if (LOCKED_COLUMN_VALUE_ACTIONS.has(actionName)) {
    const values = action[3];
    if (!values || typeof values !== "object") {
      return undefined;
    }

    return Object.keys(values).find(columnId => locked.includes(columnId));
  }

  return undefined;
}

/** The capabilities an action needs, most specific first: the first match decides. */
function capabilitiesForUserAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): IkaDocCapabilityName[] {
  if (isFormulaAction(actionName, tableId, action)) {
    return ["canUseFormulas", "canEditStructure"];
  }

  if (tableId?.startsWith("_grist_ACL")) {
    return ["canManageAccess"];
  }

  if (tableId === "_grist_Attachments") {
    return ["canUseAttachments"];
  }

  if (tableId === "_grist_Cells") {
    return ["canUseComments"];
  }

  if (tableId === "_grist_Triggers" || tableId === "_grist_Webhooks") {
    return ["canUseExternalData"];
  }

  if (isCustomWidgetAction(actionName, tableId, action)) {
    return ["canUseCustomWidgets", "canEditStructure"];
  }

  if (isChartUserAction(actionName, tableId, action)) {
    return ["canCreateCharts", "canEditStructure"];
  }

  if (tableId?.startsWith("_grist_")) {
    return ["canEditStructure"];
  }

  if (CELL_EDIT_ACTIONS.has(actionName)) {
    return ["canEditCells"];
  }

  return ["canEditStructure"];
}

function isFormulaAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): boolean {
  const isColumnChange = actionName === "AddColumn" || actionName === "ModifyColumn" ||
    actionName === "AddVisibleColumn";
  if (isColumnChange) {
    return hasFormulaFields(action[3]);
  }

  if (actionName === "AddTable") {
    return Array.isArray(action[2]) && action[2].some(hasFormulaFields);
  }

  // Formulas can also be written straight into column and validation metadata.
  const isMetadataWrite = ["AddRecord", "UpdateRecord", "BulkAddRecord", "BulkUpdateRecord"].includes(actionName);
  const isFormulaMetadata = tableId === "_grist_Tables_column" || tableId === "_grist_Validations";

  return isMetadataWrite && isFormulaMetadata && hasFormulaFields(action[3]);
}

function hasFormulaFields(values: unknown): boolean {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }

  return "formula" in values || "isFormula" in values || "recalcWhen" in values || "recalcDeps" in values;
}

/**
 * Custom widgets run their own code in the page: a `custom` section, and a Widget Creator (`creator`)
 * section, whose HTML and JavaScript are kept in the section's `options.html`.
 */
function isCustomWidgetAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): boolean {
  if (actionName === "CreateViewSection") {
    return typeof action[3] === "string" && isCustomWidgetType(action[3]);
  }

  const values = action[3];
  if (tableId !== "_grist_Views_section" || !values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }

  return hasCustomWidgetParentKey(values) || hasCustomWidgetOptions(values);
}

function hasCustomWidgetParentKey(values: object): boolean {
  if (!("parentKey" in values)) {
    return false;
  }

  const parentKeys = Array.isArray(values.parentKey) ? values.parentKey : [values.parentKey];

  return parentKeys.some(key => typeof key === "string" && isCustomWidgetType(key));
}

/** `custom` and its variants are custom widgets; the native calendar is `calendar`, not `custom.calendar`. */
function isCustomWidgetType(sectionType: string): boolean {
  return sectionType === "custom" || sectionType.startsWith("custom.") || sectionType === WIDGET_CREATOR_TYPE;
}

function hasCustomWidgetOptions(values: object): boolean {
  if (!("options" in values)) {
    return false;
  }

  const options = Array.isArray(values.options) ? values.options : [values.options];

  return options.some(option => typeof option === "string" && optionsContainCustomWidget(option));
}

/**
 * Section options declare a custom widget with `customView`, or carry a Widget Creator's code in
 * `html`; unparseable options are treated as one.
 */
function optionsContainCustomWidget(options: string): boolean {
  if (!options.includes("customView") && !options.includes("html")) {
    return false;
  }

  try {
    const parsed = JSON.parse(options);
    const isObject = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));

    return isObject && ("customView" in parsed || "html" in parsed);
  } catch {
    return true;
  }
}

function isChartUserAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): boolean {
  if (actionName === "CreateViewSection") {
    return action[3] === "chart";
  }

  const values = action[3];
  if (tableId !== "_grist_Views_section" || !values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }

  const parentKeys = "parentKey" in values ?
    (Array.isArray(values.parentKey) ? values.parentKey : [values.parentKey]) :
    [];

  return parentKeys.includes("chart") || "chartType" in values;
}
