export type IkaDocGuidedWorkspaceIntent =
  "RECORD_CREATION" | "RECORD_IMPORT" | "BULK_EDIT" | "BULK_WRITE";

export type IkaDocGuidedWorkspaceFinalAction =
  "EXPORT_TO_OWARELIN" | "APPLY_TO_IKADOC";

export interface IkaDocGuidedWorkspaceTableBinding {
  tableId: string;
  targetSchemaCode: string;
}

export interface IkaDocGuidedWorkspaceMarker {
  intent: IkaDocGuidedWorkspaceIntent;
  targetCollectionCode: string;
  targetSchemaType: string;
  targetSchemaCode?: string | null;
  finalAction: IkaDocGuidedWorkspaceFinalAction;
  tableBindings: readonly IkaDocGuidedWorkspaceTableBinding[];
}

export interface IkaDocGuidedWorkspaceDescriptor {
  marker: IkaDocGuidedWorkspaceMarker;
  schemaType: IkaDocGuidedWorkspaceNamedDescriptor;
  schema: IkaDocGuidedWorkspaceSchemaDescriptor;
  fields: readonly IkaDocGuidedWorkspaceFieldDescriptor[];
  protectedColumns: readonly IkaDocGuidedWorkspaceProtectedColumnDescriptor[];
  tables: readonly IkaDocGuidedWorkspaceTableDescriptor[];
}

export interface IkaDocGuidedWorkspaceTableDescriptor {
  tableId: string;
  targetSchemaCode: string;
  schema: IkaDocGuidedWorkspaceSchemaDescriptor;
  fields: readonly IkaDocGuidedWorkspaceFieldDescriptor[];
  protectedColumns: readonly IkaDocGuidedWorkspaceProtectedColumnDescriptor[];
}

export interface IkaDocGuidedWorkspaceNamedDescriptor {
  code: string;
  label: string;
}

export interface IkaDocGuidedWorkspaceSchemaDescriptor extends IkaDocGuidedWorkspaceNamedDescriptor {
  fullCode: string;
}

export interface IkaDocGuidedWorkspaceFieldDescriptor {
  code: string;
  label: string;
  columnLabel: string;
  kind: string;
  editor: IkaDocGuidedWorkspaceFieldEditorDescriptor;
  multiValue: boolean;
  required: boolean;
  readOnly: boolean;
  derived: boolean;
  sensitive: boolean;
  visibility: string;
  section?: string | null;
  defaultValue?: unknown;
  reference?: IkaDocGuidedWorkspaceReferenceDescriptor | null;
  enumValues: readonly string[];
  json?: IkaDocGuidedWorkspaceJsonDescriptor | null;
}

export interface IkaDocGuidedWorkspaceFieldEditorDescriptor {
  kind: string;
  valueShape: string;
}

export interface IkaDocGuidedWorkspaceReferenceDescriptor {
  referencedTypeCode: string;
  allowedSchemaCodes: readonly string[];
}

export interface IkaDocGuidedWorkspaceJsonDescriptor {
  payloadClass: string;
  editorKind: string;
}

export interface IkaDocGuidedWorkspaceProtectedColumnDescriptor {
  code: string;
  label: string;
  required: boolean;
  readOnly: boolean;
}

export interface IkaDocGuidedWorkspaceResult {
  success: boolean;
  simulated: boolean;
  importedCounts: Readonly<Record<string, number>>;
  updatedCounts: Readonly<Record<string, number>>;
  errors: readonly IkaDocGuidedWorkspaceIssue[];
  warnings: readonly IkaDocGuidedWorkspaceIssue[];
  conflicts: readonly IkaDocGuidedWorkspaceCellConflict[];
}

export interface IkaDocGuidedWorkspaceCellConflict {
  rowKey: string;
  targetRecordId: string;
  metadataCode: string;
  originalValue?: unknown;
  proposedValue?: unknown;
  currentValue?: unknown;
  valuesRedacted: boolean;
  tableId?: string | null;
  targetSchemaCode?: string | null;
  gristRowId?: number | null;
}

