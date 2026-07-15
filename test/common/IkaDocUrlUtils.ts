import { addOrgToPath } from "app/common/urlUtils";
import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";

import { assert } from "chai";

describe("IkaDoc urlUtils", function() {
  it("does not infer Grist org paths in IkaDoc runtime mode", function() {
    const windowGlobal = {
      gristConfig: {
        timestampMs: Date.now(),
        homeUrl: null,
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
          discardUrl: "/ikadoc/sessions/session-1/discard",
          capabilities: DENIED_IKADOC_CAPABILITIES,
          locale: "en",
        },
      },
    } as unknown as Window & typeof globalThis;
    const writableGlobal = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    const oldWindow = writableGlobal.window;
    writableGlobal.window = windowGlobal;

    try {
      assert.equal(
        addOrgToPath(
          "https://records.owarelin.localhost/ikadoc/sessions/session-1/worker/",
          "https://records.owarelin.localhost/grist/editor/session-1",
        ),
        "https://records.owarelin.localhost/ikadoc/sessions/session-1/worker",
      );
    } finally {
      writableGlobal.window = oldWindow;
    }
  });
});
