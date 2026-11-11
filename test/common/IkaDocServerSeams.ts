import { readFileSync } from "fs";
import { resolve } from "path";

import { assert } from "chai";

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
      'this._app.use(\n      "/api/docs/:docId"',
      '"canEditCells"',
      '"canUseAttachments"',
      '"canExportFromBrowser"',
      '"canViewHistory"',
      "requireIkaDocHistoryView",
      '"canManageAccess"',
      '"canUseExternalData"',
      'denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, "fork document")',
      'denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, "copy document")',
      'denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, "use proposals")',
      'denyIkaDocRuntimeOperation(this._ikadocRuntimeSessionRegistry, "use assistant")',
      "requireIkaDocUserActionsForRequest(this._ikadocRuntimeSessionRegistry)",
      'this._app.get("/api/docs/:docId/download", canView, requireIkaDocBrowserExport',
      'this._app.post("/api/docs/:docId/uploads", canView, requireIkaDocAttachmentUse',
      'this._app.get("/api/docs/:docId/attachments", canView, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/attachments/transferAll", isOwner, requireIkaDocAttachmentUse',
      'this._app.get("/api/docs/:docId/attachments/transferStatus", canView, requireIkaDocAttachmentUse',
      'this._app.get("/api/docs/:docId/attachments/store", canView, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/attachments/store", isOwner, requireIkaDocAttachmentUse',
      'this._app.get("/api/docs/:docId/attachments/stores", isOwner, requireIkaDocAttachmentUse',
      'this._app.get("/api/docs/:docId/attachments/:attId", canView, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/attachments/updateUsed", canEdit, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/attachments/removeUnused", isOwner, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/attachments/verifyFiles", isOwner, requireIkaDocAttachmentUse',
      'this._app.post("/api/docs/:docId/fork", canView, denyIkaDocFork',
    ],
  },
  {
    file: "app/server/lib/IkaDocRuntimePolicy.ts",
    anchors: [
      "sessionMatchesDocumentId",
      "assertIkaDocUserActionsAllowedForSession",
      "function activeSessionOrRefuse(",
    ],
  },
  {
    file: "app/server/lib/IkaDocRuntimeDenial.ts",
    anchors: [
      "const BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS = 5000;",
      "timeout: BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS",
    ],
  },
  {
    file: "app/server/lib/IkaDocUserActionPolicy.ts",
    anchors: [
      'tableId === "_grist_Cells"',
      'return ["canUseComments"]',
    ],
  },
  {
    file: "app/server/lib/IkaDocActiveDocMethod.ts",
    anchors: [
      "ikaDocRuntimeSessionFromAuthSession",
      "validateIkaDocRuntimeSession(",
      "requireIkaDocRuntimeCapabilityForSession(",
      "assertIkaDocUserActionsAllowedForSession(",
      "classifyUserActions",
    ],
  },
  {
    file: "app/server/lib/IkaDocRuntimeAuth.ts",
    anchors: [
      "ikaDocRuntimeSessionFromAuthSession",
      "public readonly session: IkaDocRuntimeSession",
    ],
  },
  {
    file: "Dockerfile",
    anchors: [
      "Owarelin/IkaDoc (GW-SEC-03)",
      "GRIST_SANDBOX_FLAVOR=gvisor",
    ],
  },
  {
    file: "app/server/lib/AppEndpoint.ts",
    anchors: [
      "denyIkaDocRuntimeOperation(",
      '"browse Grist home, template, or workspace pages"',
      'app.get(["/", "/ws/:wsId", "/p/:page"], denyIkaDocHomeSurface',
      'app.get("/apiconsole", denyIkaDocHomeSurface',
      "attachIkaDocEditorEndpoint({",
    ],
  },
  {
    file: "app/server/lib/Sharing.ts",
    anchors: ["assertIkaDocLockedColumnsKept(docSession, getEnvContent(applyResult.stored));"],
  },
  {
    file: "app/server/lib/DocWorker.ts",
    anchors: [
      "activeDocMethod.bind(",
      "this._ikadocRuntimeSessionRegistry",
      "this._ikadocRuntimeSessionValidator",
      '"applyUserActions"',
      "classifyUserActions: true",
      '"applyUserActionsById"',
      "capabilities: [",
      '"canUseCustomWidgets"',
      '"addAttachments"',
      '"importFiles"',
      '"fetchURL"',
      '"getActionSummaries"',
      '"fork"',
      '"getUsersForViewAs"',
      '"checkAclFormula"',
      "check access formula",
      '"getAclResources"',
      "list access resources",
      '"getAssistantState"',
      '"applyProposal"',
      '"getAssistance"',
      '"getAccessToken"',
      '"getShare"',
      '"forwardPluginRpc"',
    ],
  },
] as const;

describe("IkaDoc server seams", function() {
  for (const seam of SERVER_SEAMS) {
    it(`keeps IkaDoc runtime policy anchors in ${seam.file}`, function() {
      const source = withoutLineWrapping(readFileSync(resolve(process.cwd(), seam.file), "utf8"));

      for (const anchor of seam.anchors) {
        assert.include(source, withoutLineWrapping(anchor));
      }
    });
  }
});

/** The same call reads the same whether the formatter wraps its arguments or not. */
function withoutLineWrapping(code: string): string {
  return code.replace(/\(\s+/g, "(").replace(/,\s*\)/g, ")").replace(/,\s+/g, ", ");
}