export type IkaDocGuidedWorkspaceIssueSeverity = "ERROR" | "WARNING";

export interface IkaDocGuidedWorkspaceIssue {
  schemaType: string;
  message: string;
  severity?: IkaDocGuidedWorkspaceIssueSeverity | null;
  recordId?: string | null;
  rowKey?: string | null;
  row?: number | null;
  tableId?: string | null;
  gristRowId?: number | null;
  column?: string | null;
  metadataCode?: string | null;
  value?: string | null;
  suggestions?: readonly string[] | null;
}

const GUIDED_WORKSPACE_INTENTS: ReadonlySet<IkaDocGuidedWorkspaceIntent> =
  new Set(["RECORD_CREATION", "RECORD_IMPORT", "BULK_EDIT", "BULK_WRITE"]);

const GUIDED_WORKSPACE_FINAL_ACTIONS: ReadonlySet<IkaDocGuidedWorkspaceFinalAction> =
  new Set(["EXPORT_TO_OWARELIN", "APPLY_TO_IKADOC"]);

export function parseIkaDocGuidedWorkspaceMarker(
  input: unknown,
): IkaDocGuidedWorkspaceMarker | undefined {
  if (!isObject(input)) {
    return undefined;
  }
  if (
    typeof input.intent !== "string" ||
    !GUIDED_WORKSPACE_INTENTS.has(
      input.intent as IkaDocGuidedWorkspaceIntent,
    ) ||
    typeof input.targetCollectionCode !== "string" ||
    input.targetCollectionCode.length === 0 ||
    typeof input.targetSchemaType !== "string" ||
    input.targetSchemaType.length === 0 ||
    typeof input.finalAction !== "string" ||
    !GUIDED_WORKSPACE_FINAL_ACTIONS.has(
      input.finalAction as IkaDocGuidedWorkspaceFinalAction,
    )
  ) {
    return undefined;
  }
  if (
    input.targetSchemaCode !== undefined &&
    input.targetSchemaCode !== null &&
    typeof input.targetSchemaCode !== "string"
  ) {
    return undefined;
  }

  const tableBindings = parseTableBindings(input.tableBindings);
  if (!tableBindings) {
    return undefined;
  }

  return {
    intent: input.intent as IkaDocGuidedWorkspaceIntent,
    targetCollectionCode: input.targetCollectionCode,
    targetSchemaType: input.targetSchemaType,
    targetSchemaCode: input.targetSchemaCode ?? null,
    finalAction: input.finalAction as IkaDocGuidedWorkspaceFinalAction,
    tableBindings,
  };
}

export function parseIkaDocGuidedWorkspaceDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceDescriptor | undefined {
  if (!isObject(input)) {
    return undefined;
  }
  const marker = parseIkaDocGuidedWorkspaceMarker(input.marker);
  const schemaType = parseNamedDescriptor(input.schemaType);
  const schema = parseSchemaDescriptor(input.schema);
  if (
    !marker ||
    !schemaType ||
    !schema ||
    !Array.isArray(input.fields) ||
    !Array.isArray(input.protectedColumns)
  ) {
    return undefined;
  }

  const fields = input.fields.map(parseFieldDescriptor);
  const protectedColumns = input.protectedColumns.map(
    parseProtectedColumnDescriptor,
  );
  const tables = parseTableDescriptors(input.tables);
  if (
    fields.some(field => !field) ||
    protectedColumns.some(column => !column) ||
    !tables
  ) {
    return undefined;
  }

  return {
    marker,
    schemaType,
    schema,
    fields: fields as IkaDocGuidedWorkspaceFieldDescriptor[],
    protectedColumns:
      protectedColumns as IkaDocGuidedWorkspaceProtectedColumnDescriptor[],
    tables,
  };
}

