import { ApiError } from "app/common/ApiError";
import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocRuntimeSession,
  IkaDocRuntimeSessionResolution,
  IkaDocRuntimeSessionRegistry,
} from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import { NextFunction, Request, RequestHandler, Response } from "express";
import fetch from "node-fetch";

type IkaDocCapabilityName = keyof IkaDocCapabilities;

export const IKADOC_RUNTIME_SESSION_COOKIE = "IKADOC_GRIST_GATEWAY_SESSION";

export interface IkaDocRuntimeSessionValidator {
  validate(session: IkaDocRuntimeSession, operation: string): Promise<void>;
}

const CELL_EDIT_ACTIONS = new Set([
  "AddRecord",
  "BulkAddRecord",
  "UpdateRecord",
  "BulkUpdateRecord",
  "RemoveRecord",
  "BulkRemoveRecord",
  "ReplaceTableData",
]);

export function requireIkaDocCapability(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  capability: IkaDocCapabilityName,
  operation: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const resolution = resolveIkaDocRuntimeSessionForRequest(registry, req);
    if (resolution.kind === "expired") {
      return next(
        deniedIkaDocRuntimeOperation(
          "use expired IkaDoc runtime session",
          resolution.session,
        ),
      );
    }
    const session =
      resolution.kind === "active" ? resolution.session : undefined;
    if (!session && hasIkaDocRuntimeSessionCookie(req)) {
      return next(
        deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session"),
      );
    }
    if (!session || session.config.capabilities[capability]) {
      return next();
    }
    reportBlockedCapability(
      session,
      operation,
      blockedReason(operation),
      req.headers.cookie,
    );
    next(deniedIkaDocRuntimeOperation(operation, session));
  };
}

export function denyIkaDocRuntimeOperation(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  operation: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const resolution = resolveIkaDocRuntimeSessionForRequest(registry, req);
    if (resolution.kind === "expired") {
      return next(
        deniedIkaDocRuntimeOperation(
          "use expired IkaDoc runtime session",
          resolution.session,
        ),
      );
    }
    const session =
      resolution.kind === "active" ? resolution.session : undefined;
    if (!session) {
      return hasIkaDocRuntimeSessionCookie(req)
        ? next(
            deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session"),
          )
        : next();
    }
    reportBlockedCapability(
      session,
      operation,
      blockedReason(operation),
      req.headers.cookie,
    );
    next(deniedIkaDocRuntimeOperation(operation, session));
  };
}

export function ikadocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const resolution = resolveIkaDocRuntimeSessionForRequest(registry, req);
  return resolution.kind === "active" ? resolution.session : undefined;
}

function resolveIkaDocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSessionResolution {
  if (!registry) {
    return { kind: "missing" };
  }
  const docId = req.params?.docId;
  if (typeof docId !== "string" || docId.length === 0) {
    const session = ikadocRuntimeSessionFromCookie(registry, req);
    return session ? { kind: "active", session } : { kind: "missing" };
  }
  const documentResolution = registry.resolveByDocumentId(docId);
  if (documentResolution.kind !== "missing") {
    return documentResolution;
  }
  const session = ikadocRuntimeSessionFromCookie(registry, req);
  return session ? { kind: "active", session } : { kind: "missing" };
}

export function requireIkaDocRuntimeCapabilityForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  capability: IkaDocCapabilityName,
  operation: string,
): void {
  const resolution = resolveIkaDocRuntimeSessionForDocument(
    registry,
    documentId,
  );
  if (resolution.kind === "expired") {
    throw deniedIkaDocRuntimeOperation(
      "use expired IkaDoc runtime session",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session || session.config.capabilities[capability]) {
    return;
  }
  reportBlockedCapability(session, operation, blockedReason(operation));
  throw deniedIkaDocRuntimeOperation(operation, session);
}

export async function validateIkaDocRuntimeSessionForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  validator: IkaDocRuntimeSessionValidator | undefined,
  documentId: string,
  operation: string,
): Promise<IkaDocRuntimeSession | undefined> {
  const resolution = resolveIkaDocRuntimeSessionForDocument(
    registry,
    documentId,
  );
  if (resolution.kind === "expired") {
    throw deniedIkaDocRuntimeOperation(
      "use expired IkaDoc runtime session",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session) {
    return undefined;
  }
  if (validator) {
    await validator.validate(session, operation);
  }
  return session;
}

export function denyIkaDocRuntimeOperationForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  operation: string,
): void {
  const resolution = resolveIkaDocRuntimeSessionForDocument(
    registry,
    documentId,
  );
  if (resolution.kind === "expired") {
    throw deniedIkaDocRuntimeOperation(
      "use expired IkaDoc runtime session",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session) {
    return;
  }
  reportBlockedCapability(session, operation, blockedReason(operation));
  throw deniedIkaDocRuntimeOperation(operation, session);
}

export function requireIkaDocUserActionsForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertIkaDocUserActionsAllowedForDocument(
        registry,
        req.params.docId,
        req.body,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function assertIkaDocUserActionsAllowedForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  actions: unknown,
): void {
  const resolution = resolveIkaDocRuntimeSessionForDocument(
    registry,
    documentId,
  );
  if (resolution.kind === "expired") {
    throw deniedIkaDocRuntimeOperation(
      "use expired IkaDoc runtime session",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session) {
    return;
  }
  if (!Array.isArray(actions)) {
    throw deniedIkaDocRuntimeOperation(
      "apply malformed document edits",
      session,
    );
  }
  for (const action of actions) {
    assertIkaDocUserActionAllowed(session, action);
  }
}

function assertIkaDocUserActionAllowed(
  session: IkaDocRuntimeSession,
  action: unknown,
): void {
  if (!Array.isArray(action) || typeof action[0] !== "string") {
    throw deniedIkaDocRuntimeOperation(
      "apply malformed document edits",
      session,
    );
  }
  const actionName = action[0];
  const tableId = typeof action[1] === "string" ? action[1] : undefined;
  const requiredCapabilities = capabilitiesForUserAction(
    actionName,
    tableId,
    action,
  );
  for (const requiredCapability of requiredCapabilities) {
    if (!session.config.capabilities[requiredCapability]) {
      reportBlockedCapability(
        session,
        `apply ${actionName}`,
        blockedReason(`apply ${actionName}`),
      );
      throw deniedIkaDocRuntimeOperation(`apply ${actionName}`, session);
    }
  }
}

function capabilitiesForUserAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): IkaDocCapabilityName[] {
  if (isFormulaAction(actionName, tableId, action)) {
    return ["canUseFormulas", "canEditStructure"];
  }
  if (tableId?.startsWith("_grist_ACL")) {
    return ["canManageAccess"];
  }
  if (tableId === "_grist_Attachments") {
    return ["canUseAttachments"];
  }
  if (tableId === "_grist_Triggers" || tableId === "_grist_Webhooks") {
    return ["canUseExternalData"];
  }
  if (isChartOrLayoutMetadataTable(tableId)) {
    return ["canCreateCharts"];
  }
  if (tableId?.startsWith("_grist_")) {
    return ["canEditStructure"];
  }
  if (CELL_EDIT_ACTIONS.has(actionName)) {
    return ["canEditCells"];
  }
  return ["canEditStructure"];
}

function resolveIkaDocRuntimeSessionForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
): IkaDocRuntimeSessionResolution {
  return registry?.resolveByDocumentId(documentId) ?? { kind: "missing" };
}

function isFormulaAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): boolean {
  if (
    (actionName === "AddColumn" || actionName === "ModifyColumn") &&
    hasFormulaFields(action[3])
  ) {
    return true;
  }
  if (actionName === "AddVisibleColumn" && hasFormulaFields(action[3])) {
    return true;
  }
  if (actionName === "AddTable" && hasFormulaFieldsInColumnSpecs(action[2])) {
    return true;
  }
  if (
    (actionName === "AddRecord" || actionName === "UpdateRecord") &&
    (tableId === "_grist_Tables_column" || tableId === "_grist_Validations") &&
    hasFormulaFields(action[3])
  ) {
    return true;
  }
  if (
    (actionName === "BulkAddRecord" || actionName === "BulkUpdateRecord") &&
    (tableId === "_grist_Tables_column" || tableId === "_grist_Validations") &&
    hasFormulaFields(action[3])
  ) {
    return true;
  }
  return false;
}

function hasFormulaFieldsInColumnSpecs(columnSpecs: unknown): boolean {
  if (!Array.isArray(columnSpecs)) {
    return false;
  }
  return columnSpecs.some(hasFormulaFields);
}

function hasFormulaFields(values: unknown): boolean {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }
  return (
    "formula" in values ||
    "isFormula" in values ||
    "recalcWhen" in values ||
    "recalcDeps" in values
  );
}

function isChartOrLayoutMetadataTable(tableId: string | undefined): boolean {
  return (
    tableId === "_grist_Pages" ||
    tableId === "_grist_Views" ||
    tableId === "_grist_Views_section" ||
    tableId === "_grist_Views_section_field"
  );
}

function ikadocRuntimeSessionFromCookie(
  registry: IkaDocRuntimeSessionRegistry,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const sessionId = ikaDocRuntimeSessionCookie(req);
  return sessionId ? registry.getBySessionId(sessionId) : undefined;
}

export function hasIkaDocRuntimeSessionCookie(req: Request): boolean {
  return ikaDocRuntimeSessionCookie(req) !== undefined;
}

export function ikaDocRuntimeSessionCookie(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return undefined;
  }
  for (const rawCookie of cookieHeader.split(";")) {
    const separator = rawCookie.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = rawCookie.slice(0, separator).trim();
    if (name !== IKADOC_RUNTIME_SESSION_COOKIE) {
      continue;
    }
    const value = rawCookie.slice(separator + 1).trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

export function deniedIkaDocRuntimeOperation(
  operation: string,
  _session?: IkaDocRuntimeSession,
): ApiError {
  return new ApiError(
    `IkaDoc Grist session does not allow ${operation}.`,
    403,
    {
      userError: "This action is disabled for the IkaDoc spreadsheet editor.",
    },
  );
}

function blockedReason(operation: string): string {
  return `Forked Grist runtime denied ${operation}.`;
}

export function isIkaDocRuntimeSessionExpired(
  session: IkaDocRuntimeSession,
): boolean {
  const expiresAtMs = Date.parse(session.config.expiresAt);
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
}

function reportBlockedCapability(
  session: IkaDocRuntimeSession,
  capability: string,
  reason: string,
  cookieHeader?: string,
): void {
  const url = session.config.blockedCapabilityUrl;
  if (!url) {
    return;
  }
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": "grist-runtime-denial",
  };
  if (cookieHeader && shouldForwardCookieToBlockedCapabilityUrl(url, session)) {
    headers.Cookie = cookieHeader;
  }
  fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ capability, reason }),
  })
    .then((response) => {
      if (!response.ok) {
        log.warn("IkaDoc blocked capability audit callback failed", {
          sessionId: session.sessionId,
          status: response.status,
          statusText: response.statusText,
        });
      }
    })
    .catch((error) => {
      log.warn(
        "IkaDoc blocked capability audit callback could not reach backend",
        {
          sessionId: session.sessionId,
          message: error instanceof Error ? error.message : String(error),
        },
      );
    });
}

function shouldForwardCookieToBlockedCapabilityUrl(
  url: string,
  session: IkaDocRuntimeSession,
): boolean {
  if (url.startsWith("/")) {
    return true;
  }
  if (!session.config.statusUrl || session.config.statusUrl.startsWith("/")) {
    return false;
  }
  try {
    return new URL(url).origin === new URL(session.config.statusUrl).origin;
  } catch {
    return false;
  }
}
