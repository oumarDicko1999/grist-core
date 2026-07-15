import { IkaDocCapabilities, normalizeIkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocEditorAdmission,
  IkaDocEditorAdmissionClient,
  IkaDocEditorAdmissionDenialCode,
  IkaDocEditorAdmissionRequest,
  IkaDocEditorAdmissionResult,
} from "app/ikadoc/IkaDocEditorAdmission";
import { IkaDocEditorMode, IkaDocSessionSourceType, parseIkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { getHomeUrl } from "app/server/lib/gristSettings";
import { IkaDocAdmissionConfig } from "app/server/lib/IkaDocAdmissionConfig";
import log from "app/server/lib/log";

import fetch, { RequestInit, Response as FetchResponse } from "node-fetch";

const ACCEPTED_IKADOC_ADMISSION_CODES: ReadonlySet<IkaDocEditorAdmissionDenialCode> = new Set([
  "runtime-not-configured",
  "session-not-found",
  "session-expired",
  "session-revoked",
  "tenant-mismatch",
  "actor-mismatch",
  "module-disabled",
  "permission-denied",
  "backend-unavailable",
  "malformed-response",
]);

export function createIkaDocBackendAdmissionClient(
  config: IkaDocAdmissionConfig | undefined,
): IkaDocEditorAdmissionClient | undefined {
  return config ? new IkaDocBackendAdmissionClient(config) : undefined;
}

export class IkaDocBackendAdmissionClient implements IkaDocEditorAdmissionClient {
  public constructor(private readonly _config: IkaDocAdmissionConfig) {}

  public async admitEditor(request: IkaDocEditorAdmissionRequest): Promise<IkaDocEditorAdmissionResult> {
    const response = await this._fetchAdmission(request);
    if (!response.ok) {
      const denial = await this._parseDenialResponse(response);
      if (denial) {
        return denial;
      }

      log.warn("IkaDoc editor admission request failed", {
        status: response.status,
        statusText: response.statusText,
      });
      return deny("backend-unavailable", "IkaDoc editor admission is unavailable.");
    }

    return await this._parseAdmissionResponse(response);
  }

  private async _fetchAdmission(request: IkaDocEditorAdmissionRequest): Promise<FetchResponse> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    const origin = request.origin ?? browserOrigin();
    headers.Origin = origin;
    const publicHost = originHost(origin);
    if (publicHost) {
      headers.Host = publicHost;
      headers["X-Forwarded-Host"] = publicHost;
      headers["X-Forwarded-Proto"] = originProtocol(origin);
    }
    headers["X-CSRF-Token"] = "grist-editor-admission";
    if (request.cookieHeader) {
      headers.Cookie = request.cookieHeader;
    }
    if (this._config.bearerToken) {
      headers.Authorization = `Bearer ${this._config.bearerToken}`;
    }

    const body = JSON.stringify({
      sessionId: request.sessionId,
      proof: request.proof,
      origin: request.origin,
      locale: request.locale,
      theme: request.theme,
      appearance: request.appearance,
    });
    const options: RequestInit = {
      method: "POST",
      headers,
      body,
      timeout: this._config.timeoutMs,
    };

    try {
      return await fetch(this._config.admissionUrl, options);
    } catch (error) {
      log.warn("IkaDoc editor admission request could not reach backend", {
        message: error instanceof Error ? error.message : String(error),
      });
      return new FetchResponse(JSON.stringify({
        kind: "denied",
        code: "backend-unavailable",
        safeMessage: "IkaDoc editor admission is unavailable.",
      }), { status: 503 });
    }
  }

  private async _parseAdmissionResponse(response: FetchResponse): Promise<IkaDocEditorAdmissionResult> {
    const payload = await readJson(response);
    const result = parseAdmissionResult(payload);
    if (result.kind === "denied" && result.code === "malformed-response") {
      log.warn("IkaDoc editor admission returned malformed response", { status: response.status });
    }
    return result;
  }

  private async _parseDenialResponse(response: FetchResponse): Promise<IkaDocEditorAdmissionResult | undefined> {
    const payload = await readJson(response);
    const result = parseAdmissionResult(payload);
    if (result.kind === "denied" && result.code !== "malformed-response") {
      return result;
    }

    return fallbackDenialForHttpStatus(response.status);
  }
}

