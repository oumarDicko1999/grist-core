import { SandboxInfo } from "app/common/SandboxInfo";
import { getAuthorizedUserId } from "app/server/lib/Authorizer";
import { expressWrap } from "app/server/lib/expressWrap";

import express from "express";

export interface IkaDocRuntimeHealthEndpointOptions {
  app: express.Application;
  getSandboxInfo: () => Promise<SandboxInfo>;
}

export function attachIkaDocRuntimeHealthEndpoint(
  options: IkaDocRuntimeHealthEndpointOptions,
): void {
  options.app.get(
    "/api/ikadoc/runtime/formula-sandbox-proof",
    expressWrap(async (req, res) => {
      getAuthorizedUserId(req);
      const sandboxInfo = await options.getSandboxInfo();
      res.json({
        flavor: sandboxInfo.flavor,
        effective: sandboxInfo.functional && sandboxInfo.effective,
      });
    }),
  );
}
