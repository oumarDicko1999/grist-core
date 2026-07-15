import { IkaDocBackendSessionValidator } from "app/server/lib/IkaDocBackendSessionValidator";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";

import { assert } from "chai";
import { AddressInfo } from "net";
import { createServer, IncomingMessage, ServerResponse } from "http";

describe("IkaDoc backend session validator", function() {
  it("posts session, document, and operation proof with the configured bearer token", async function() {
    const receivedRequests: CapturedValidationRequest[] = [];
    const server = await startValidationServer(async (req, body) => {
      receivedRequests.push({ headers: req.headers, body });
      return { status: 204, body: "" };
    });

    try {
      const validator = new IkaDocBackendSessionValidator("validation-token", 1000);
      await validator.validate(runtimeSession(server.url), "apply document edits");

      assert.lengthOf(receivedRequests, 1);
      assert.equal(receivedRequests[0].headers.authorization, "Bearer validation-token");
      assert.deepEqual(receivedRequests[0].body, {
        sessionId: "session-1",
        documentId: "doc-1",
        documentUrlId: "doc-url-1",
        operation: "apply document edits",
      });
    } finally {
      await server.close();
    }
  });

  it("rejects websocket execution when IkaDoc validation fails", async function() {
    const server = await startValidationServer(async () => ({
      status: 403,
      body: JSON.stringify({ error: "session revoked" }),
    }));

    try {
      const validator = new IkaDocBackendSessionValidator("validation-token", 1000);
      const error = await captureError(() => validator.validate(runtimeSession(server.url), "apply document edits"));

      assert.match(error?.message ?? "", /IkaDoc editor session rejected apply document edits/);
    } finally {
      await server.close();
    }
  });
});

interface CapturedValidationRequest {
  headers: IncomingMessage["headers"];
  body: unknown;
}

interface ValidationServer {
  url: string;
  close(): Promise<void>;
}

async function startValidationServer(
  handler: (
    req: IncomingMessage,
    body: unknown,
  ) => Promise<{ status: number; body: string }>,
): Promise<ValidationServer> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readRequestBody(req);
    const response = await handler(req, body);
    res.statusCode = response.status;
    res.end(response.body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/api/grist/editor/session-validation`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.length === 0 ? undefined : JSON.parse(raw);
}

function runtimeSession(validationUrl: string): IkaDocRuntimeSession {
  return {
    sessionId: "session-1",
    documentId: "doc-1",
    documentUrlId: "doc-url-1",
    registeredAtMs: Date.now(),
    config: {
      enabled: true,
      sessionId: "session-1",
      user: {
        userId: "user-1",
        username: "admin",
        displayName: "admin",
      },
      collectionCode: "records",
      sourceType: "document-file",
      mode: "editor",
      expiresAt: "2099-01-01T00:00:00.000Z",
      documentId: "doc-1",
      documentUrlId: "doc-url-1",
      workerUrl: "/api/docs/doc-1",
      statusUrl: "/api/grist/sessions/session-1",
      validationUrl,
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
        canExportFromBrowser: false,
        canShare: false,
        canFork: false,
        canPublish: false,
        canManageAccess: false,
        canUsePlugins: false,
      },
      locale: "en",
      appearance: "light",
    },
  };
}

async function captureError(action: () => Promise<void>): Promise<Error | undefined> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}