async function readJson(response: FetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function parseAdmissionResult(payload: unknown): IkaDocEditorAdmissionResult {
  if (!isObject(payload) || typeof payload.kind !== "string") {
    return malformedResponse();
  }

  if (payload.kind === "denied") {
    return parseAdmissionDenial(payload);
  }

  if (payload.kind !== "accepted" || !isObject(payload.admission)) {
    return malformedResponse();
  }

  const admission = parseAdmission(payload.admission);
  return admission ? { kind: "accepted", admission } : malformedResponse();
}

function parseAdmissionDenial(payload: Record<string, unknown>): IkaDocEditorAdmissionResult {
  const code = payload.code;
  const safeMessage = payload.safeMessage;
  if (
    typeof code !== "string" ||
    !ACCEPTED_IKADOC_ADMISSION_CODES.has(code as IkaDocEditorAdmissionDenialCode) ||
    typeof safeMessage !== "string" ||
    safeMessage.length === 0
  ) {
    return malformedResponse();
  }

  return {
    kind: "denied",
    code: code as IkaDocEditorAdmissionDenialCode,
    safeMessage,
  };
}

function parseAdmission(payload: Record<string, unknown>): IkaDocEditorAdmission | undefined {
  const runtimeConfig = parseIkaDocRuntimeConfig(payload.runtimeConfig);
  if (runtimeConfig.kind !== "enabled") {
    return undefined;
  }

  if (!isRequiredAdmissionPayload(payload)) {
    return undefined;
  }

  if (!isObject(payload.capabilities)) {
    return undefined;
  }

  return {
    sessionId: payload.sessionId,
    actorId: payload.actorId,
    tenantId: payload.tenantId,
    deploymentId: payload.deploymentId,
    controlAuthority: payload.controlAuthority,
    sourceType: payload.sourceType,
    mode: payload.mode,
    expiresAt: payload.expiresAt,
    capabilities: normalizeIkaDocCapabilities(payload.capabilities as Partial<IkaDocCapabilities>),
    runtimeConfig: runtimeConfig.config,
  };
}

function isRequiredAdmissionPayload(payload: Record<string, unknown>): payload is {
  sessionId: string;
  actorId: string;
  tenantId: string;
  deploymentId: string;
  controlAuthority: string;
  sourceType: IkaDocSessionSourceType;
  mode: IkaDocEditorMode;
  expiresAt: string;
  capabilities: unknown;
  runtimeConfig: unknown;
} {
  return typeof payload.sessionId === "string" &&
    typeof payload.actorId === "string" &&
    typeof payload.tenantId === "string" &&
    typeof payload.deploymentId === "string" &&
    typeof payload.controlAuthority === "string" &&
    typeof payload.sourceType === "string" &&
    runtimeConfigSourceTypes.has(payload.sourceType as IkaDocSessionSourceType) &&
    typeof payload.mode === "string" &&
    runtimeConfigEditorModes.has(payload.mode as IkaDocEditorMode) &&
    typeof payload.expiresAt === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function browserOrigin(): string {
  const homeUrl = getHomeUrl() || "http://localhost:8484";
  return new URL(homeUrl).origin;
}

function originHost(origin: string): string | undefined {
  try {
    return new URL(origin).host;
  } catch {
    return undefined;
  }
}

function originProtocol(origin: string): string {
  try {
    return new URL(origin).protocol.replace(":", "");
  } catch {
    return "https";
  }
}

function fallbackDenialForHttpStatus(status: number): IkaDocEditorAdmissionResult | undefined {
  if (status === 401 || status === 403) {
    return deny("permission-denied", "IkaDoc editor admission was denied.");
  }

  if (status === 404) {
    return deny("session-not-found", "IkaDoc editor session was not found.");
  }

  return undefined;
}

function malformedResponse(): IkaDocEditorAdmissionResult {
  return deny("malformed-response", "IkaDoc editor admission returned an invalid response.");
}

function deny(
  code: IkaDocEditorAdmissionDenialCode,
  safeMessage: string,
): IkaDocEditorAdmissionResult {
  return { kind: "denied", code, safeMessage };
}

const runtimeConfigSourceTypes: ReadonlySet<IkaDocSessionSourceType> = new Set([
  "document-file",
  "search-workspace",
  "report-workspace",
  "migration-workspace",
]);

const runtimeConfigEditorModes: ReadonlySet<IkaDocEditorMode> = new Set([
  "viewer",
  "editor",
]);
