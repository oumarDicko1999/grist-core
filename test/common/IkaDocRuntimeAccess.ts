import {
  canBuildIkaDocRuntimeProposal,
  canCreateIkaDocRuntimeCharts,
  canDiscardIkaDocRuntime,
  canEditIkaDocRuntimeCells,
  canEditIkaDocRuntimeStructure,
  canExportFromIkaDocRuntimeBrowser,
  canImportIkaDocRuntimeLocalFiles,
  canManageIkaDocRuntimeAccess,
  canRefreshIkaDocRuntimeSource,
  canSaveToIkaDocRuntime,
  canUseIkaDocRuntimeComments,
  canUseIkaDocRuntimeCustomWidgets,
  canUseIkaDocRuntimeExternalData,
  canUseIkaDocRuntimeFormulas,
  canUseIkaDocRuntimePlugins,
  canViewIkaDocRuntimeHistory,
  isIkaDocRuntimeEditor,
  isIkaDocRuntimeMode,
  shouldShowIkaDocRuntimeAuthoringSurfaces,
} from "app/client/ui/IkaDocRuntimeAccess";
import {
  IkaDocRuntimeCapabilities,
  IkaDocRuntimeConfig,
} from "app/common/gristUrls";

import { assert } from "chai";

const DENIED_CAPABILITIES: IkaDocRuntimeCapabilities = {
  canEditCells: false,
  canEditStructure: false,
  canUseFormulas: false,
  canCreateCharts: false,
  canViewHistory: false,
  canRefreshSource: false,
  canSaveToIkaDoc: false,
  canDiscard: false,
  canUseComments: false,
  canUseAttachments: false,
  canUseExternalData: false,
  canImportLocalFiles: false,
  canUseCustomWidgets: false,
  canInviteCollaborators: false,
  canExportFromBrowser: false,
  canShare: false,
  canFork: false,
  canPublish: false,
  canManageAccess: false,
  canUsePlugins: false,
};

describe("IkaDocRuntimeAccess", function() {
  it("treats missing runtime config as native Grist mode", function() {
    assert.equal(isIkaDocRuntimeMode(null), false);
    assert.equal(isIkaDocRuntimeEditor(null), true);
  });

  it("denies editor-only helpers in viewer mode even when the capability is present", function() {
    const config = runtimeConfig("viewer", {
      canEditCells: true,
      canEditStructure: true,
      canUseFormulas: true,
      canCreateCharts: true,
      canUseCustomWidgets: true,
      canUseComments: true,
      canSaveToIkaDoc: true,
      canDiscard: true,
    });

    assert.equal(isIkaDocRuntimeMode(config), true);
    assert.equal(isIkaDocRuntimeEditor(config), false);
    assert.equal(canEditIkaDocRuntimeCells(config), false);
    assert.equal(canEditIkaDocRuntimeStructure(config), false);
    assert.equal(canUseIkaDocRuntimeFormulas(config), false);
    assert.equal(canCreateIkaDocRuntimeCharts(config), false);
    assert.equal(canUseIkaDocRuntimeCustomWidgets(config), false);
    assert.equal(canUseIkaDocRuntimeComments(config), false);
    assert.equal(canSaveToIkaDocRuntime(config), false);
    assert.equal(canDiscardIkaDocRuntime(config), false);
    assert.equal(canBuildIkaDocRuntimeProposal(config), false);
  });

  it("allows only read-safe helpers in viewer mode when explicitly granted", function() {
    const config = runtimeConfig("viewer", {
      canExportFromBrowser: true,
      canViewHistory: true,
      canImportLocalFiles: true,
      canUseExternalData: true,
      canManageAccess: true,
      canUsePlugins: true,
    });

    assert.equal(canExportFromIkaDocRuntimeBrowser(config), true);
    assert.equal(canViewIkaDocRuntimeHistory(config), true);
    assert.equal(canImportIkaDocRuntimeLocalFiles(config), false);
    assert.equal(canUseIkaDocRuntimeExternalData(config), false);
    assert.equal(canManageIkaDocRuntimeAccess(config), false);
    assert.equal(canUseIkaDocRuntimePlugins(config), false);
    assert.equal(canRefreshIkaDocRuntimeSource(config), false);
  });

  it("allows editor helpers in editor mode when explicitly granted", function() {
    const config = runtimeConfig("editor", {
      canEditCells: true,
      canEditStructure: true,
      canUseFormulas: true,
      canCreateCharts: true,
      canUseCustomWidgets: true,
      canUseComments: true,
      canRefreshSource: true,
      canSaveToIkaDoc: true,
      canDiscard: true,
    });

    assert.equal(isIkaDocRuntimeEditor(config), true);
    assert.equal(canEditIkaDocRuntimeCells(config), true);
    assert.equal(canEditIkaDocRuntimeStructure(config), true);
    assert.equal(canUseIkaDocRuntimeFormulas(config), true);
    assert.equal(canCreateIkaDocRuntimeCharts(config), true);
    assert.equal(canUseIkaDocRuntimeCustomWidgets(config), true);
    assert.equal(canUseIkaDocRuntimeComments(config), true);
    assert.equal(canRefreshIkaDocRuntimeSource(config), true);
    assert.equal(canSaveToIkaDocRuntime(config), true);
    assert.equal(canDiscardIkaDocRuntime(config), true);
  });

  it("hides authoring surfaces in viewer mode even when authoring capabilities are present", function() {
    const config = runtimeConfig("viewer", {
      canEditStructure: true,
      canUseFormulas: true,
      canCreateCharts: true,
      canUseCustomWidgets: true,
    });

    assert.equal(shouldShowIkaDocRuntimeAuthoringSurfaces(config), false);
  });

  it("hides authoring side panels for cell-only editor sessions", function() {
    const config = runtimeConfig("editor", { canEditCells: true });

    assert.equal(shouldShowIkaDocRuntimeAuthoringSurfaces(config), false);
  });

  it("shows authoring side panels for structure-capable editor sessions", function() {
    const config = runtimeConfig("editor", { canEditStructure: true });

    assert.equal(shouldShowIkaDocRuntimeAuthoringSurfaces(config), true);
  });
});

function runtimeConfig(
  mode: IkaDocRuntimeConfig["mode"],
  capabilities: Partial<IkaDocRuntimeCapabilities>,
): IkaDocRuntimeConfig {
  return {
    enabled: true,
    sessionId: "session-1",
    user: {
      userId: "user-1",
      username: "user@example.test",
      displayName: "User",
    },
    collectionCode: "collection-1",
    sourceType: "document-file",
    mode,
    expiresAt: "2026-07-20T00:00:00.000Z",
    documentId: "doc-1",
    documentUrlId: "doc-url-1",
    workerUrl: "https://records.owarelin.localhost/o/docs/doc-url-1",
    statusUrl: "https://records.owarelin.localhost/api/grist/session/status",
    validationUrl: "https://records.owarelin.localhost/api/grist/editor/session-validation",
    discardUrl: "https://records.owarelin.localhost/api/grist/session/discard",
    proposalUrl: "https://records.owarelin.localhost/api/grist/session/proposal",
    capabilities: {
      ...DENIED_CAPABILITIES,
      ...capabilities,
    },
    locale: "en",
    appearance: "light",
  };
}