export function parseIkaDocGuidedWorkspaceResult(
  input: unknown,
): IkaDocGuidedWorkspaceResult | undefined {
  if (
    !isObject(input) ||
    typeof input.success !== "boolean" ||
    typeof input.simulated !== "boolean"
  ) {
    return undefined;
  }
  const importedCounts = parseCountMap(input.importedCounts);
  const updatedCounts = parseCountMap(input.updatedCounts);
  const errors = parseGuidedIssues(input.errors);
  const warnings = parseGuidedIssues(input.warnings);
  const conflicts = parseGuidedConflicts(input.conflicts);
  if (!importedCounts || !updatedCounts || !errors || !warnings || !conflicts) {
    return undefined;
  }
  return {
    success: input.success,
    simulated: input.simulated,
    importedCounts,
    updatedCounts,
    errors,
    warnings,
    conflicts,
  };
}

function parseTableBindings(
  input: unknown,
): readonly IkaDocGuidedWorkspaceTableBinding[] | undefined {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const bindings = input.map(parseTableBinding);
  if (bindings.some(binding => !binding)) {
    return undefined;
  }
  return bindings as IkaDocGuidedWorkspaceTableBinding[];
}

function parseTableBinding(
  input: unknown,
): IkaDocGuidedWorkspaceTableBinding | undefined {
  if (
    !isObject(input) ||
    typeof input.tableId !== "string" ||
    input.tableId.length === 0 ||
    typeof input.targetSchemaCode !== "string" ||
    input.targetSchemaCode.length === 0
  ) {
    return undefined;
  }
  return {
    tableId: input.tableId,
    targetSchemaCode: input.targetSchemaCode,
  };
}

function parseTableDescriptors(
  input: unknown,
): readonly IkaDocGuidedWorkspaceTableDescriptor[] | undefined {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const tables = input.map(parseTableDescriptor);
  if (tables.some(table => !table)) {
    return undefined;
  }
  return tables as IkaDocGuidedWorkspaceTableDescriptor[];
}

function parseTableDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceTableDescriptor | undefined {
  if (
    !isObject(input) ||
    typeof input.tableId !== "string" ||
    input.tableId.length === 0 ||
    typeof input.targetSchemaCode !== "string" ||
    input.targetSchemaCode.length === 0 ||
    !Array.isArray(input.fields) ||
    !Array.isArray(input.protectedColumns)
  ) {
    return undefined;
  }

  const schema = parseSchemaDescriptor(input.schema);
  const fields = input.fields.map(parseFieldDescriptor);
  const protectedColumns = input.protectedColumns.map(
    parseProtectedColumnDescriptor,
  );
  if (
    !schema ||
    fields.some(field => !field) ||
    protectedColumns.some(column => !column)
  ) {
    return undefined;
  }

  return {
    tableId: input.tableId,
    targetSchemaCode: input.targetSchemaCode,
    schema,
    fields: fields as IkaDocGuidedWorkspaceFieldDescriptor[],
    protectedColumns:
      protectedColumns as IkaDocGuidedWorkspaceProtectedColumnDescriptor[],
  };
}

function parseNamedDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceNamedDescriptor | undefined {
  if (
    !isObject(input) ||
    typeof input.code !== "string" ||
    typeof input.label !== "string"
  ) {
    return undefined;
  }
  return { code: input.code, label: input.label };
}

function parseSchemaDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceSchemaDescriptor | undefined {
  const descriptor = parseNamedDescriptor(input);
  if (!descriptor || !isObject(input) || typeof input.fullCode !== "string") {
    return undefined;
  }
  return { ...descriptor, fullCode: input.fullCode };
}

function parseFieldDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceFieldDescriptor | undefined {
  if (
    !isObject(input) ||
    typeof input.code !== "string" ||
    typeof input.label !== "string" ||
    typeof input.columnLabel !== "string" ||
    typeof input.kind !== "string" ||
    typeof input.multiValue !== "boolean" ||
    typeof input.required !== "boolean" ||
    typeof input.readOnly !== "boolean" ||
    typeof input.derived !== "boolean" ||
    typeof input.sensitive !== "boolean" ||
    typeof input.visibility !== "string" ||
    !isObject(input.editor) ||
    typeof input.editor.kind !== "string" ||
    typeof input.editor.valueShape !== "string" ||
    !Array.isArray(input.enumValues) ||
    input.enumValues.some(value => typeof value !== "string")
  ) {
    return undefined;
  }

  const reference = parseReferenceDescriptor(input.reference);
  const json = parseJsonDescriptor(input.json);
  if (reference === "invalid" || json === "invalid") {
    return undefined;
  }
  if (
    input.section !== undefined &&
    input.section !== null &&
    typeof input.section !== "string"
  ) {
    return undefined;
  }

  return {
    code: input.code,
    label: input.label,
    columnLabel: input.columnLabel,
    kind: input.kind,
    editor: {
      kind: input.editor.kind,
      valueShape: input.editor.valueShape,
    },
    multiValue: input.multiValue,
    required: input.required,
    readOnly: input.readOnly,
    derived: input.derived,
    sensitive: input.sensitive,
    visibility: input.visibility,
    section: input.section ?? null,
    defaultValue: input.defaultValue,
    reference,
    enumValues: input.enumValues,
    json,
  };
}

function parseReferenceDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceReferenceDescriptor | null | "invalid" {
  if (input === undefined || input === null) {
    return null;
  }
  if (
    !isObject(input) ||
    typeof input.referencedTypeCode !== "string" ||
    !Array.isArray(input.allowedSchemaCodes) ||
    input.allowedSchemaCodes.some(value => typeof value !== "string")
  ) {
    return "invalid";
  }
  return {
    referencedTypeCode: input.referencedTypeCode,
    allowedSchemaCodes: input.allowedSchemaCodes,
  };
}

