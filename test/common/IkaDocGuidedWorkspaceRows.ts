import { setGlobals } from "app/client/lib/browserGlobals";
import {
  admitExistingGuidedWorkspaceRows,
  allocateGuidedWorkspaceRows,
  buildGuidedWorkspaceAdmissionActions,
  IkaDocGuidedWorkspaceRowsError,
  ikaDocPasteActions,
  mergeGuidedWorkspaceProtectedValues,
  requireGuidedWorkspaceAllocatedRows,
} from "app/client/ui/IkaDocGuidedWorkspaceRows";
import { UserAction } from "app/common/DocActions";
import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import { IkaDocGuidedWorkspaceDescriptor } from "app/ikadoc/IkaDocGuidedWorkspace";

import { assert } from "chai";

const SESSION_URL = "/ikadoc/sessions/session-1";
const GUIDED_URL = `${SESSION_URL}/guided-workspace`;

type FakeFetch = (url: string, options: RequestInit) => Promise<Response>;

describe("IkaDocGuidedWorkspaceRows", function() {
  it("leaves paste actions unchanged outside a guided workspace", async function() {
    const actions: UserAction[] = [
      ["BulkAddRecord", [null, null], { title: ["A", "B"] }],
      ["BulkUpdateRecord", [3], { title: ["C"] }],
    ];

    const pasted = await withIkaDocPage({ gristConfig: {} }, () => ikaDocPasteActions("Table1", actions));

    assert.deepEqual(pasted, actions);
  });

  it("merges protected allocation values into added paste rows", function() {
    const merged = mergeGuidedWorkspaceProtectedValues({ title: ["A", "B"] }, [
      { rowKey: "row-1", protectedValues: { row_key: "row-1" } },
      { rowKey: "row-2", protectedValues: { row_key: "row-2" } },
    ]);

    assert.deepEqual(merged, { title: ["A", "B"], row_key: ["row-1", "row-2"] });
  });

  it("rejects paste values that are not aligned with allocated rows", function() {
    const allocated = [
      { rowKey: "row-1", protectedValues: { row_key: "row-1" } },
      { rowKey: "row-2", protectedValues: { row_key: "row-2" } },
    ];

    const merge = () => mergeGuidedWorkspaceProtectedValues({ title: ["A"] }, allocated);

    assert.throws(merge, IkaDocGuidedWorkspaceRowsError);
  });

  it("rejects allocation responses that do not match the requested row count", function() {
    const allocated = [{ rowKey: "row-1", protectedValues: { row_key: "row-1" } }];

    assert.throws(() => requireGuidedWorkspaceAllocatedRows(allocated, 2), IkaDocGuidedWorkspaceRowsError);
  });

  it("builds admission actions that write protected values by existing Grist row id", function() {
    const actions = buildGuidedWorkspaceAdmissionActions("Records", [
      admittedRow(7),
      admittedRow(8),
    ]);

    assert.deepEqual(actions, [
      ["BulkUpdateRecord", "Records", [7, 8], {
        ikadoc_row_key: ["row-key-7", "row-key-8"],
        ikadoc_row_state: ["draft", "draft"],
      }],
    ]);
  });

  it("persists admitted row keys per table before a later admission failure", async function() {
    const requests: unknown[] = [];
    const sentActions: unknown[] = [];

    const fetch: FakeFetch = async (url, options) => {
      requests.push(JSON.parse(options.body as string));

      if (url !== `${GUIDED_URL}/rows/admit`) {
        return jsonResponse(404, { error: "unexpected url" });
      }

      return requests.length === 1 ?
        jsonResponse(200, { rows: [admittedRow(7)] }) :
        jsonResponse(503, { error: "backend unavailable" });
    };

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
    } as unknown as Parameters<typeof admitExistingGuidedWorkspaceRows>[0];

    const failure = await withIkaDocPage(guidedPage(fetch, ["Records", "Invoices"]), () =>
      admitExistingGuidedWorkspaceRows(gristDoc, descriptorWithTables(["Records", "Invoices"]), "Admit guided rows")
        .then(() => assert.fail("Expected admission failure"), error => error));

    assert.instanceOf(failure, IkaDocGuidedWorkspaceRowsError);
    assert.equal((failure as IkaDocGuidedWorkspaceRowsError).failure, "request-failed");

    assert.deepEqual(requests, [
      { tableId: "Records", rowIds: [7] },
      { tableId: "Invoices", rowIds: [12] },
    ]);
    assert.deepEqual(sentActions, [{
      description: "Admit guided rows",
      actions: [
        ["BulkUpdateRecord", "Records", [7], { ikadoc_row_key: ["row-key-7"], ikadoc_row_state: ["draft"] }],
      ],
    }]);
  });

  it("redacts backend error details from allocation request failures", async function() {
    const backendMessage = "vault token leaked in backend diagnostic should not reach the browser";

    const fetch: FakeFetch = async (url, options) => {
      assert.equal(url, `${GUIDED_URL}/rows`);
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "include");
      assert.equal((options.headers as Headers).get("X-Collection"), "records");
      assert.deepEqual(JSON.parse(options.body as string), { tableId: "Table1", count: 1 });

      return jsonResponse(503, { error: backendMessage });
    };

    const failure = await withIkaDocPage(guidedPage(fetch, ["Table1"]), () =>
      allocateGuidedWorkspaceRows("Table1", 1)
        .then(() => assert.fail("Expected allocation failure"), error => error));

    assert.instanceOf(failure, IkaDocGuidedWorkspaceRowsError);

    const rowsError = failure as IkaDocGuidedWorkspaceRowsError;
    assert.equal(rowsError.failure, "request-failed");
    assert.notInclude(rowsError.message, backendMessage);
    assert.notInclude(rowsError.detail, backendMessage);
  });
});

