import {
  IkaDocGuidedWorkspaceDescriptor,
  IkaDocGuidedWorkspaceFieldDescriptor,
} from "app/ikadoc/IkaDocGuidedWorkspace";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

const GRIST_RESERVED_TABLE_PREFIX = "_grist_";
const GUIDED_TEXT_TYPE = "Text";
const GUIDED_CHOICE_TYPE = "Choice";
const GUIDED_CHOICE_LIST_TYPE = "ChoiceList";
const GUIDED_REFERENCE_WIDGET = "IkaDocReference";
const GUIDED_JSON_WIDGET = "IkaDocJson";
const GUIDED_WORKSPACE_WIDGET_OPTIONS_VERSION = 1;

export type GuidedWorkspaceSetupAction = (
  string | number | object | boolean | null | undefined
)[];

interface GuidedColumnInfo {
  id: string;
  type: string;
  isFormula: boolean;
  formula: string;
  label?: string;
  widgetOptions?: string;
}

type GuidedWorkspaceSetupField =
  | IkaDocGuidedWorkspaceFieldDescriptor |
  {
    code: string;
    label: string;
    columnLabel: string;
    readOnly: boolean;
    required: boolean;
    derived: boolean;
    sensitive: boolean;
    kind: string;
    editor: { kind: string; valueShape: string };
    multiValue: boolean;
    enumValues: readonly string[];
    reference?: null;
    json?: null;
  };

export function canPrepareGuidedWorkspaceTables(
  config: IkaDocRuntimeConfig,
): boolean {
  return (
    config.mode === "editor" &&
    config.capabilities.canEditStructure &&
    Boolean(config.guidedWorkspace)
  );
}

export interface ExistingGuidedWorkspaceTable {
  tableId: string;
  tableRef: number;
  columnIds: readonly string[];
  hasPageSection: boolean;
}

export function buildGuidedWorkspacePageSetupActions(
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  existingTables: readonly ExistingGuidedWorkspaceTable[],
): GuidedWorkspaceSetupAction[] {
  const existing = new Map(
    existingTables.map(table => [table.tableId, table]),
  );
  const actions: GuidedWorkspaceSetupAction[] = [];
  for (const table of descriptor.tables) {
    const existingTable = existing.get(table.tableId);
    if (existingTable && !existingTable.hasPageSection) {
      actions.push([
        "CreateViewSection",
        existingTable.tableRef,
        0,
        "table",
        null,
        null,
      ]);
    }
  }
  return actions;
}

export function buildGuidedWorkspaceSetupActions(
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  existingTables: readonly ExistingGuidedWorkspaceTable[],
): GuidedWorkspaceSetupAction[] {
  const existing = new Map(
    existingTables.map(table => [table.tableId, table]),
  );
  const actions: GuidedWorkspaceSetupAction[] = [];
  for (const table of descriptor.tables) {
    if (table.tableId.startsWith(GRIST_RESERVED_TABLE_PREFIX)) {
      throw new Error("Guided workspace table id is reserved");
    }
    const columns = guidedColumns([
      ...table.protectedColumns.map(column => ({
        code: column.code,
        label: column.label,
        columnLabel: column.label,
        readOnly: true,
        required: column.required,
        derived: false,
        sensitive: false,
        kind: GUIDED_TEXT_TYPE,
        editor: { kind: "protected", valueShape: "scalar" },
        multiValue: false,
        enumValues: [],
      })),
      ...table.fields,
    ]);
    const existingTable = existing.get(table.tableId);
    if (!existingTable) {
      actions.push(["AddTable", table.tableId, columns]);
      continue;
    }

    const existingColumnIds = new Set(existingTable.columnIds);
    for (const column of columns) {
      if (!existingColumnIds.has(column.id)) {
        actions.push(["AddColumn", table.tableId, column.id, column]);
      }
    }
    if (!existingTable.hasPageSection) {
      actions.push([
        "CreateViewSection",
        existingTable.tableRef,
        0,
        "table",
        null,
        null,
      ]);
    }
  }
  return actions;
}

function guidedColumns(
  fields: readonly GuidedWorkspaceSetupField[],
): GuidedColumnInfo[] {
  const columnIds = new Set<string>();
  const columns: GuidedColumnInfo[] = [];
  for (const field of fields) {
    if (columnIds.has(field.code)) {
      continue;
    }
    columnIds.add(field.code);
    columns.push({
      id: field.code,
      type: gristColumnType(field),
      isFormula: false,
      formula: "",
      label: field.columnLabel,
      widgetOptions: JSON.stringify(guidedColumnWidgetOptions(field)),
    });
  }
  return columns;
}

function guidedColumnWidgetOptions(
  field: GuidedWorkspaceSetupField,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    guidedWorkspace: true,
    guidedWorkspaceVersion: GUIDED_WORKSPACE_WIDGET_OPTIONS_VERSION,
    metadataCode: field.code,
    metadataLabel: field.label,
    editorKind: field.editor.kind,
    valueShape: field.editor.valueShape,
    readOnly: field.readOnly,
    required: field.required,
    derived: field.derived,
    sensitive: field.sensitive,
  };
  if (field.enumValues.length > 0) {
    options.choices = field.enumValues;
  }
  if (field.reference) {
    options.widget = GUIDED_REFERENCE_WIDGET;
    options.referencedTypeCode = field.reference.referencedTypeCode;
    options.allowedSchemaCodes = field.reference.allowedSchemaCodes;
  }
  if (field.json) {
    options.widget = GUIDED_JSON_WIDGET;
    options.payloadClass = field.json.payloadClass;
    options.jsonEditorKind = field.json.editorKind;
  }
  return options;
}

function gristColumnType(field: GuidedWorkspaceSetupField): string {
  if (field.kind === "enum" && field.multiValue) {
    return GUIDED_CHOICE_LIST_TYPE;
  }
  if (field.multiValue) {
    return GUIDED_TEXT_TYPE;
  }
  switch (field.kind) {
    case "integer":
      return "Int";
    case "decimal":
    case "percentage":
    case "currency-amount":
      return "Numeric";
    case "boolean":
      return "Bool";
    case "date":
      return "Date";
    case "datetime":
      return "DateTime";
    case "enum":
      return GUIDED_CHOICE_TYPE;
    default:
      return GUIDED_TEXT_TYPE;
  }
}
