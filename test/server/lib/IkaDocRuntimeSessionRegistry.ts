import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { IKADOC_RUNTIME_PARTICIPANT_COOKIE, IKADOC_RUNTIME_SESSION_COOKIE } from "app/server/lib/IkaDocRuntimeCookies";
import { ikadocRuntimeSessionForRequest, IkaDocRuntimeSessionValidator } from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { IkaDocRuntimeSessionRevalidator } from "app/server/lib/IkaDocRuntimeSessionRevalidator";

import { assert } from "chai";

import type { Request } from "express";

/** GR-02, GR-03: several people in one spreadsheet session, each always acting as themselves. */
describe("IkaDoc runtime session registry with several participants", function() {
  it("keeps one entry per person in a shared session, each behind its own cookie", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const owner = registry.register(participantConfig("owner", "owner-token"));
    const editor = registry.register(participantConfig("editor", "editor-token"));

    assert.notEqual(owner.participantHandle, editor.participantHandle);
    assert.equal(ikadocRuntimeSessionForRequest(registry, browserRequest(owner.participantHandle)), owner);
    assert.equal(ikadocRuntimeSessionForRequest(registry, browserRequest(editor.participantHandle)), editor);
    assert.equal(ikadocRuntimeSessionForRequest(registry, browserRequest(editor.participantHandle))?.config
      .validationToken, "editor-token");
  });

  it("reuses a browser's entry when that browser enters again, with the new config", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const owner = registry.register(participantConfig("owner", "owner-token"));
    const firstVisit = registry.register(participantConfig("editor", "editor-token-1"));

    const reload = registry.register(participantConfig("editor", "editor-token-2"), Date.now(),
      firstVisit.participantHandle);

    assert.strictEqual(reload, firstVisit);
    assert.equal(reload.config.validationToken, "editor-token-2");
    assert.equal(registry.getByHandle(owner.participantHandle), owner);
  });

  it("keeps a person's tabs connected when another tab of the same browser enters", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const dropped: string[] = [];
    registry.onUnregistered(session => dropped.push(session.participantHandle));

    const firstTab = registry.register(participantConfig("editor", "editor-token-1"));
    registry.register(participantConfig("editor", "editor-token-2"), Date.now(), firstTab.participantHandle);

    assert.deepEqual(dropped, []);
    assert.equal(registry.getByHandle(firstTab.participantHandle), firstTab);
  });

  it("gives every open tab the person's latest capabilities at once", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const laptop = registry.register(participantConfig("editor", "editor-token-1", true));

    registry.register(participantConfig("editor", "editor-token-2", false));

    assert.isFalse(registry.getByHandle(laptop.participantHandle)?.config.capabilities.canExportFromBrowser);
  });

  it("keeps a person's first tab open when they open the session in a second tab", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const dropped: string[] = [];
    registry.onUnregistered(session => dropped.push(session.participantHandle));

    const firstTab = registry.register(participantConfig("editor", "editor-token-1"));
    const secondTab = registry.register(participantConfig("editor", "editor-token-2"));

    assert.equal(registry.getByHandle(firstTab.participantHandle), firstTab);
    assert.equal(registry.getByHandle(secondTab.participantHandle), secondTab);
    assert.deepEqual(dropped, []);
    assert.equal(registry.getByParticipant("session-1", "editor"), secondTab);
  });

  it("never replaces another person's entry, even when given their handle", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const owner = registry.register(participantConfig("owner", "owner-token"));

    registry.register(participantConfig("editor", "editor-token"), Date.now(), owner.participantHandle);

    assert.equal(registry.getByHandle(owner.participantHandle), owner);
  });

  it("drops a person's oldest tabs beyond the limit, so lost cookies cannot pile up", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const startMs = Date.now();

    const tabs = Array.from({ length: 9 }, (_, i) =>
      registry.register(participantConfig("editor", `editor-token-${i}`), startMs + i));

    assert.isUndefined(registry.getByHandle(tabs[0].participantHandle));
    assert.equal(registry.getByHandle(tabs[1].participantHandle), tabs[1]);
    assert.equal(registry.getByHandle(tabs[8].participantHandle), tabs[8]);
  });

  it("never gives a browser whose own entry is gone someone else's entry for the document", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(participantConfig("owner", "owner-token"));

    const resolved = ikadocRuntimeSessionForRequest(registry, browserRequest("forgotten-handle"));

    assert.isUndefined(resolved);
  });

  it("answers for the document with the narrowest person's capabilities", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(participantConfig("owner", "owner-token", true));
    const editor = registry.register(participantConfig("editor", "editor-token", false));

    const resolution = registry.resolveByDocumentId("doc-1");

    assert.equal(resolution.kind === "active" ? resolution.session : undefined, editor);
  });

  it("answers for the document with only the capabilities every person shares", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const exporter = participantConfig("exporter", "exporter-token", true);
    exporter.capabilities = { ...exporter.capabilities, canCreateCharts: false };
    registry.register(exporter);
    registry.register(participantConfig("charter", "charter-token", false));

    const resolution = registry.resolveByDocumentId("doc-1");
    const capabilities = resolution.kind === "active" ? resolution.session.config.capabilities : undefined;

    assert.isFalse(capabilities?.canExportFromBrowser);
    assert.isFalse(capabilities?.canCreateCharts);
    assert.isTrue(capabilities?.canEditCells);
  });

  it("drops the person IkaDoc refuses and tells their connections, keeping everyone else", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const owner = registry.register(participantConfig("owner", "owner-token"));
    const editor = registry.register(participantConfig("editor", "editor-token"));
    const closed: string[] = [];
    registry.onUnregistered(session => closed.push(session.userId));
    const validator: IkaDocRuntimeSessionValidator = {
      async validate(session) {
        if (session.userId === "editor") {
          throw new Error("removed from the session");
        }
      },
    };

    await new IkaDocRuntimeSessionRevalidator(registry, validator).revalidateAll();

    assert.deepEqual(closed, ["editor"]);
    assert.isUndefined(registry.getByHandle(editor.participantHandle));
    assert.equal(registry.getByHandle(owner.participantHandle), owner);
  });
});

