import { ApiError } from "app/common/ApiError";
import {
  IkaDocEditorAdmissionClient,
  IkaDocEditorAdmissionDenialCode,
} from "app/ikadoc/IkaDocEditorAdmission";
import { toIkaDocBrowserRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { expressWrap } from "app/server/lib/expressWrap";
import { DocTemplate } from "app/server/lib/GristServer";
import {
  IKADOC_RUNTIME_PARTICIPANT_COOKIE,
  IKADOC_RUNTIME_SESSION_COOKIE,
  ikaDocRuntimeParticipantCookie,
} from "app/server/lib/IkaDocRuntimeCookies";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { getEndUserProtocol } from "app/server/lib/requestUtils";
import { ISendAppPageOptions } from "app/server/lib/sendAppPage";

import express from "express";

/** Names the document worker for the browser config; the browser only uses the URL. */
const IKADOC_RUNTIME_DOC_WORKER_ID = "ikadoc-runtime";
const IKADOC_RUNTIME_PLUGIN_URL = process.env.APP_UNTRUSTED_URL || "http://plugins.invalid";
const IKADOC_MATERIAL_THEME = "material";
const IKADOC_OWARELIN_THEME = "owarelin";
const IKADOC_PAPER_THEME = "paper";
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
      throw new ApiError("Spreadsheet editor runtime is not configured.", 503);
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
      // GW-SHL-02: the IkaDoc refusal page, never raw text; the code picks the explanation shown.
      await sendAppPage(req, res, {
        path: "error.html",
        status: getIkaDocAdmissionDeniedStatus(result.code),
        config: {
          errPage: "access-denied",
          errMessage: result.safeMessage,
          errDetails: { ikadocRefusal: result.code },
        },
      });
      return;
    }

    const body = await getDocTemplate();
    const runtimeConfig = result.admission.runtimeConfig;
    const cookieOptions = {
      httpOnly: true,
      path: "/",
      sameSite: "lax" as const,
      secure: getEndUserProtocol(req) === "https",
    };
    // This browser's own entry: several people may be in the session, each validated as themselves,
    // and one person may have several tabs open; re-entering replaces only this browser's entry.
    const browserHandle = ikaDocRuntimeParticipantCookie(req);
    const participant = runtimeSessionRegistry?.register(runtimeConfig, Date.now(), browserHandle);
    res.cookie(IKADOC_RUNTIME_SESSION_COOKIE, runtimeConfig.sessionId, cookieOptions);
    if (participant) {
      res.cookie(IKADOC_RUNTIME_PARTICIPANT_COOKIE, participant.participantHandle, cookieOptions);
    }
    await sendAppPage(req, res, {
      path: "",
      content: body.page,
      tag: body.tag,
      status: 200,
      googleTagManager: false,
      config: {
        assignmentId: runtimeConfig.documentId,
        assistant: undefined,
        enableWidgetRepository: false,
        experimentalPlugins: false,
        // The browser reaches the document through IkaDoc's worker URL, as admitted.
        getWorkerFull: {
          [runtimeConfig.documentId]: {
            selfPrefix: null,
            docWorkerUrl: runtimeConfig.workerUrl,
            docWorkerId: IKADOC_RUNTIME_DOC_WORKER_ID,
          },
        },
        ikadoc: toIkaDocBrowserRuntimeConfig(runtimeConfig),
        pluginUrl: IKADOC_RUNTIME_PLUGIN_URL,
        plugins: [],
      },
    });
  }));
}

function ikaDocTheme(value: unknown): string {
  if (value === IKADOC_MATERIAL_THEME || value === IKADOC_PAPER_THEME) {
    return value;
  }
  return IKADOC_OWARELIN_THEME;
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
