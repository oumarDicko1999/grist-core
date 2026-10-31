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

  it("reports the outbound and plugin settings the process actually runs with (GW-SEC-04)", async function() {
    const names = [
      "GRIST_ENABLE_REQUEST_FUNCTION",
      "ALLOWED_WEBHOOK_DOMAINS",
      "GRIST_EXPERIMENTAL_PLUGINS",
      "GRIST_TRUST_PLUGINS",
      "GRIST_WIDGET_LIST_URL",
    ];
    const saved = new Map(names.map(name => [name, process.env[name]]));
    try {
      process.env.GRIST_ENABLE_REQUEST_FUNCTION = "1";
      process.env.ALLOWED_WEBHOOK_DOMAINS = "hooks.ikadoc.test";
      process.env.GRIST_EXPERIMENTAL_PLUGINS = "0";
      delete process.env.GRIST_TRUST_PLUGINS;
      delete process.env.GRIST_WIDGET_LIST_URL;

      const response = await requestSandboxProof({
        auth: true,
        path: "/api/ikadoc/runtime/posture",
        sandboxInfo: {
          flavor: "gvisor",
          configured: true,
          functional: true,
          effective: true,
          lastSuccessfulStep: "all",
        },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(response.data, {
        sandbox: { flavor: "gvisor", effective: true },
        requestFunctionEnabled: true,
        webhookDomains: { wildcard: false, allowed: ["hooks.ikadoc.test"] },
        experimentalPluginsEnabled: false,
        trustedPlugins: false,
        widgetRepositoryConfigured: false,
      });
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });
});

async function requestSandboxProof(options: {
  auth: boolean;
  sandboxInfo: SandboxInfo;
  path?: string;
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
      `http://127.0.0.1:${port}${options.path ?? "/api/ikadoc/runtime/formula-sandbox-proof"}`,
      { validateStatus: () => true },
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}