function browserRequest(participantHandle: string): Request {
  return {
    headers: {
      cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ${IKADOC_RUNTIME_PARTICIPANT_COOKIE}=${participantHandle}`,
    },
    params: { docId: "doc-1" },
  } as unknown as Request;
}

function participantConfig(
  userId: string,
  validationToken: string,
  canExportFromBrowser = false,
): IkaDocRuntimeConfig {
  return {
    enabled: true,
    sessionId: "session-1",
    user: { userId, username: userId, displayName: userId },
    collectionCode: "records",
    sourceType: "document-file",
    mode: "editor",
    expiresAt: "2099-01-01T00:00:00.000Z",
    documentId: "doc-1",
    documentUrlId: "doc-url-1",
    workerUrl: "/api/docs/doc-1",
    statusUrl: "/api/grist/sessions/session-1",
    validationUrl: "/api/grist/editor/session-validation",
    validationToken,
    discardUrl: "/api/grist/sessions/session-1/cancel",
    capabilities: {
      canEditCells: true,
      canEditStructure: true,
      canUseFormulas: true,
      canCreateCharts: true,
      canViewHistory: true,
      canRefreshSource: false,
      canSaveToIkaDoc: true,
      canDiscard: true,
      canUseComments: false,
      canUseAttachments: false,
      canUseExternalData: false,
      canImportLocalFiles: false,
      canUseCustomWidgets: false,
      canInviteCollaborators: false,
      canExportFromBrowser,
      canShare: false,
      canFork: false,
      canPublish: false,
      canManageAccess: false,
      canUsePlugins: false,
    },
    locale: "en",
    appearance: "light",
  };
}
