import { ApiError } from "app/common/ApiError";
import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocRuntimeSession,
  IkaDocRuntimeSessionRegistry,
  IkaDocRuntimeSessionResolution,
} from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import { NextFunction, Request, RequestHandler, Response } from "express";
import fetch from "node-fetch";

type IkaDocCapabilityName = keyof IkaDocCapabilities;

export const IKADOC_RUNTIME_SESSION_COOKIE = "IKADOC_GRIST_GATEWAY_SESSION";

export interface IkaDocRuntimeSessionValidator {
  validate(session: IkaDocRuntimeSession, operation: string): Promise<void>;
}

const BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS = 5000;

const EDITOR_ONLY_CAPABILITIES = new Set<IkaDocCapabilityName>([
  "canEditCells",
  "canEditStructure",
  "canUseFormulas",
  "canCreateCharts",
  "canRefreshSource",
  "canSaveToIkaDoc",
  "canDiscard",
  "canUseComments",
  "canUseAttachments",
  "canUseExternalData",
  "canImportLocalFiles",
  "canUseCustomWidgets",
  "canInviteCollaborators",
  "canShare",
  "canFork",
  "canPublish",
  "canManageAccess",
  "canUsePlugins",
]);

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
          "use expired runtime session",
          resolution.session,
        ),
      );
    }
    if (resolution.kind === "forbidden") {
      return next(
        deniedIkaDocRuntimeOperation(
          "use this runtime session for another document",
          resolution.session,
        ),
      );
    }
    const session =
      resolution.kind === "active" ? resolution.session : undefined;
    if (!session && hasIkaDocRuntimeSessionCookie(req)) {
      return next(
        deniedIkaDocRuntimeOperation("use expired runtime session"),
      );
    }
    if (!session || isIkaDocCapabilityAllowed(session, capability)) {
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
          "use expired runtime session",
          resolution.session,
        ),
      );
    }
    if (resolution.kind === "forbidden") {
      return next(
        deniedIkaDocRuntimeOperation(
          "use this runtime session for another document",
          resolution.session,
        ),
      );
    }
    const session =
      resolution.kind === "active" ? resolution.session : undefined;
    if (!session) {
      return hasIkaDocRuntimeSessionCookie(req) ?
        next(
          deniedIkaDocRuntimeOperation("use expired runtime session"),
        ) :
        next();
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
  const cookieSession = ikadocRuntimeSessionFromCookie(registry, req);
  if (cookieSession) {
    if (
      typeof docId === "string" &&
      docId.length > 0 &&
      !sessionMatchesDocumentId(cookieSession, docId)
    ) {
      return { kind: "forbidden", session: cookieSession };
    }
    return { kind: "active", session: cookieSession };
  }
  if (typeof docId !== "string" || docId.length === 0) {
    return { kind: "missing" };
  }
  const documentResolution = registry.resolveByDocumentId(docId);
  if (documentResolution.kind !== "missing") {
    return documentResolution;
  }
  return { kind: "missing" };
}

function sessionMatchesDocumentId(
  session: IkaDocRuntimeSession,
  documentId: string,
): boolean {
  return (
    documentId === session.documentId ||
    documentId === session.documentUrlId
  );
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
      "use expired runtime session",
      resolution.session,
    );
  }
  if (resolution.kind === "forbidden") {
    throw deniedIkaDocRuntimeOperation(
      "use this runtime session for another document",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session || isIkaDocCapabilityAllowed(session, capability)) {
    return;
  }
  reportBlockedCapability(session, operation, blockedReason(operation));
  throw deniedIkaDocRuntimeOperation(operation, session);
}

