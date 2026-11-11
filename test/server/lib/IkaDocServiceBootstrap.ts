import { User } from "app/gen-server/entity/User";
import { HomeDBAuth } from "app/gen-server/lib/homedb/Interfaces";
import { resolveIdentity } from "app/server/lib/Authorizer";
import { createDummyGristServer } from "app/server/lib/GristServer";
import { getBootKey } from "app/server/lib/gristSettings";
import { createIkaDocRuntimeAuthMiddleware } from "app/server/lib/IkaDocRuntimeAuth";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { InstallAdmin } from "app/server/lib/InstallAdmin";
import { IPermitStore } from "app/server/lib/Permit";

import { AddressInfo } from "net";

import axios, { Method } from "axios";
import { assert } from "chai";
import express from "express";

describe("IkaDoc service-key bootstrap", function() {
  const bootKey = "test-service-bootstrap-key";
  let previousBootKey: string | undefined;

  beforeEach(function() {
    previousBootKey = process.env.GRIST_BOOT_KEY;
    process.env.GRIST_BOOT_KEY = bootKey;
    getBootKey.cache.clear();
  });

  afterEach(function() {
    if (previousBootKey === undefined) {
      delete process.env.GRIST_BOOT_KEY;
    } else {
      process.env.GRIST_BOOT_KEY = previousBootKey;
    }
    getBootKey.cache.clear();
  });

  for (const method of ["GET", "POST"] as const) {
    it(`authenticates ${method} provisioning with the native boot-key resolver`, async function() {
      const response = await provisioningRequest(method, "/o/ikadoc/api/profile/apiKey", bootKey);

      assert.equal(response.status, 200);
      assert.deepEqual(response.data, { userId: 42, explicitAuth: true });
    });

    it(`rejects an invalid boot key for ${method} provisioning`, async function() {
      const response = await provisioningRequest(method, "/api/profile/apiKey", "invalid-test-key");

      assert.equal(response.status, 401);
      assert.match(response.data.error, /invalid Boot key/);
    });
  }

  it("rejects provisioning without a boot key or editor session", async function() {
    const response = await provisioningRequest("GET", "/api/profile/apiKey");

    assert.equal(response.status, 403);
  });

  for (const [method, path] of [
    ["GET", "/api/orgs"],
    ["GET", "/api/docs/protected-document"],
    ["GET", "/api/profile/apiKey/extra"],
    ["DELETE", "/api/profile/apiKey"],
    ["PATCH", "/api/profile/apiKey"],
    ["HEAD", "/api/profile/apiKey"],
  ] as const) {
    it(`does not admit ${method} ${path} through boot-key provisioning`, async function() {
      const response = await provisioningRequest(method, path, bootKey);

      assert.equal(response.status, 403);
    });
  }
});

/** Exercise the session gate followed by real native identity resolution, as in FlexServer. */
async function provisioningRequest(method: Method, path: string, bootKey?: string) {
  const admin = new User();
  admin.id = 42;
  const dbManager = {} as HomeDBAuth;
  const gristServer = {
    ...createDummyGristServer(),
    getInstallAdmin: () => ({ getAdminUser: async () => admin } as InstallAdmin),
  };
  const router = express.Router();
  router.use("/api", createIkaDocRuntimeAuthMiddleware(
    dbManager, new IkaDocRuntimeSessionRegistry(), undefined, undefined, true,
  ));
  router.use("/api", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req, dbManager, {
        gristServer,
        permitStore: {} as IPermitStore,
      });
      res.json({ userId: identity.user.id, explicitAuth: identity.explicitAuth });
    } catch (error) {
      next(error);
    }
  });

  const app = express();
  app.use("/o/:org", router);
  app.use(router);
  app.use((error: Error & { status?: number }, _req: express.Request,
    res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 500).json({ error: error.message });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as AddressInfo;

  try {
    return await axios.request({
      method,
      url: `http://127.0.0.1:${address.port}${path}`,
      headers: bootKey === undefined ? {} : { "x-boot-key": bootKey },
      validateStatus: () => true,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}
