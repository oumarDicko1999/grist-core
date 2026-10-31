import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import {
  IKADOC_RUNTIME_PARTICIPANT_COOKIE,
  IKADOC_RUNTIME_SESSION_COOKIE,
  ikadocRuntimeSessionForRequest,
  IkaDocRuntimeSessionValidator,
} from "app/server/lib/IkaDocRuntimePolicy";
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

  it("replaces a person's previous entry when they enter again, without touching the others", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const owner = registry.register(participantConfig("owner", "owner-token"));
    const firstVisit = registry.register(participantConfig("editor", "editor-token-1"));

    const secondVisit = registry.register(participantConfig("editor", "editor-token-2"));

    assert.isUndefined(registry.getByHandle(firstVisit.participantHandle));
    assert.equal(registry.getByHandle(secondVisit.participantHandle), secondVisit);
    assert.equal(registry.getByHandle(owner.participantHandle), owner);
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