function parseCountMap(
  input: unknown,
): Readonly<Record<string, number>> | undefined {
  if (input === undefined || input === null) {
    return {};
  }
  if (!isObject(input)) {
    return undefined;
  }
  const entries = Object.entries(input);
  if (
    entries.some(
      ([key, value]) =>
        key.length === 0 ||
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0,
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, number>>;
}

function parseGuidedConflicts(
  input: unknown,
): readonly IkaDocGuidedWorkspaceCellConflict[] | undefined {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const conflicts = input.map(parseGuidedConflict);
  if (conflicts.some(conflict => !conflict)) {
    return undefined;
  }
  return conflicts as IkaDocGuidedWorkspaceCellConflict[];
}

function parseGuidedConflict(
  input: unknown,
): IkaDocGuidedWorkspaceCellConflict | undefined {
  if (
    !isObject(input) ||
    typeof input.rowKey !== "string" ||
    input.rowKey.length === 0 ||
    typeof input.targetRecordId !== "string" ||
    input.targetRecordId.length === 0 ||
    typeof input.metadataCode !== "string" ||
    input.metadataCode.length === 0 ||
    typeof input.valuesRedacted !== "boolean" ||
    !isOptionalString(input.tableId) ||
    !isOptionalString(input.targetSchemaCode) ||
    !isOptionalPositiveInteger(input.gristRowId)
  ) {
    return undefined;
  }
  return {
    rowKey: input.rowKey,
    targetRecordId: input.targetRecordId,
    metadataCode: input.metadataCode,
    originalValue: input.originalValue,
    proposedValue: input.proposedValue,
    currentValue: input.currentValue,
    valuesRedacted: input.valuesRedacted,
    tableId: typeof input.tableId === "string" ? input.tableId : null,
    targetSchemaCode:
      typeof input.targetSchemaCode === "string" ?
        input.targetSchemaCode :
        null,
    gristRowId: typeof input.gristRowId === "number" ? input.gristRowId : null,
  };
}

function parseGuidedIssues(
  input: unknown,
): readonly IkaDocGuidedWorkspaceIssue[] | undefined {
  if (input === undefined || input === null) {
    return [];
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  const issues = input.map(parseGuidedIssue);
  if (issues.some(issue => !issue)) {
    return undefined;
  }
  return issues as IkaDocGuidedWorkspaceIssue[];
}

function parseGuidedIssue(
  input: unknown,
): IkaDocGuidedWorkspaceIssue | undefined {
  if (
    !isObject(input) ||
    typeof input.schemaType !== "string" ||
    input.schemaType.length === 0 ||
    typeof input.message !== "string" ||
    input.message.length === 0 ||
    !isOptionalIssueSeverity(input.severity) ||
    !isOptionalString(input.recordId) ||
    !isOptionalString(input.rowKey) ||
    !isOptionalString(input.tableId) ||
    !isOptionalString(input.column) ||
    !isOptionalString(input.metadataCode) ||
    !isOptionalString(input.value) ||
    !isOptionalPositiveInteger(input.row) ||
    !isOptionalPositiveInteger(input.gristRowId)
  ) {
    return undefined;
  }
  const severity =
    input.severity === "ERROR" || input.severity === "WARNING" ?
      input.severity :
      null;
  const recordId = input.recordId;
  const rowKey = input.rowKey;
  const row = input.row;
  const tableId = input.tableId;
  const gristRowId = input.gristRowId;
  const column = input.column;
  const metadataCode = input.metadataCode;
  const value = input.value;
  const suggestions = parseOptionalStringList(input.suggestions);
  if (suggestions === "invalid") {
    return undefined;
  }
  return {
    schemaType: input.schemaType,
    message: input.message,
    severity,
    recordId: typeof recordId === "string" ? recordId : null,
    rowKey: typeof rowKey === "string" ? rowKey : null,
    row: typeof row === "number" ? row : null,
    tableId: typeof tableId === "string" ? tableId : null,
    gristRowId: typeof gristRowId === "number" ? gristRowId : null,
    column: typeof column === "string" ? column : null,
    metadataCode: typeof metadataCode === "string" ? metadataCode : null,
    value: typeof value === "string" ? value : null,
    suggestions,
  };
}

function isOptionalIssueSeverity(input: unknown): boolean {
  return (
    input === undefined ||
    input === null ||
    input === "ERROR" ||
    input === "WARNING"
  );
}

function isOptionalString(input: unknown): boolean {
  return input === undefined || input === null || typeof input === "string";
}

function isOptionalPositiveInteger(input: unknown): boolean {
  return (
    input === undefined ||
    input === null ||
    (typeof input === "number" && Number.isInteger(input) && input > 0)
  );
}

function parseOptionalStringList(
  input: unknown,
): readonly string[] | null | "invalid" {
  if (input === undefined || input === null) {
    return null;
  }
  if (
    !Array.isArray(input) ||
    input.some(value => typeof value !== "string")
  ) {
    return "invalid";
  }
  return input;
}

function parseJsonDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceJsonDescriptor | null | "invalid" {
  if (input === undefined || input === null) {
    return null;
  }
  if (
    !isObject(input) ||
    typeof input.payloadClass !== "string" ||
    typeof input.editorKind !== "string"
  ) {
    return "invalid";
  }
  return {
    payloadClass: input.payloadClass,
    editorKind: input.editorKind,
  };
}

function parseProtectedColumnDescriptor(
  input: unknown,
): IkaDocGuidedWorkspaceProtectedColumnDescriptor | undefined {
  if (
    !isObject(input) ||
    typeof input.code !== "string" ||
    typeof input.label !== "string" ||
    typeof input.required !== "boolean" ||
    typeof input.readOnly !== "boolean"
  ) {
    return undefined;
  }
  return {
    code: input.code,
    label: input.label,
    required: input.required,
    readOnly: input.readOnly,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
