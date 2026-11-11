import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import {
  buildGuidedWorkspacePageSetupActions,
  buildGuidedWorkspaceSetupActions,
  canPrepareGuidedWorkspaceTables,
} from "app/ikadoc/IkaDocGuidedWorkspaceSetup";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { assert } from "chai";

describe("IkaDocGuidedWorkspaceSetup", function() {
  it("builds AddTable actions for missing guided descriptor tables", function() {
    const actions = buildGuidedWorkspaceSetupActions(guidedDescriptor(), []);

    assert.equal(actions.length, 1);
    assert.equal(actions[0][0], "AddTable");
    assert.equal(actions[0][1], "folder_case");
    const columns = actions[0][2] as GuidedColumn[];
    assert.deepEqual(
      columns.map(column => [column.id, column.type, column.label]),
      [
        ["ikadoc_row_key", "Text", "Row key"],
        ["title", "Text", "Title (title)"],
        ["openedAt", "Date", "Opened at (openedAt)"],
        ["status", "Choice", "Status (status)"],
        ["audiences", "ChoiceList", "Audiences (audiences)"],
        ["owner", "Text", "Owner (owner)"],
        ["retention", "Text", "Retention rule (retention)"],
      ],
    );
  });

  it("preserves guided editor metadata in column widget options", function() {
    const actions = buildGuidedWorkspaceSetupActions(guidedDescriptor(), []);
    const columns = actions[0][2] as GuidedColumn[];

    assert.deepInclude(columnOptions(columns, "ikadoc_row_key"), {
      guidedWorkspace: true,
      guidedWorkspaceVersion: 1,
      metadataCode: "ikadoc_row_key",
      readOnly: true,
      required: true,
      editorKind: "protected",
    });
    assert.deepInclude(columnOptions(columns, "status"), {
      guidedWorkspace: true,
      guidedWorkspaceVersion: 1,
      metadataCode: "status",
      editorKind: "enum-select",
      valueShape: "scalar",
      readOnly: false,
      required: false,
    });
    assert.deepEqual(columnOptions(columns, "status").choices, [
      "Open",
      "Closed",
    ]);
    assert.deepInclude(columnOptions(columns, "owner"), {
      widget: "IkaDocReference",
      referencedTypeCode: "user",
    });
    assert.deepEqual(columnOptions(columns, "owner").allowedSchemaCodes, [
      "user.internal",
    ]);
    assert.deepInclude(columnOptions(columns, "retention"), {
      widget: "IkaDocJson",
      payloadClass: "RetentionSchedule",
      jsonEditorKind: "retention-rule",
    });
  });

  it("does not recreate complete guided tables already present in the document", function() {
    const actions = buildGuidedWorkspaceSetupActions(guidedDescriptor(), [
      existingTable({
        columnIds: [
          "ikadoc_row_key",
          "title",
          "openedAt",
          "status",
          "audiences",
          "owner",
          "retention",
        ],
        hasPageSection: true,
      }),
    ]);

    assert.deepEqual(actions, []);
  });

  it("adds only missing guided columns for existing tables", function() {
    const actions = buildGuidedWorkspaceSetupActions(guidedDescriptor(), [
      existingTable({
        columnIds: ["ikadoc_row_key", "title"],
        hasPageSection: true,
      }),
    ]);

    assert.deepEqual(addColumnSummaries(actions), [
      ["folder_case", "openedAt", "Date"],
      ["folder_case", "status", "Choice"],
      ["folder_case", "audiences", "ChoiceList"],
      ["folder_case", "owner", "Text"],
      ["folder_case", "retention", "Text"],
    ]);
  });

  it("adds one page section for existing guided tables without a visible page", function() {
    const actions = buildGuidedWorkspaceSetupActions(guidedDescriptor(), [
      existingTable({
        tableRef: 17,
        columnIds: [
          "ikadoc_row_key",
          "title",
          "openedAt",
          "status",
          "audiences",
          "owner",
          "retention",
        ],
        hasPageSection: false,
      }),
    ]);

    assert.deepEqual(actions, [
      ["CreateViewSection", 17, 0, "table", null, null],
    ]);
  });

  it("builds page-only actions after guided tables are created", function() {
    const actions = buildGuidedWorkspacePageSetupActions(guidedDescriptor(), [
      existingTable({
        tableRef: 17,
        columnIds: ["ikadoc_row_key", "title"],
        hasPageSection: false,
      }),
    ]);

    assert.deepEqual(actions, [
      ["CreateViewSection", 17, 0, "table", null, null],
    ]);
  });

  it("rejects reserved Grist internal table ids", function() {
    assert.throws(
      () =>
        buildGuidedWorkspaceSetupActions(
          {
            ...guidedDescriptor(),
            tables: [
              {
                ...guidedDescriptor().tables[0],
                tableId: "_grist_Views",
              },
            ],
          },
          [],
        ),
      "Guided workspace table id is reserved",
    );
  });

  it("prepares tables only for editor sessions with structure capability", function() {
    assert.equal(
      canPrepareGuidedWorkspaceTables(
        runtimeConfig({ canEditStructure: true }),
      ),
      true,
    );
    assert.equal(
      canPrepareGuidedWorkspaceTables({
        ...runtimeConfig({ canEditStructure: true }),
        mode: "viewer",
      }),
      false,
    );
    assert.equal(canPrepareGuidedWorkspaceTables(runtimeConfig()), false);
  });
});

