import { SandboxInfo } from "app/common/SandboxInfo";
import { attachIkaDocRuntimeHealthEndpoint } from "app/server/lib/IkaDocRuntimeHealthEndpoint";

import * as http from "http";

import axios from "axios";
import { assert } from "chai";
import express from "express";

describe("IkaDoc runtime health endpoint", function() {
  it("proves formula sandbox effectiveness from Grist sandbox info", async function() {
    const response = await requestSandboxProof({
      auth: true,
      sandboxInfo: {
        flavor: "pyodide",
        configured: true,
        functional: true,
        effective: true,
        lastSuccessfulStep: "all",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      flavor: "pyodide",
      effective: true,
    });
  });

  it("does not report proof when the sandbox is functional but ineffective", async function() {
    const response = await requestSandboxProof({
      auth: true,
      sandboxInfo: {
        flavor: "unsandboxed",
        configured: false,
        functional: true,
        effective: false,
        lastSuccessfulStep: "all",
      },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      flavor: "unsandboxed",
      effective: false,
    });
  });

  it("requires an authenticated API request", async function() {
    const response = await requestSandboxProof({
      auth: false,
      sandboxInfo: {
        flavor: "pyodide",
        configured: true,
        functional: true,
        effective: true,
        lastSuccessfulStep: "all",
      },
    });

    assert.equal(response.status, 401);
  });
});

async function requestSandboxProof(options: {
  auth: boolean;
  sandboxInfo: SandboxInfo;
}) {
  const app = express();
  if (options.auth) {
    app.use((req, _res, next) => {
      Object.assign(req, { userId: 1, userIsAuthorized: true });
      next();
    });
  }
  attachIkaDocRuntimeHealthEndpoint({
    app,
    getSandboxInfo: async () => options.sandboxInfo,
  });
  app.use(((error, _req, res, _next) => {
    const status = error instanceof Error && "status" in error ? Number(error.status) : 500;
    res.status(Number.isInteger(status) ? status : 500).json({ error: error.message });
  }) as express.ErrorRequestHandler);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  assert.isObject(address);

  try {
    const port = (address as { port: number }).port;
    return await axios.get(
      `http://127.0.0.1:${port}/api/ikadoc/runtime/formula-sandbox-proof`,
      { validateStatus: () => true },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}
