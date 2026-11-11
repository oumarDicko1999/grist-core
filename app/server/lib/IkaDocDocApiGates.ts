import { RequestWithLogin } from "app/server/lib/Authorizer";
import {
  denyIkaDocRuntimeOperation,
  requireIkaDocCapability,
  requireIkaDocUserActionsForRequest,
} from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

import { Application, RequestHandler } from "express";

type RouteMethod = "get" | "post" | "patch" | "delete";

/** One document REST route and the IkaDoc gates that run before Grist's own handler for it. */
export interface IkaDocDocApiGate {
  method: RouteMethod;
  path: string;
  gates: RequestHandler[];
}

/**
 * Registers IkaDoc's gates for Grist's document REST routes, each on the same method and path as
 * the upstream route and before it, so Express runs the gate first and upstream route declarations
 * stay untouched. Must be called before DocApi registers its routes and after the IkaDoc runtime
 * credential is attached. A gate that refuses ends the request; otherwise Grist's handler runs.
 */
export function attachIkaDocDocApiGates(app: Application, registry: IkaDocRuntimeSessionRegistry): void {
  for (const { method, path, gates } of ikaDocDocApiGates(registry)) {
    app[method](path, ...gates);
  }
}

/** Every gated route, exported so a test can check Grist still declares each one after an upgrade. */
export function ikaDocDocApiGates(registry: IkaDocRuntimeSessionRegistry): IkaDocDocApiGate[] {
  const cellEdit = requireIkaDocCapability(registry, "canEditCells", "apply document edits");
  const userActions = requireIkaDocUserActionsForRequest(registry);
  const attachmentUse = requireIkaDocCapability(registry, "canUseAttachments", "use document attachments");
  const historyView = requireIkaDocCapability(registry, "canViewHistory", "view document history");
  const accessManagement = requireIkaDocCapability(registry, "canManageAccess", "manage document access");
  const externalData = requireIkaDocCapability(registry, "canUseExternalData", "manage webhook or trigger egress");

  const runtimeExport = requireIkaDocCapability(registry, "canExportFromBrowser", "export or download document data");
  // IkaDoc's service account downloads with its API key; browsers need the export capability.
  const browserExport: RequestHandler = (req, res, next) => {
    if ((req as RequestWithLogin).isApiKeyAuth) {
      return next();
    }
    return runtimeExport(req, res, next);
  };

  const fork = denyIkaDocRuntimeOperation(registry, "fork document");
  const copy = denyIkaDocRuntimeOperation(registry, "copy document");
  const externalSend = denyIkaDocRuntimeOperation(registry, "send document data to external services");
  const adminMutation = denyIkaDocRuntimeOperation(registry, "perform document administration");
  const historyMutation = denyIkaDocRuntimeOperation(registry, "modify document history");
  const proposal = denyIkaDocRuntimeOperation(registry, "use proposals");
  const assistant = denyIkaDocRuntimeOperation(registry, "use assistant");
  const timing = denyIkaDocRuntimeOperation(registry, "use document timing diagnostics");
  const documentCreation = denyIkaDocRuntimeOperation(registry, "create or import Grist documents");

  return [
    { method: "post", path: "/api/docs/:docId/apply", gates: [cellEdit, userActions] },

    { method: "post", path: "/api/docs/:docId/attachments", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/uploads", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/transferAll", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/transferStatus", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/store", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/store", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/stores", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/archive", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/archive", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/:attId", gates: [attachmentUse] },
    { method: "get", path: "/api/docs/:docId/attachments/:attId/download", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/updateUsed", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/removeUnused", gates: [attachmentUse] },
    { method: "post", path: "/api/docs/:docId/attachments/verifyFiles", gates: [attachmentUse] },

    { method: "get", path: "/api/docs/:docId/download", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/download/table-schema", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/download/csv", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/download/tsv", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/download/dsv", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/download/xlsx", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/compare/:docId2", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/compare", gates: [browserExport] },
    { method: "get", path: "/api/docs/:docId/send-to-drive", gates: [externalSend] },

    // Webhooks and triggers (DocApiTriggers) send document data outside.
    { method: "post", path: "/api/docs/:docId/webhooks", gates: [externalData] },
    { method: "post", path: "/api/docs/:docId/tables/:tableId/_subscribe", gates: [externalData] },
    { method: "post", path: "/api/docs/:docId/tables/:tableId/_unsubscribe", gates: [externalData] },
    { method: "delete", path: "/api/docs/:docId/webhooks/queue", gates: [externalData] },
    { method: "delete", path: "/api/docs/:docId/webhooks/:webhookId", gates: [externalData] },
    { method: "patch", path: "/api/docs/:docId/webhooks/:webhookId", gates: [externalData] },
    { method: "delete", path: "/api/docs/:docId/webhooks/queue/:webhookId", gates: [externalData] },
    { method: "get", path: "/api/docs/:docId/webhooks", gates: [externalData] },
    { method: "get", path: "/api/docs/:docId/triggers", gates: [externalData] },
    { method: "post", path: "/api/docs/:docId/triggers", gates: [externalData] },
    { method: "patch", path: "/api/docs/:docId/triggers", gates: [externalData] },
    { method: "post", path: "/api/docs/:docId/triggers/delete", gates: [externalData] },
    { method: "get", path: "/api/docs/:docId/triggers/monitor", gates: [externalData] },

    { method: "post", path: "/api/docs/:docId/fork", gates: [fork] },
    { method: "post", path: "/api/docs/:docId/create-fork", gates: [fork] },
    { method: "post", path: "/api/docs/:docId/copy", gates: [copy] },
    { method: "post", path: "/api/docs", gates: [documentCreation] },
    { method: "post", path: "/api/workspaces/:wid/import", gates: [documentCreation] },

    { method: "post", path: "/api/docs/:docId/force-reload", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/recover", gates: [adminMutation] },
    { method: "delete", path: "/api/docs/:docId", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/remove", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/disable", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/enable", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/assign", gates: [adminMutation] },
    { method: "post", path: "/api/docs/:docId/replace", gates: [adminMutation] },

    { method: "get", path: "/api/docs/:docId/snapshots", gates: [historyView] },
    { method: "get", path: "/api/docs/:docId/states", gates: [historyView] },
    { method: "post", path: "/api/docs/:docId/snapshots/remove", gates: [historyMutation] },
    { method: "post", path: "/api/docs/:docId/states/remove", gates: [historyMutation] },
    { method: "get", path: "/api/docs/:docId/usersForViewAs", gates: [accessManagement] },

    { method: "post", path: "/api/docs/:docId/propose", gates: [proposal] },
    { method: "get", path: "/api/docs/:docId/proposals", gates: [proposal] },
    { method: "post", path: "/api/docs/:docId/proposals/:proposalId/apply", gates: [proposal] },
    { method: "post", path: "/api/docs/:docId/assistant", gates: [assistant] },
    { method: "get", path: "/api/docs/:docId/timing", gates: [timing] },
    { method: "post", path: "/api/docs/:docId/timing/start", gates: [timing] },
    { method: "post", path: "/api/docs/:docId/timing/stop", gates: [timing] },
  ];
}
