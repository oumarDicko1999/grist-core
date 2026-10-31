import { setGlobals } from "app/client/lib/browserGlobals";
import {
  admitExistingGuidedWorkspaceRows,
  allocateGuidedWorkspaceRows,
  buildGuidedWorkspaceAdmissionActions,
  buildGuidedWorkspaceRowStateActions,
  IkaDocGuidedWorkspaceRowsError,
  ikaDocPasteActions,
  mergeGuidedWorkspaceProtectedValues,
  requireGuidedWorkspaceAllocatedRows,
} from "app/client/ui/IkaDocGuidedWorkspaceRows";
import { UserAction } from "app/common/DocActions";
import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocGuidedWorkspaceDescriptor,
  IkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";

import { assert } from "chai";

describe("IkaDocGuidedWorkspaceRows", function() {
  it("leaves paste actions unchanged outside a guided workspace", async function() {
    const actions: UserAction[] = [
      ["BulkAddRecord", [null, null], { title: ["A", "B"] }],
      ["BulkUpdateRecord", [3], { title: ["C"] }],
    ];

    const writableGlobal = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
    const oldWindow = writableGlobal.window;
    writableGlobal.window = { gristConfig: {} } as unknown as Window & typeof globalThis;
    try {
      assert.deepEqual(await ikaDocPasteActions("Table1", actions), actions);
    } finally {
      writableGlobal.window = oldWindow;
    }
  });

  it("merges protected allocation values into added paste rows", function() {
    const merged = mergeGuidedWorkspaceProtectedValues({ title: ["A", "B"] }, [
      { rowKey: "row-1", protectedValues: { row_key: "row-1" } },
      { rowKey: "row-2", protectedValues: { row_key: "row-2" } },
    ]);

    assert.deepEqual(merged, {
      title: ["A", "B"],
      row_key: ["row-1", "row-2"],
    });
  });

  it("rejects allocation responses that do not match the requested row count", function() {
    assert.throws(
      () =>
        requireGuidedWorkspaceAllocatedRows(
          [{ rowKey: "row-1", protectedValues: { row_key: "row-1" } }],
          2,
        ),
      IkaDocGuidedWorkspaceRowsError,
    );
  });

  it("builds admission actions that write protected values by existing Grist row id", function() {
    const actions = buildGuidedWorkspaceAdmissionActions("Records", [
      {
        rowId: 7,
        rowKey: "row-key-7",
        protectedValues: {
          ikadoc_row_key: "row-key-7",
          ikadoc_row_state: "draft",
        },
      },
      {
        rowId: 8,
        rowKey: "row-key-8",
        protectedValues: {
          ikadoc_row_key: "row-key-8",
          ikadoc_row_state: "draft",
        },
      },
    ]);

    assert.deepEqual(actions, [
      [
        "BulkUpdateRecord",
        "Records",
        [7, 8],
        {
          ikadoc_row_key: ["row-key-7", "row-key-8"],
          ikadoc_row_state: ["draft", "draft"],
        },
      ],
    ]);
  });

  it("persists admitted row keys per table before a later admission failure", async function() {
    const requests: unknown[] = [];
    const sentActions: unknown[] = [];
    const windowGlobal = {
      fetch: async (url: string, options: RequestInit) => {
        requests.push(JSON.parse(options.body as string));
        if (url !== "/ikadoc/sessions/session-1/guided-workspace/rows/admit") {
          return new Response(JSON.stringify({ error: "unexpected url" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              rows: [
                {
                  rowId: 7,
                  rowKey: "row-key-7",
                  protectedValues: {
                    ikadoc_row_key: "row-key-7",
                    ikadoc_row_state: "draft",
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ error: "backend unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      },
      gristConfig: {
        ikadoc: {
          enabled: true,
          sessionId: "session-1",
          collectionCode: "records",
          user: {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            email: "alice@example.test",
          },
          sourceType: "document-file",
          mode: "editor",
          expiresAt: "2099-01-01T00:00:00.000Z",
          documentId: "doc-1",
          documentUrlId: "doc-url-1",
          workerUrl: "/ikadoc/sessions/session-1/worker",
          statusUrl: "/ikadoc/sessions/session-1/status",
          validationUrl: "/ikadoc/editor/session-validation",
          validationToken: "validation-token",
          discardUrl: "/ikadoc/sessions/session-1/discard",
          guidedWorkspaceUrls: {
            descriptorUrl:
              "/ikadoc/sessions/session-1/guided-workspace/descriptor",
            allocateRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows",
            admitRowsUrl:
              "/ikadoc/sessions/session-1/guided-workspace/rows/admit",
            referenceSearchUrl:
              "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/search",
            referenceResolveUrl:
              "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/resolve",
            validateUrl: "/ikadoc/sessions/session-1/guided-workspace/validate",
            applyUrl: "/ikadoc/sessions/session-1/guided-workspace/apply",
          },
          guidedWorkspace: {
            intent: "RECORD_IMPORT",
            targetCollectionCode: "records",
            targetSchemaType: "document",
            targetSchemaCode: "document_default",
            finalAction: "APPLY_TO_IKADOC",
            tableBindings: [{ tableId: "Records" }, { tableId: "Invoices" }],
          },
          capabilities: {
            ...DENIED_IKADOC_CAPABILITIES,
            canEditCells: true,
          },
          locale: "en",
        },
      },
    } as unknown as Window & typeof globalThis;
    const writableGlobal = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    const oldWindow = writableGlobal.window;
    const oldGlobals = setGlobals({ window: windowGlobal });
    writableGlobal.window = windowGlobal;

    const gristDoc = {
      docData: {
        getTable: (tableId: string) => ({
          getRowIds: () => (tableId === "Records" ? [7] : [12]),
          getValue: () => "",
        }),
        sendActions: async (actions: unknown, description: string) => {
          sentActions.push({ actions, description });
        },
      },
    };

    try {
      await admitExistingGuidedWorkspaceRows(
        gristDoc as unknown as Parameters<
          typeof admitExistingGuidedWorkspaceRows
        >[0],
        guidedDescriptorWithTables(["Records", "Invoices"]),
        "Admit guided rows",
      );
      assert.fail("Expected admission failure");
    } catch (error) {
      assert.instanceOf(error, IkaDocGuidedWorkspaceRowsError);
      assert.equal((error as IkaDocGuidedWorkspaceRowsError).failure, "request-failed");
    } finally {
      setGlobals(oldGlobals);
      writableGlobal.window = oldWindow;
    }

    assert.deepEqual(requests, [
      { tableId: "Records", rowIds: [7] },
      { tableId: "Invoices", rowIds: [12] },
    ]);
    assert.deepEqual(sentActions, [
      {
        description: "Admit guided rows",
        actions: [
          [
            "BulkUpdateRecord",
            "Records",
            [7],
            {
              ikadoc_row_key: ["row-key-7"],
              ikadoc_row_state: ["draft"],
            },
          ],
        ],
      },
    ]);
  });

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

  it("redacts backend error details from allocation request failures", async function() {
    const backendMessage =
      "vault token leaked in backend diagnostic should not reach the browser";
    const windowGlobal = {
      fetch: async (url: string, options: RequestInit) => {
        assert.equal(url, "/ikadoc/sessions/session-1/guided-workspace/rows");
        assert.equal(options.method, "POST");
        assert.equal(options.credentials, "include");
        assert.equal(
          (options.headers as Headers).get("X-Collection"),
          "records",
        );
        assert.deepEqual(JSON.parse(options.body as string), {
          tableId: "Table1",
          count: 1,
        });
        return new Response(JSON.stringify({ error: backendMessage }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      },
      gristConfig: {
        ikadoc: {
          enabled: true,
          sessionId: "session-1",
          collectionCode: "records",
          user: {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            email: "alice@example.test",
          },
          sourceType: "document-file",
          mode: "editor",
          expiresAt: "2099-01-01T00:00:00.000Z",
          documentId: "doc-1",
          documentUrlId: "doc-url-1",
          workerUrl: "/ikadoc/sessions/session-1/worker",
          statusUrl: "/ikadoc/sessions/session-1/status",
          validationUrl: "/ikadoc/editor/session-validation",
          validationToken: "validation-token",
          discardUrl: "/ikadoc/sessions/session-1/discard",
          guidedWorkspaceUrls: {
            descriptorUrl:
              "/ikadoc/sessions/session-1/guided-workspace/descriptor",
            allocateRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows",
            admitRowsUrl:
              "/ikadoc/sessions/session-1/guided-workspace/rows/admit",
            referenceSearchUrl:
              "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/search",
            referenceResolveUrl:
              "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/resolve",
            validateUrl: "/ikadoc/sessions/session-1/guided-workspace/validate",
            applyUrl: "/ikadoc/sessions/session-1/guided-workspace/apply",
          },
          guidedWorkspace: {
            intent: "RECORD_IMPORT",
            targetCollectionCode: "records",
            targetSchemaType: "document",
            targetSchemaCode: "document_default",
            finalAction: "APPLY_TO_IKADOC",
            tableBindings: [{ tableId: "Table1" }],
          },
          capabilities: {
            ...DENIED_IKADOC_CAPABILITIES,
            canEditCells: true,
          },
          locale: "en",
        },
      },
    } as unknown as Window & typeof globalThis;
    const writableGlobal = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    const oldWindow = writableGlobal.window;
    const oldGlobals = setGlobals({ window: windowGlobal });
    writableGlobal.window = windowGlobal;

    try {
      await allocateGuidedWorkspaceRows("Table1", 1);
      assert.fail("Expected allocation failure");
    } catch (error) {
      assert.instanceOf(error, IkaDocGuidedWorkspaceRowsError);
      const rowsError = error as IkaDocGuidedWorkspaceRowsError;
      assert.equal(rowsError.failure, "request-failed");
      assert.notInclude(rowsError.message, backendMessage);
      assert.notInclude(rowsError.detail, backendMessage);
    } finally {
      setGlobals(oldGlobals);
      writableGlobal.window = oldWindow;
    }
  });

  it("rejects paste values that are not aligned with allocated rows", function() {
    assert.throws(
      () =>
        mergeGuidedWorkspaceProtectedValues({ title: ["A"] }, [
          { rowKey: "row-1", protectedValues: { row_key: "row-1" } },
          { rowKey: "row-2", protectedValues: { row_key: "row-2" } },
        ]),
      IkaDocGuidedWorkspaceRowsError,
    );
  });
});

function guidedDescriptor(): IkaDocGuidedWorkspaceDescriptor {
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
    schema: { code: "case", label: "Case", fullCode: "folder_case" },
    fields: [],
    protectedColumns: [],
    tables: [
      {
        tableId: "Records",
        targetSchemaCode: "folder_case",
        schema: { code: "case", label: "Case", fullCode: "folder_case" },
        fields: [],
        protectedColumns: [],
      },
    ],
  };
}

function guidedDescriptorWithTables(
  tableIds: readonly string[],
): IkaDocGuidedWorkspaceDescriptor {
  const descriptor = guidedDescriptor();
  return {
    ...descriptor,
    marker: {
      ...descriptor.marker,
      tableBindings: tableIds.map(tableId => ({
        tableId,
        targetSchemaCode: "folder_case",
      })),
    },
    tables: tableIds.map(tableId => ({
      tableId,
      targetSchemaCode: "folder_case",
      schema: { code: "case", label: "Case", fullCode: "folder_case" },
      fields: [],
      protectedColumns: [],
    })),
  };
}

function guidedResult(
  overrides: Partial<IkaDocGuidedWorkspaceResult>,
): IkaDocGuidedWorkspaceResult {
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
