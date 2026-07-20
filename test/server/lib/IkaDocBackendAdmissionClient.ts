import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import { IkaDocBackendAdmissionClient } from "app/server/lib/IkaDocBackendAdmissionClient";

import * as http from "http";

import { assert } from "chai";

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
  capabilities: DENIED_IKADOC_CAPABILITIES,
  locale: "en",
  appearance: "dark",
} as const;

describe("IkaDoc backend admission client", function() {
  it("posts the browser proof to IkaDoc and parses accepted admission", async function() {
    const receivedRequests: CapturedAdmissionRequest[] = [];
    const server = await startAdmissionServer(async (req, body) => {
      receivedRequests.push({ headers: req.headers, body });
      return {
        status: 200,
        body: {
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
            capabilities: { canEditCells: true, canSaveToIkaDoc: true },
            runtimeConfig: RUNTIME_CONFIG,
          },
        },
      };
    });

    try {
      const client = new IkaDocBackendAdmissionClient({
        admissionUrl: server.url,
        bearerToken: "shared-secret",
        timeoutMs: 1000,
      });
      const result = await client.admitEditor({
        sessionId: "session-1",
        proof: { kind: "backend-session" },
        cookieHeader: "ikadoc-session=session-cookie",
        origin: "https://records.owarelin.localhost",
        locale: "fr",
        theme: "material",
        appearance: "dark",
      });

      assert.equal(result.kind, "accepted");
      if (result.kind === "accepted") {
        assert.equal(result.admission.tenantId, "tenant-1");
        assert.isTrue(result.admission.capabilities.canEditCells);
        assert.isTrue(result.admission.capabilities.canSaveToIkaDoc);
        assert.deepEqual(result.admission.runtimeConfig, {
          ...RUNTIME_CONFIG,
          sourceSummary: undefined,
          saveUrl: undefined,
          refreshUrl: undefined,
          proposalUrl: undefined,
          blockedCapabilityUrl: undefined,
          guidedWorkspace: undefined,
          capabilities: DENIED_IKADOC_CAPABILITIES,
          theme: undefined,
          appearance: "dark",
        });
      }
      assert.equal(receivedRequests.length, 1);
      assert.equal(receivedRequests[0].headers.cookie, "ikadoc-session=session-cookie");
      assert.equal(receivedRequests[0].headers.authorization, "Bearer shared-secret");
      assert.deepEqual(receivedRequests[0].body, {
        sessionId: "session-1",
        proof: { kind: "backend-session" },
        origin: "https://records.owarelin.localhost",
        locale: "fr",
        theme: "material",
        appearance: "dark",
      });
    } finally {
      await server.close();
    }
  });

  it("passes through finite backend denial responses", async function() {
    const server = await startAdmissionServer(async () => ({
      status: 403,
      body: {
        kind: "denied",
        code: "tenant-mismatch",
        safeMessage: "Tenant mismatch.",
      },
    }));

    try {
      const result = await admit(server.url);

      assert.deepEqual(result, {
        kind: "denied",
        code: "tenant-mismatch",
        safeMessage: "Tenant mismatch.",
      });
    } finally {
      await server.close();
    }
  });

  it("denies malformed successful responses", async function() {
    const server = await startAdmissionServer(async () => ({
      status: 200,
      body: { kind: "accepted", admission: { sessionId: "session-1" } },
    }));

    try {
      const result = await admit(server.url);

      assert.deepEqual(result, {
        kind: "denied",
        code: "malformed-response",
        safeMessage: "IkaDoc editor admission returned an invalid response.",
      });
    } finally {
      await server.close();
    }
  });

  it("maps IkaDoc auth boundary denials to permission denied", async function() {
    const server = await startAdmissionServer(async () => ({
      status: 401,
      body: {
        error: "Unauthorized",
        code: "Unauthorized",
      },
    }));

    try {
      const result = await admit(server.url);

      assert.deepEqual(result, {
        kind: "denied",
        code: "permission-denied",
        safeMessage: "IkaDoc editor admission was denied.",
      });
    } finally {
      await server.close();
    }
  });

  it("denies non-json backend failures as unavailable", async function() {
    const server = await startAdmissionServer(async () => ({
      status: 502,
      text: "bad gateway",
    }));

    try {
      const result = await admit(server.url);

      assert.deepEqual(result, {
        kind: "denied",
        code: "backend-unavailable",
        safeMessage: "IkaDoc editor admission is unavailable.",
      });
    } finally {
      await server.close();
    }
  });
});

interface CapturedAdmissionRequest {
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

interface AdmissionServerResponse {
  status: number;
  body?: unknown;
  text?: string;
}

async function admit(admissionUrl: string) {
  const client = new IkaDocBackendAdmissionClient({ admissionUrl, timeoutMs: 1000 });
  return await client.admitEditor({
    sessionId: "session-1",
    proof: { kind: "backend-session" },
  });
}

async function startAdmissionServer(
  handler: (req: http.IncomingMessage, body: unknown) => Promise<AdmissionServerResponse>,
) {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(Buffer.from(chunk)));
    req.on("end", async () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const response = await handler(req, rawBody ? JSON.parse(rawBody) : undefined);
      res.statusCode = response.status;
      if (response.body !== undefined) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(response.body));
        return;
      }

      res.end(response.text || "");
    });
  });

  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  assert.isObject(address);
  const port = (address as { port: number }).port;

  return {
    url: `http://127.0.0.1:${port}/admit`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}
