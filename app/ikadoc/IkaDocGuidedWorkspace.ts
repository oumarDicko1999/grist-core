export type IkaDocGuidedWorkspaceIntent =
  "RECORD_CREATION" | "RECORD_IMPORT" | "BULK_EDIT" | "BULK_WRITE";

export type IkaDocGuidedWorkspaceFinalAction =
  "EXPORT_TO_OWARELIN" | "APPLY_TO_IKADOC";

export interface IkaDocGuidedWorkspaceMarker {
  intent: IkaDocGuidedWorkspaceIntent;
  targetCollectionCode: string;
  targetSchemaType: string;
  targetSchemaCode?: string | null;
  finalAction: IkaDocGuidedWorkspaceFinalAction;
}

export interface IkaDocGuidedWorkspaceDescriptor {
  marker: IkaDocGuidedWorkspaceMarker;
  schemaType: IkaDocGuidedWorkspaceNamedDescriptor;
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

  return {
    intent: input.intent as IkaDocGuidedWorkspaceIntent,
    targetCollectionCode: input.targetCollectionCode,
    targetSchemaType: input.targetSchemaType,
    targetSchemaCode: input.targetSchemaCode ?? null,
    finalAction: input.finalAction as IkaDocGuidedWorkspaceFinalAction,
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
  if (
    fields.some(field => !field) ||
    protectedColumns.some(column => !column)
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