function guidedDescriptor() {
  return {
    marker: {
      intent: "RECORD_CREATION" as const,
      targetCollectionCode: "records",
      targetSchemaType: "folder",
      targetSchemaCode: "folder.case",
      finalAction: "APPLY_TO_IKADOC" as const,
      tableBindings: [
        { tableId: "folder_case", targetSchemaCode: "folder.case" },
      ],
    },
    schemaType: { code: "folder", label: "Folder" },
    schema: { code: "case", fullCode: "folder.case", label: "Case" },
    fields: [],
    protectedColumns: [],
    tables: [
      {
        tableId: "folder_case",
        targetSchemaCode: "folder.case",
        schema: { code: "case", fullCode: "folder.case", label: "Case" },
        fields: [
          {
            code: "title",
            label: "Title",
            columnLabel: "Title (title)",
            kind: "string",
            editor: { kind: "text-input", valueShape: "scalar" },
            multiValue: false,
            required: true,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: [],
          },
          {
            code: "openedAt",
            label: "Opened at",
            columnLabel: "Opened at (openedAt)",
            kind: "date",
            editor: { kind: "date-picker", valueShape: "scalar" },
            multiValue: false,
            required: false,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: [],
          },
          {
            code: "status",
            label: "Status",
            columnLabel: "Status (status)",
            kind: "enum",
            editor: { kind: "enum-select", valueShape: "scalar" },
            multiValue: false,
            required: false,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: ["Open", "Closed"],
          },
          {
            code: "audiences",
            label: "Audiences",
            columnLabel: "Audiences (audiences)",
            kind: "enum",
            editor: { kind: "enum-multi-select", valueShape: "list" },
            multiValue: true,
            required: false,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: ["Clinical", "Legal"],
          },
          {
            code: "owner",
            label: "Owner",
            columnLabel: "Owner (owner)",
            kind: "reference",
            editor: { kind: "reference-picker", valueShape: "scalar" },
            multiValue: false,
            required: false,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: [],
            reference: {
              referencedTypeCode: "user",
              allowedSchemaCodes: ["user.internal"],
            },
          },
          {
            code: "retention",
            label: "Retention rule",
            columnLabel: "Retention rule (retention)",
            kind: "json",
            editor: { kind: "json-retention", valueShape: "object" },
            multiValue: false,
            required: false,
            readOnly: false,
            derived: false,
            sensitive: false,
            visibility: "FORM_AND_DISPLAY",
            enumValues: [],
            json: {
              payloadClass: "RetentionSchedule",
              editorKind: "retention-rule",
            },
          },
        ],
        protectedColumns: [
          {
            code: "ikadoc_row_key",
            label: "Row key",
            required: true,
            readOnly: true,
          },
        ],
      },
    ],
  };
}

function existingTable(overrides = {}) {
  return {
    tableId: "folder_case",
    tableRef: 3,
    columnIds: [],
    hasPageSection: false,
    ...overrides,
  };
}

function runtimeConfig(capabilities = {}) {
  return {
    enabled: true as const,
    sessionId: "session-1",
    collectionCode: "records",
    user: {
      userId: "user-1",
      username: "alice",
      displayName: "Alice",
    },
    sourceType: "document-file" as const,
    mode: "editor" as const,
    expiresAt: "2099-01-01T00:00:00.000Z",
    documentId: "doc-1",
    documentUrlId: "doc-url-1",
    workerUrl: "/worker",
    statusUrl: "/status",
    validationUrl: "/validation",
    validationToken: "validation-token",
    discardUrl: "/discard",
    guidedWorkspace: guidedDescriptor().marker,
    capabilities: { ...DENIED_IKADOC_CAPABILITIES, ...capabilities },
    locale: "en",
    appearance: "light" as const,
  } satisfies IkaDocRuntimeConfig;
}

interface GuidedColumn {
  id: string;
  type: string;
  label: string;
  widgetOptions: string;
}

function columnOptions(
  columns: readonly GuidedColumn[],
  columnId: string,
): Record<string, unknown> {
  const column = columns.find(candidate => candidate.id === columnId);
  if (!column) {
    assert.fail(`missing guided column ${columnId}`);
  }
  return JSON.parse(column.widgetOptions);
}

function addColumnSummaries(
  actions: readonly (readonly unknown[])[],
): string[][] {
  return actions.map((action) => {
    const tableId = action[1];
    const columnId = action[2];
    const options = action[3];
    const columnType = (options as { type?: unknown } | undefined)?.type;
    if (
      action[0] !== "AddColumn" ||
      typeof tableId !== "string" ||
      typeof columnId !== "string" ||
      typeof columnType !== "string"
    ) {
      assert.fail(`unexpected guided column action ${JSON.stringify(action)}`);
    }
    return [tableId, columnId, columnType];
  });
}
