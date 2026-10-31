import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import { parseIkaDocRuntimeConfig, toIkaDocBrowserRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { assert } from "chai";

const VALID_IKADOC_CONFIG = {
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
  locale: "en",
};

describe("IkaDocRuntimeConfig", function() {
  it("treats a missing config section as disabled", function() {
    assert.deepEqual(parseIkaDocRuntimeConfig(undefined), { kind: "disabled" });
  });

  it("reads IkaDoc-owned columns per table (GW-RFR-03)", function() {
    const result = parseIkaDocRuntimeConfig({
      ...VALID_IKADOC_CONFIG,
      lockedColumns: { Factures: ["numero", "montant"] },
    });

    assert.equal(result.kind, "enabled");
    assert.deepEqual(
      result.kind === "enabled" ? result.config.lockedColumns : undefined,
      { Factures: ["numero", "montant"] },
    );
  });

  it("sends locked columns and sources to the browser, never the validation token", function() {
    const source = {
      sourceId: "source-factures",
      tableId: "Factures",
      label: "Factures",
      origin: "saved-search",
      scope: "Recherche « Factures 2026 »",
      rowCount: 60,
      snapshotAt: "2026-10-31T11:24:00.000Z",
    };

    const result = parseIkaDocRuntimeConfig({
      ...VALID_IKADOC_CONFIG,
      lockedColumns: { Factures: ["numero"] },
      sources: [source],
    });
    assert.equal(result.kind, "enabled");

    const browserConfig = result.kind === "enabled" ? toIkaDocBrowserRuntimeConfig(result.config) : undefined;

    assert.deepEqual(browserConfig?.lockedColumns, { Factures: ["numero"] });
    assert.deepEqual(browserConfig?.sources, [source]);
    assert.notProperty(browserConfig, "validationToken");
  });

  it("rejects a malformed source list (GW-SRC-10)", function() {
    assert.deepEqual(
      parseIkaDocRuntimeConfig({ ...VALID_IKADOC_CONFIG, sources: [{ sourceId: "s1" }] }),
      { kind: "invalid", reason: "invalid-sources" },
    );
  });

  it("rejects malformed IkaDoc-owned columns instead of ignoring them", function() {
    for (const lockedColumns of [["numero"], { Factures: "numero" }, { Factures: [""] }, { Factures: [3] }]) {
      assert.deepEqual(
        parseIkaDocRuntimeConfig({ ...VALID_IKADOC_CONFIG, lockedColumns }),
        { kind: "invalid", reason: "invalid-locked-columns" },
      );
    }
  });

  it("rejects malformed enabled config instead of silently defaulting", function() {
    assert.deepEqual(
      parseIkaDocRuntimeConfig({
        enabled: true,
        sessionId: "session-1",
        collectionCode: "records",
      }),
      {
        kind: "invalid",
        reason: "missing-required-string",
      },
    );
  });

  it("denies every capability when an enabled config omits capability data", function() {
    const result = parseIkaDocRuntimeConfig({
      ...VALID_IKADOC_CONFIG,
      sourceSummary: "Search: invoices",
    });

    assert.equal(result.kind, "enabled");
    if (result.kind !== "enabled") {
      return;
    }

    assert.deepEqual(result.config.capabilities, DENIED_IKADOC_CAPABILITIES);
    assert.equal(result.config.sourceSummary, "Search: invoices");
  });

  it("accepts explicit capability grants without enabling unrelated capabilities", function() {
    const result = parseIkaDocRuntimeConfig({
      ...VALID_IKADOC_CONFIG,
      refreshUrl: "/ikadoc/sessions/session-1/refresh",
      proposalUrl: "/ikadoc/sessions/session-1/proposal",
      capabilities: {
        canEditCells: true,
        canSaveToIkaDoc: true,
      },
    });

    assert.equal(result.kind, "enabled");
    if (result.kind !== "enabled") {
      return;
    }

    assert.deepEqual(result.config.capabilities, {
      ...DENIED_IKADOC_CAPABILITIES,
      canEditCells: true,
      canSaveToIkaDoc: true,
    });
    assert.equal(
      result.config.refreshUrl,
      "/ikadoc/sessions/session-1/refresh",
    );
    assert.equal(
      result.config.proposalUrl,
      "/ikadoc/sessions/session-1/proposal",
    );
  });

  it("accepts backend-issued guided workspace markers", function() {
    const result = parseIkaDocRuntimeConfig({
      ...VALID_IKADOC_CONFIG,
      guidedWorkspaceUrls: {
        descriptorUrl: "/ikadoc/sessions/session-1/guided-workspace/descriptor",
        allocateRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows",
        admitRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows/admit",
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
        tableBindings: [],
      },
    });

    assert.equal(result.kind, "enabled");
    if (result.kind !== "enabled") {
      return;
    }

    assert.deepEqual(result.config.guidedWorkspaceUrls, {
      descriptorUrl: "/ikadoc/sessions/session-1/guided-workspace/descriptor",
      allocateRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows",
      admitRowsUrl: "/ikadoc/sessions/session-1/guided-workspace/rows/admit",
      referenceSearchUrl:
        "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/search",
      referenceResolveUrl:
        "/ikadoc/sessions/session-1/guided-workspace/reference-lookup/resolve",
      validateUrl: "/ikadoc/sessions/session-1/guided-workspace/validate",
      applyUrl: "/ikadoc/sessions/session-1/guided-workspace/apply",
    });
    assert.deepEqual(result.config.guidedWorkspace, {
      intent: "RECORD_IMPORT",
      targetCollectionCode: "records",
      targetSchemaType: "document",
      targetSchemaCode: "document_default",
      finalAction: "APPLY_TO_IKADOC",
      tableBindings: [],
    });
  });

  it("rejects malformed guided workspace URL contracts", function() {
    assert.deepEqual(
      parseIkaDocRuntimeConfig({
        ...VALID_IKADOC_CONFIG,
        guidedWorkspaceUrls: {
          descriptorUrl:
            "/ikadoc/sessions/session-1/guided-workspace/descriptor",
        },
      }),
      {
        kind: "invalid",
        reason: "invalid-guided-workspace-urls",
      },
    );
  });

  it("rejects malformed guided workspace markers", function() {
    assert.deepEqual(
      parseIkaDocRuntimeConfig({
        ...VALID_IKADOC_CONFIG,
        guidedWorkspace: {
          intent: "RECORD_IMPORT",
          targetCollectionCode: "records",
          targetSchemaType: "document",
          finalAction: "DELETE_RECORDS",
        },
      }),
      {
        kind: "invalid",
        reason: "invalid-guided-workspace",
      },
    );
  });
});
