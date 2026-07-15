import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import { parseIkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

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
  discardUrl: "/ikadoc/sessions/session-1/discard",
  locale: "en",
};

describe("IkaDocRuntimeConfig", function() {
  it("treats a missing config section as disabled", function() {
    assert.deepEqual(parseIkaDocRuntimeConfig(undefined), { kind: "disabled" });
  });

  it("rejects malformed enabled config instead of silently defaulting", function() {
    assert.deepEqual(parseIkaDocRuntimeConfig({
      enabled: true,
      sessionId: "session-1",
  collectionCode: "records",
    }), {
      kind: "invalid",
      reason: "missing-required-string",
    });
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
    assert.equal(result.config.refreshUrl, "/ikadoc/sessions/session-1/refresh");
    assert.equal(result.config.proposalUrl, "/ikadoc/sessions/session-1/proposal");
  });
});