export function requireIkaDocRuntimeCapabilityForSession(
  session: IkaDocRuntimeSession,
  capability: IkaDocCapabilityName,
  operation: string,
): void {
  if (isIkaDocCapabilityAllowed(session, capability)) {
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
      "use expired runtime session",
      resolution.session,
    );
  }
  if (resolution.kind === "forbidden") {
    throw deniedIkaDocRuntimeOperation(
      "use this runtime session for another document",
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

export async function validateIkaDocRuntimeSession(
  validator: IkaDocRuntimeSessionValidator | undefined,
  session: IkaDocRuntimeSession,
  documentId: string,
  operation: string,
): Promise<void> {
  if (!sessionMatchesDocumentId(session, documentId)) {
    throw deniedIkaDocRuntimeOperation(
      "use this runtime session for another document",
      session,
    );
  }
  if (isIkaDocRuntimeSessionExpired(session)) {
    throw deniedIkaDocRuntimeOperation(
      "use expired runtime session",
      session,
    );
  }
  if (validator) {
    await validator.validate(session, operation);
  }
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
      "use expired runtime session",
      resolution.session,
    );
  }
  if (resolution.kind === "forbidden") {
    throw deniedIkaDocRuntimeOperation(
      "use this runtime session for another document",
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

export function denyIkaDocRuntimeOperationForSession(
  session: IkaDocRuntimeSession,
  operation: string,
): void {
  reportBlockedCapability(session, operation, blockedReason(operation));
  throw deniedIkaDocRuntimeOperation(operation, session);
}

export function requireIkaDocUserActionsForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const resolution = resolveIkaDocRuntimeSessionForRequest(registry, req);
      if (resolution.kind === "expired") {
        throw deniedIkaDocRuntimeOperation(
          "use expired runtime session",
          resolution.session,
        );
      }
      if (resolution.kind === "forbidden") {
        throw deniedIkaDocRuntimeOperation(
          "use this runtime session for another document",
          resolution.session,
        );
      }
      if (resolution.kind === "active") {
        assertIkaDocUserActionsAllowedForSession(
          resolution.session,
          req.body,
        );
      }
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
      "use expired runtime session",
      resolution.session,
    );
  }
  if (resolution.kind === "forbidden") {
    throw deniedIkaDocRuntimeOperation(
      "use this runtime session for another document",
      resolution.session,
    );
  }
  const session = resolution.kind === "active" ? resolution.session : undefined;
  if (!session) {
    return;
  }
  assertIkaDocUserActionsAllowedForSession(session, actions);
}

export function assertIkaDocUserActionsAllowedForSession(
  session: IkaDocRuntimeSession,
  actions: unknown,
): void {
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
    if (!isIkaDocCapabilityAllowed(session, requiredCapability)) {
      reportBlockedCapability(
        session,
        `apply ${actionName}`,
        blockedReason(`apply ${actionName}`),
      );
      throw deniedIkaDocRuntimeOperation(`apply ${actionName}`, session);
    }
  }
}

function isIkaDocCapabilityAllowed(
  session: IkaDocRuntimeSession,
  capability: IkaDocCapabilityName,
): boolean {
  if (session.config.mode !== "editor" && EDITOR_ONLY_CAPABILITIES.has(capability)) {
    return false;
  }
  return session.config.capabilities[capability];
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
  if (tableId === "_grist_Cells") {
    return ["canUseComments"];
  }
  if (tableId === "_grist_Triggers" || tableId === "_grist_Webhooks") {
    return ["canUseExternalData"];
  }
  if (isCustomWidgetAction(tableId, action)) {
    return ["canUseCustomWidgets", "canEditStructure"];
  }
  if (isChartUserAction(actionName, tableId, action)) {
    return ["canCreateCharts", "canEditStructure"];
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

function isCustomWidgetAction(
  tableId: string | undefined,
  action: unknown[],
): boolean {
  if (tableId !== "_grist_Views_section") {
    return false;
  }
  const values = action[3];
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }
  return hasCustomWidgetParentKey(values) || hasCustomWidgetOptions(values);
}

function hasCustomWidgetParentKey(values: object): boolean {
  if (!("parentKey" in values)) {
    return false;
  }
  const parentKey = values.parentKey;
  if (typeof parentKey === "string") {
    return isCustomWidgetType(parentKey);
  }
  return (
    Array.isArray(parentKey) &&
    parentKey.some(
      value => typeof value === "string" && isCustomWidgetType(value),
    )
  );
}

function isCustomWidgetType(value: string): boolean {
  return value === "custom" || value.startsWith("custom.");
}

function hasCustomWidgetOptions(values: object): boolean {
  if (!("options" in values)) {
    return false;
  }
  const options = values.options;
  if (typeof options === "string") {
    return optionsContainCustomWidget(options);
  }
  return (
    Array.isArray(options) &&
    options.some(
      option =>
        typeof option === "string" && optionsContainCustomWidget(option),
    )
  );
}

function optionsContainCustomWidget(options: string): boolean {
  if (!options.includes("customView")) {
    return false;
  }
  try {
    const parsed = JSON.parse(options);
    return Boolean(
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "customView" in parsed,
    );
  } catch {
    return true;
  }
}

function isChartUserAction(
  actionName: string,
  tableId: string | undefined,
  action: unknown[],
): boolean {
  if (actionName === "CreateViewSection") {
    return action[3] === "chart";
  }
  if (tableId !== "_grist_Views_section") {
    return false;
  }
  const values = action[3];
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return false;
  }
  return hasChartParentKey(values) || "chartType" in values;
}

function hasChartParentKey(values: object): boolean {
  if (!("parentKey" in values)) {
    return false;
  }
  const parentKey = values.parentKey;
  if (typeof parentKey === "string") {
    return parentKey === "chart";
  }
  return Array.isArray(parentKey) && parentKey.includes("chart");
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
    `This Grist session does not allow ${operation}.`,
    403,
    {
      userError: "This action is disabled for this spreadsheet editor.",
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
    "Accept": "application/json",
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
    timeout: BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS,
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
