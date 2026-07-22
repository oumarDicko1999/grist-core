import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocEditorAdmissionClient,
  IkaDocEditorAdmissionRequest,
} from "app/ikadoc/IkaDocEditorAdmission";
import { attachIkaDocEditorEndpoint } from "app/server/lib/IkaDocEditorEndpoint";
import { IKADOC_RUNTIME_SESSION_COOKIE } from "app/server/lib/IkaDocRuntimePolicy";
import { ISendAppPageOptions } from "app/server/lib/sendAppPage";

import * as http from "http";

import axios from "axios";
import { assert } from "chai";
import express from "express";

const RUNTIME_CONFIG = {
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
  blockedCapabilityUrl: "/ikadoc/sessions/session-1/blocked-capability",
  capabilities: DENIED_IKADOC_CAPABILITIES,
  locale: "en",
  appearance: "dark",
} as const;

describe("IkaDoc app endpoint", function() {
  it("fails closed when the admission client is not configured", async function() {
    const app = express();
    const sentPages: ISendAppPageOptions[] = [];
    attachTestEditorEndpoint(app, sentPages);
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/grist/editor/session-1");

    assert.equal(response.status, 503);
    assert.deepEqual(response.data, { error: "Spreadsheet editor runtime is not configured." });
    assert.deepEqual(sentPages, []);
  });

  it("serves the app with explicit IkaDoc config after admission", async function() {
    const app = express();
    const sentPages: ISendAppPageOptions[] = [];
    const admissionRequests: IkaDocEditorAdmissionRequest[] = [];
    const admissionClient: IkaDocEditorAdmissionClient = {
      async admitEditor(request) {
        admissionRequests.push(request);
        return {
          kind: "accepted",
          admission: {
            sessionId: "session-1",
            actorId: "actor-1",
            tenantId: "tenant-1",
            deploymentId: "deployment-1",
            controlAuthority: "saas",
            sourceType: "document-file",
            mode: "editor",
            expiresAt: "2099-01-01T00:00:00.000Z",
            capabilities: DENIED_IKADOC_CAPABILITIES,
            runtimeConfig: RUNTIME_CONFIG,
          },
        };
      },
    };
    attachTestEditorEndpoint(app, sentPages, admissionClient);
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/grist/editor/session-1?theme=material&appearance=dark&locale=fr", {
      Cookie: "ikadoc-session=session-cookie",
      Origin: "https://records.owarelin.localhost",
    });

    assert.equal(response.status, 200);
    assert.equal(admissionRequests.length, 1);
    assert.deepEqual(admissionRequests[0], {
      sessionId: "session-1",
      proof: { kind: "backend-session" },
      cookieHeader: "ikadoc-session=session-cookie",
      origin: "https://records.owarelin.localhost",
      locale: "fr",
      theme: "material",
      appearance: "dark",
    });
    assert.equal(sentPages.length, 1);
    assert.deepInclude(sentPages[0], {
      path: "",
      content: "<html></html>",
      tag: "test-tag",
      status: 200,
      googleTagManager: false,
    });
    assert.deepEqual(sentPages[0].config, {
      assignmentId: "doc-1",
      assistant: undefined,
      enableWidgetRepository: false,
      experimentalPlugins: false,
      getWorker: { "doc-1": "/ikadoc/sessions/session-1/worker" },
      ikadoc: RUNTIME_CONFIG,
      permittedCustomWidgets: [],
      pluginUrl: "http://plugins.invalid",
      plugins: [],
    });
    assert.isTrue(
      response.headers["set-cookie"]?.some(cookie => cookie.startsWith(`${IKADOC_RUNTIME_SESSION_COOKIE}=session-1;`)),
    );
    assert.isTrue(
      response.headers["set-cookie"]?.some(cookie => cookie.includes("Path=/")),
    );
  });

  for (const admissionDenial of [
    { code: "session-expired", safeMessage: "The spreadsheet session expired.", status: 403 },
    { code: "session-revoked", safeMessage: "The spreadsheet session was revoked.", status: 403 },
    { code: "tenant-mismatch", safeMessage: "The spreadsheet session belongs to another tenant.", status: 403 },
    { code: "actor-mismatch", safeMessage: "The spreadsheet session belongs to another user.", status: 403 },
    { code: "module-disabled", safeMessage: "The Grist module is disabled.", status: 403 },
    { code: "permission-denied", safeMessage: "Permission denied.", status: 403 },
    { code: "session-not-found", safeMessage: "The spreadsheet session was not found.", status: 404 },
    { code: "backend-unavailable", safeMessage: "Spreadsheet editor admission is unavailable.", status: 503 },
    {
      code: "malformed-response",
      safeMessage: "Spreadsheet editor admission returned an invalid response.",
      status: 502,
    },
  ] as const) {
    it(`maps ${admissionDenial.code} admission denial without serving Grist`, async function() {
      const app = express();
      const sentPages: ISendAppPageOptions[] = [];
      const admissionClient: IkaDocEditorAdmissionClient = {
        async admitEditor() {
          return {
            kind: "denied",
            code: admissionDenial.code,
            safeMessage: admissionDenial.safeMessage,
          };
        },
      };
      attachTestEditorEndpoint(app, sentPages, admissionClient);
      attachJsonErrorHandler(app);

      const response = await requestApp(app, "/grist/editor/session-1");

      assert.equal(response.status, admissionDenial.status);
      assert.equal(response.data, admissionDenial.safeMessage);
      assert.deepEqual(sentPages, []);
    });
  }
});

function attachTestEditorEndpoint(
  app: express.Application,
  sentPages: ISendAppPageOptions[],
  admissionClient?: IkaDocEditorAdmissionClient,
) {
  attachIkaDocEditorEndpoint({
    app,
    middleware: [],
    async sendAppPage(_req, res, options) {
      sentPages.push(options);
      res.status(options.status).json(options.config);
    },
    getDocTemplate: async () => ({ page: "<html></html>", tag: "test-tag" }),
    admissionClient,
  });
}

function attachJsonErrorHandler(app: express.Application) {
  app.use((
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err.status || 500).json({ error: err.message });
  });
}

async function requestApp(
  app: express.Application,
  path: string,
  headers?: Record<string, string>,
) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  assert.isObject(address);

  try {
    const port = (address as { port: number }).port;
    return await axios.get(`http://127.0.0.1:${port}${path}`, {
      headers,
      validateStatus: () => true,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}
