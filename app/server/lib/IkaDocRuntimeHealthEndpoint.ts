import { isAffirmative } from "app/common/gutil";
import { SandboxInfo } from "app/common/SandboxInfo";
import { getAuthorizedUserId } from "app/server/lib/Authorizer";
import { expressWrap } from "app/server/lib/expressWrap";
import {
  getAllowedWebhookDomains,
  isAllowedWebhookWildcard,
  isRequestFunctionEnabled,
} from "app/server/lib/outgoingRequests";

import express from "express";

export interface IkaDocRuntimeHealthEndpointOptions {
  app: express.Application;
  getSandboxInfo: () => Promise<SandboxInfo>;
}

/**
 * GW-SEC-04: the security-relevant settings this Grist process actually runs with, read through
 * the same helpers Grist uses to apply them, so IkaDoc verifies the real posture instead of
 * trusting what its own deployment declared.
 */
export interface IkaDocRuntimePosture {
  sandbox: { flavor: string; effective: boolean };
  requestFunctionEnabled: boolean;
  webhookDomains: { wildcard: boolean; allowed: string[] };
  experimentalPluginsEnabled: boolean;
  trustedPlugins: boolean;
  widgetRepositoryConfigured: boolean;
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

  options.app.get(
    "/api/ikadoc/runtime/posture",
    expressWrap(async (req, res) => {
      getAuthorizedUserId(req);

      const sandboxInfo = await options.getSandboxInfo();

      // Same rule as PluginManager: unset or "0" means disabled.
      const experimentalPlugins = process.env.GRIST_EXPERIMENTAL_PLUGINS;
      const experimentalPluginsEnabled = Boolean(experimentalPlugins) && experimentalPlugins !== "0";

      const posture: IkaDocRuntimePosture = {
        sandbox: {
          flavor: sandboxInfo.flavor,
          effective: sandboxInfo.functional && sandboxInfo.effective,
        },

        requestFunctionEnabled: isRequestFunctionEnabled(),

        webhookDomains: {
          wildcard: isAllowedWebhookWildcard(),
          allowed: getAllowedWebhookDomains(),
        },

        experimentalPluginsEnabled,
        trustedPlugins: isAffirmative(process.env.GRIST_TRUST_PLUGINS),
        widgetRepositoryConfigured: Boolean(process.env.GRIST_WIDGET_LIST_URL),
      };

      res.json(posture);
    }),
  );
}
