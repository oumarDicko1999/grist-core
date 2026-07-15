import { assert } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

const SERVER_SEAMS = [
  {
    file: "app/server/lib/DocApi.ts",
    anchors: [
      "requireIkaDocCapability(",
      `createIkaDocRuntimeAuthMiddleware(
        this._dbManager,
        this._ikadocRuntimeSessionRegistry,
        this._ikadocEditorAdmissionClient,
        this._ikadocForwardAuthSecret,
      )`,
      "this._app.use(\n      \"/api/docs/:docId\"",
      "\"canEditCells\"",
      "\"canUseAttachments\"",
      "\"canExportFromBrowser\"",
      "\"canViewHistory\"",
      "\"canManageAccess\"",
      "\"canUseExternalData\"",
      "denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, \"fork document\")",
      "denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, \"copy document\")",
      "denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, \"use proposals\")",
      "denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, \"use assistant\")",
      "requireIkaDocUserActionsForRequest(this._ikadocRuntimeSessionRegistry)",
      "this._app.get(\"/api/docs/:docId/download\", canView, requireIkaDocBrowserExport",
      "this._app.post(\"/api/docs/:docId/fork\", canView, denyIkaDocFork",
    ],
  },
  {
    file: "app/server/lib/AppEndpoint.ts",
    anchors: [
      "denyIkaDocRuntimeOperation(",
      "\"browse Grist home, template, or workspace pages\"",
      "app.get([\"/\", \"/ws/:wsId\", \"/p/:page\"], denyIkaDocHomeSurface",
      "app.get(\"/apiconsole\", denyIkaDocHomeSurface",
      "attachIkaDocEditorEndpoint({",
    ],
  },
  {
    file: "app/server/lib/DocWorker.ts",
    anchors: [
      "activeDocMethod.bind(",
      "this._ikadocRuntimeSessionRegistry",
      "this._ikadocRuntimeSessionValidator",
      "\"applyUserActions\"",
      "\"addAttachments\"",
      "\"importFiles\"",
      "\"fetchURL\"",
      "\"fork\"",
      "\"getUsersForViewAs\"",
      "\"getAccessToken\"",
      "\"getShare\"",
      "\"forwardPluginRpc\"",
    ],
  },
] as const;

describe("IkaDoc server seams", function() {
  for (const seam of SERVER_SEAMS) {
    it(`keeps IkaDoc runtime policy anchors in ${seam.file}`, function() {
      const source = readFileSync(resolve(process.cwd(), seam.file), "utf8");

      for (const anchor of seam.anchors) {
        assert.include(source, anchor);
      }
    });
  }
});
