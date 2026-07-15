import { ApiError } from "app/common/ApiError";
import {
  IkaDocEditorAdmissionClient,
  IkaDocEditorAdmissionDenialCode,
} from "app/ikadoc/IkaDocEditorAdmission";
import { expressWrap } from "app/server/lib/expressWrap";
import { DocTemplate } from "app/server/lib/GristServer";
import { IKADOC_RUNTIME_SESSION_COOKIE } from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { getEndUserProtocol } from "app/server/lib/requestUtils";
import { ISendAppPageOptions } from "app/server/lib/sendAppPage";

import express from "express";

const IKADOC_RUNTIME_PLUGIN_URL = process.env.APP_UNTRUSTED_URL || "http://plugins.invalid";
const IKADOC_MATERIAL_THEME = "material";
const IKADOC_OWARELIN_THEME = "owarelin";
const IKADOC_DARK_APPEARANCE = "dark";
const IKADOC_LIGHT_APPEARANCE = "light";
const IKADOC_LOCALE_PATTERN = /^[a-z]{2}(?:-[a-z]{2})?$/i;

export interface IkaDocEditorEndpointOptions {
  app: express.Application;
  middleware: express.RequestHandler[];
  getDocTemplate: () => Promise<DocTemplate>;
  sendAppPage: (req: express.Request, resp: express.Response, options: ISendAppPageOptions) => Promise<void>;
  admissionClient?: IkaDocEditorAdmissionClient;
  runtimeSessionRegistry?: IkaDocRuntimeSessionRegistry;
}

export function attachIkaDocEditorEndpoint(options: IkaDocEditorEndpointOptions): void {
  const { app, middleware, getDocTemplate, sendAppPage, admissionClient, runtimeSessionRegistry } = options;

  app.get("/grist/editor/:sessionId", ...middleware, expressWrap(async (req, res) => {
    if (!admissionClient) {
      throw new ApiError("IkaDoc editor runtime is not configured.", 503);
    }

    const result = await admissionClient.admitEditor({
      sessionId: req.params.sessionId,
      proof: { kind: "backend-session" },
      cookieHeader: req.headers.cookie,
      origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
      locale: ikaDocLocale(req.query.locale),
      theme: ikaDocTheme(req.query.theme),
      appearance: ikaDocAppearance(req.query.appearance),
    });

    if (result.kind === "denied") {
      res.status(getIkaDocAdmissionDeniedStatus(result.code)).type("text/plain").send(result.safeMessage);
      return;
    }

    const body = await getDocTemplate();
    const runtimeConfig = result.admission.runtimeConfig;
    runtimeSessionRegistry?.register(
      runtimeConfig,
      Date.now(),
    );
    res.cookie(IKADOC_RUNTIME_SESSION_COOKIE, runtimeConfig.sessionId, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: getEndUserProtocol(req) === "https",
    });
    await sendAppPage(req, res, {
      path: "",
      content: body.page,
      tag: body.tag,
      status: 200,
      googleTagManager: false,
      config: {
        assignmentId: runtimeConfig.documentId,
        enableWidgetRepository: false,
        experimentalPlugins: false,
        getWorker: { [runtimeConfig.documentId]: runtimeConfig.workerUrl },
        ikadoc: runtimeConfig,
        permittedCustomWidgets: [],
        pluginUrl: IKADOC_RUNTIME_PLUGIN_URL,
        plugins: [],
      },
    });
  }));
}

function ikaDocTheme(value: unknown): string {
  return value === IKADOC_MATERIAL_THEME ? IKADOC_MATERIAL_THEME : IKADOC_OWARELIN_THEME;
}

function ikaDocLocale(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const locale = value.trim();
  return IKADOC_LOCALE_PATTERN.test(locale) ? locale : undefined;
}

function ikaDocAppearance(value: unknown): string {
  return value === IKADOC_DARK_APPEARANCE ? IKADOC_DARK_APPEARANCE : IKADOC_LIGHT_APPEARANCE;
}

function getIkaDocAdmissionDeniedStatus(code: IkaDocEditorAdmissionDenialCode): number {
  switch (code) {
    case "runtime-not-configured":
    case "backend-unavailable":
      return 503;
    case "session-not-found":
      return 404;
    case "session-expired":
    case "session-revoked":
    case "tenant-mismatch":
    case "actor-mismatch":
    case "module-disabled":
    case "permission-denied":
      return 403;
    case "malformed-response":
      return 502;
  }
}
