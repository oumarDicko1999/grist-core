import { ikaDocDocApiGates } from "app/server/lib/IkaDocDocApiGates";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

import { readFileSync } from "fs";
import { resolve } from "path";

import { assert } from "chai";

const SERVER_SEAMS = [
  {
    file: "app/server/lib/DocApi.ts",
    anchors: [
      `createIkaDocRuntimeAuthMiddleware(
        this._dbManager,
        this._ikadocRuntimeSessionRegistry,
        this._ikadocEditorAdmissionClient,
        this._ikadocForwardAuthSecret,
      )`,
      "attachIkaDocDocApiGates(this._app, this._ikadocRuntimeSessionRegistry);",
      "requireIkaDocExternalDataGate(this._ikadocRuntimeSessionRegistry)",
      "assertIkaDocUserActions(activeDoc.docName, actions, req);",
      "getTableOperations(req, activeDoc, undefined, this._ikadocRuntimeSessionRegistry)",
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
  // A gate only runs if Grist still declares its route with the same method and path: after an
  // upstream upgrade renames or moves a route, this fails instead of the gate silently not matching.
  it("keeps a Grist route for every IkaDoc document REST gate", function() {
    const docApi = readFileSync(resolve(process.cwd(), "app/server/lib/DocApi.ts"), "utf8");

    for (const { method, path } of ikaDocDocApiGates(new IkaDocRuntimeSessionRegistry())) {
      assert.include(docApi, `this._app.${method}("${path}",`, `${method.toUpperCase()} ${path}`);
    }
  });

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
