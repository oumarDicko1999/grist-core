import { buildGuidedWorkspaceRowStateActions } from "app/client/ui/IkaDocGuidedWorkspaceRowStates";
import { IkaDocGuidedWorkspaceDescriptor, IkaDocGuidedWorkspaceResult } from "app/ikadoc/IkaDocGuidedWorkspace";

import { assert } from "chai";

describe("IkaDocGuidedWorkspaceRowStates", function() {
  it("builds validation row-state actions with conflict rows marked", function() {
    const actions = buildGuidedWorkspaceRowStateActions(
      guidedDescriptor(),
      guidedResult({
        success: false,
        errors: [
          {
            severity: "ERROR",
            schemaType: "folder",
            message: "Title conflict",
            tableId: "Records",
            gristRowId: 2,
            metadataCode: "title",
          },
        ],
        warnings: [],
        conflicts: [
          {
            rowKey: "row-key-3",
            targetRecordId: "00000000-0000-4000-8000-000000000703",
            metadataCode: "status",
            valuesRedacted: false,
            tableId: "Records",
            gristRowId: 3,
          },
        ],
      }),
      "validate",
      tableId => (tableId === "Records" ? [1, 2, 3] : []),
    );

    assert.deepEqual(actions, [
      [
        "BulkUpdateRecord",
        "Records",
        [1, 2, 3],
        { ikadoc_row_state: ["validated", "conflict", "conflict"] },
      ],
    ]);
  });

  it("builds apply row-state actions only as applied when the backend result succeeds", function() {
    const successActions = buildGuidedWorkspaceRowStateActions(
      guidedDescriptor(),
      guidedResult({ success: true }),
      "apply",
      tableId => (tableId === "Records" ? [1, 2] : []),
    );
    const failedActions = buildGuidedWorkspaceRowStateActions(
      guidedDescriptor(),
      guidedResult({ success: false }),
      "apply",
      tableId => (tableId === "Records" ? [1, 2] : []),
    );

    assert.deepEqual(successActions, [
      [
        "BulkUpdateRecord",
        "Records",
        [1, 2],
        { ikadoc_row_state: ["applied", "applied"] },
      ],
    ]);
    assert.deepEqual(failedActions, [
      [
        "BulkUpdateRecord",
        "Records",
        [1, 2],
        { ikadoc_row_state: ["validated", "validated"] },
      ],
    ]);
  });

  it("does not mark rows when blocking errors have no Grist row location", function() {
    const actions = buildGuidedWorkspaceRowStateActions(
      guidedDescriptor(),
      guidedResult({
        success: false,
        errors: [
          {
            severity: "ERROR",
            schemaType: "folder",
            message: "Import failed before row attribution",
          },
        ],
      }),
      "validate",
      tableId => (tableId === "Records" ? [1, 2] : []),
    );

    assert.deepEqual(actions, []);
  });
});

function guidedDescriptor(): IkaDocGuidedWorkspaceDescriptor {
  const schema = { code: "case", label: "Case", fullCode: "folder_case" };

  return {
    marker: {
      intent: "BULK_EDIT",
      targetCollectionCode: "records",
      targetSchemaType: "folder",
      targetSchemaCode: "folder_case",
      finalAction: "APPLY_TO_IKADOC",
      tableBindings: [{ tableId: "Records", targetSchemaCode: "folder_case" }],
    },
    schemaType: { code: "folder", label: "Folder" },
    schema,
    fields: [],
    protectedColumns: [],
    tables: [{ tableId: "Records", targetSchemaCode: "folder_case", schema, fields: [], protectedColumns: [] }],
  };
}

function guidedResult(overrides: Partial<IkaDocGuidedWorkspaceResult>): IkaDocGuidedWorkspaceResult {
  return {
    success: false,
    simulated: true,
    importedCounts: {},
    updatedCounts: {},
    errors: [],
    warnings: [],
    conflicts: [],
    ...overrides,
  };
}
