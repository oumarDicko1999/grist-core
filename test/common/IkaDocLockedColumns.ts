import { isIkaDocLockedColumn } from "app/client/ui/IkaDocLockedColumns";

import { assert } from "chai";

type WritableGlobal = typeof globalThis & { window?: Window & typeof globalThis };

const RUNTIME_CONFIG = {
  enabled: true,
  sessionId: "session-1",
  collectionCode: "records",
  user: { userId: "user-1", username: "alice", displayName: "Alice", email: "alice@example.test" },
  sourceType: "search-workspace",
  mode: "editor",
  expiresAt: "2099-01-01T00:00:00.000Z",
  documentId: "doc-1",
  documentUrlId: "doc-url-1",
  workerUrl: "/ikadoc/sessions/session-1/worker",
  statusUrl: "/ikadoc/sessions/session-1/status",
  validationUrl: "/ikadoc/editor/session-validation",
  discardUrl: "/ikadoc/sessions/session-1/discard",
  locale: "fr",
  lockedColumns: { Factures: ["numero", "montant"] },
};

/** GW-RFR-03: the grid treats IkaDoc's columns as read-only. */
describe("IkaDocLockedColumns", function() {
  const writableGlobal = globalThis as WritableGlobal;
  let oldWindow: WritableGlobal["window"];

  function withGristConfig(gristConfig: object) {
    writableGlobal.window = { gristConfig } as unknown as Window & typeof globalThis;
  }

  beforeEach(function() {
    oldWindow = writableGlobal.window;
  });

  afterEach(function() {
    writableGlobal.window = oldWindow;
  });

  it("locks the columns IkaDoc lists for the table", function() {
    withGristConfig({ ikadoc: RUNTIME_CONFIG });

    assert.isTrue(isIkaDocLockedColumn("Factures", "numero"));
    assert.isTrue(isIkaDocLockedColumn("Factures", "montant"));
  });

  it("leaves the user's own columns and other tables editable", function() {
    withGristConfig({ ikadoc: RUNTIME_CONFIG });

    assert.isFalse(isIkaDocLockedColumn("Factures", "jours_de_retard"));
    assert.isFalse(isIkaDocLockedColumn("Notes", "numero"));
  });

  it("locks nothing outside IkaDoc", function() {
    withGristConfig({});

    assert.isFalse(isIkaDocLockedColumn("Factures", "numero"));
  });
});