function admittedRow(rowId: number) {
  const rowKey = `row-key-${rowId}`;

  return { rowId, rowKey, protectedValues: { ikadoc_row_key: rowKey, ikadoc_row_state: "draft" } };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Runs [body] with [page] as the browser window, then puts the real one back. */
async function withIkaDocPage<T>(page: object, body: () => Promise<T>): Promise<T> {
  const fakeWindow = page as Window & typeof globalThis;
  const writableGlobal = globalThis as typeof globalThis & { window?: Window & typeof globalThis };

  const oldWindow = writableGlobal.window;
  const oldGlobals = setGlobals({ window: fakeWindow });
  writableGlobal.window = fakeWindow;

  try {
    return await body();
  } finally {
    setGlobals(oldGlobals);
    writableGlobal.window = oldWindow;
  }
}

/** A Grist page opened by an IkaDoc editor session whose guided workspace binds [tableIds]. */
function guidedPage(fetch: FakeFetch, tableIds: string[]) {
  return {
    fetch,
    gristConfig: {
      ikadoc: {
        enabled: true,
        sessionId: "session-1",
        collectionCode: "records",
        user: { userId: "user-1", username: "alice", displayName: "Alice", email: "alice@example.test" },
        sourceType: "document-file",
        mode: "editor",
        expiresAt: "2099-01-01T00:00:00.000Z",
        documentId: "doc-1",
        documentUrlId: "doc-url-1",
        workerUrl: `${SESSION_URL}/worker`,
        statusUrl: `${SESSION_URL}/status`,
        validationUrl: "/ikadoc/editor/session-validation",
        validationToken: "validation-token",
        discardUrl: `${SESSION_URL}/discard`,
        guidedWorkspaceUrls: {
          descriptorUrl: `${GUIDED_URL}/descriptor`,
          allocateRowsUrl: `${GUIDED_URL}/rows`,
          admitRowsUrl: `${GUIDED_URL}/rows/admit`,
          referenceSearchUrl: `${GUIDED_URL}/reference-lookup/search`,
          referenceResolveUrl: `${GUIDED_URL}/reference-lookup/resolve`,
          validateUrl: `${GUIDED_URL}/validate`,
          applyUrl: `${GUIDED_URL}/apply`,
        },
        guidedWorkspace: {
          intent: "RECORD_IMPORT",
          targetCollectionCode: "records",
          targetSchemaType: "document",
          targetSchemaCode: "document_default",
          finalAction: "APPLY_TO_IKADOC",
          tableBindings: tableIds.map(tableId => ({ tableId })),
        },
        capabilities: { ...DENIED_IKADOC_CAPABILITIES, canEditCells: true },
        locale: "en",
      },
    },
  };
}

function descriptorWithTables(tableIds: readonly string[]): IkaDocGuidedWorkspaceDescriptor {
  const schema = { code: "case", label: "Case", fullCode: "folder_case" };
  const bindings = tableIds.map(tableId => ({ tableId, targetSchemaCode: "folder_case" }));

  return {
    marker: {
      intent: "BULK_EDIT",
      targetCollectionCode: "records",
      targetSchemaType: "folder",
      targetSchemaCode: "folder_case",
      finalAction: "APPLY_TO_IKADOC",
      tableBindings: bindings,
    },
    schemaType: { code: "folder", label: "Folder" },
    schema,
    fields: [],
    protectedColumns: [],
    tables: bindings.map(binding => ({ ...binding, schema, fields: [], protectedColumns: [] })),
  };
}
