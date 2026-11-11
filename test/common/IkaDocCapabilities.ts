import {
  DENIED_IKADOC_CAPABILITIES,
  normalizeIkaDocCapabilities,
} from "app/ikadoc/IkaDocCapabilities";

import { assert } from "chai";

describe("IkaDocCapabilities", function() {
  it("denies every capability by default", function() {
    assert.deepEqual(normalizeIkaDocCapabilities(), DENIED_IKADOC_CAPABILITIES);
  });

  it("keeps unspecified capabilities denied when overrides are provided", function() {
    assert.deepEqual(normalizeIkaDocCapabilities({
      canEditCells: true,
      canCreateCharts: true,
      canSaveToIkaDoc: true,
    }), {
      ...DENIED_IKADOC_CAPABILITIES,
      canEditCells: true,
      canCreateCharts: true,
      canSaveToIkaDoc: true,
    });
  });

  it("treats browser egress and account capabilities as denied unless explicitly enabled", function() {
    const capabilities = normalizeIkaDocCapabilities({ canEditCells: true });

    assert.equal(capabilities.canExportFromBrowser, false);
    assert.equal(capabilities.canImportLocalFiles, false);
    assert.equal(capabilities.canInviteCollaborators, false);
    assert.equal(capabilities.canShare, false);
    assert.equal(capabilities.canFork, false);
    assert.equal(capabilities.canPublish, false);
    assert.equal(capabilities.canManageAccess, false);
    assert.equal(capabilities.canUsePlugins, false);
  });
});
