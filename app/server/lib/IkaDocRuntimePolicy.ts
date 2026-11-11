import { readIkaDocRuntimeOnly } from "app/server/lib/IkaDocAdmissionConfig";
import {
  hasIkaDocRuntimeSessionCookie,
  ikaDocRuntimeParticipantCookie,
  ikaDocRuntimeSessionCookie,
} from "app/server/lib/IkaDocRuntimeCookies";
import { deniedIkaDocRuntimeOperation, reportBlockedCapability } from "app/server/lib/IkaDocRuntimeDenial";
import {
  attachedIkaDocRuntimeSession,
  IkaDocRuntimeSession,
  IkaDocRuntimeSessionRegistry,
  IkaDocRuntimeSessionResolution,
  isIkaDocRuntimeSessionExpired,
} from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { assertIkaDocServiceActionsAllowed, isIkaDocServiceRequest } from "app/server/lib/IkaDocServiceAccount";
import {
  assertIkaDocUserActionsAllowedForSession,
  IkaDocCapabilityName,
  isIkaDocCapabilityAllowed,
} from "app/server/lib/IkaDocUserActionPolicy";

import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * GR-07: the user actions an operation applies, identified without their content. IkaDoc chains
 * this into the person's evidence before the actions apply, so none apply unrecorded.
 */
export interface IkaDocValidatedAction {
  /** SHA-256, hex, of the actions exactly as received. */
  digest: string;
  /** Action names in order (`UpdateRecord`, `AddColumn`, ...), at most a bounded number. */
  names: string[];
}

export interface IkaDocRuntimeSessionValidator {
  validate(
    session: IkaDocRuntimeSession,
    operation: string,
    action?: IkaDocValidatedAction,
  ): Promise<void>;
}

/**
 * SR-13: Grist's own sharing of a document (its access list, and moving it to another
 * workspace). IkaDoc alone decides who may open a document, so a runtime session never uses them.
 */
export const IKADOC_NATIVE_SHARING_ROUTES = ["/api/docs/:did/access", "/api/docs/:did/move"];

/** Express gate: the request's IkaDoc session must have [capability] for [operation]. */
export function requireIkaDocCapability(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  capability: IkaDocCapabilityName,
  operation: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // The service account is held to its own action list, not to user capabilities.
      if (isIkaDocServiceRequest(req, req.params?.docId)) {
        return next();
      }

      const session = requestSessionOrRefuse(registry, req);
      if (!session || isIkaDocCapabilityAllowed(session, capability)) {
        return next();
      }

      reportBlockedCapability(session, operation, req.headers.cookie, { missingCapability: capability });
      next(deniedIkaDocRuntimeOperation(operation, session));
    } catch (error) {
      next(error);
    }
  };
}

/** Express gate: an IkaDoc session never performs [operation]; other requests pass. */
export function denyIkaDocRuntimeOperation(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  operation: string,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const session = requestSessionOrRefuse(registry, req);
      if (!session) {
        return next();
      }

      reportBlockedCapability(session, operation, req.headers.cookie);
      next(deniedIkaDocRuntimeOperation(operation, session));
    } catch (error) {
      next(error);
    }
  };
}

/** Express gate: the user actions in the body must be allowed for the request's session. */
export function requireIkaDocUserActionsForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (isIkaDocServiceRequest(req, req.params?.docId)) {
        assertIkaDocServiceActionsAllowed(req.body);
        return next();
      }

      const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForRequest(registry, req));
      if (!session) {
        refuseIkaDocEditWithoutAdmission("change a document without an IkaDoc session");
        return next();
      }

      assertIkaDocUserActionsAllowedForSession(session, req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** The request's active IkaDoc session, or undefined when it has none. */
export function ikadocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const resolution = resolveIkaDocRuntimeSessionForRequest(registry, req);

  return resolution.kind === "active" ? resolution.session : undefined;
}

export function requireIkaDocRuntimeCapabilityForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  capability: IkaDocCapabilityName,
  operation: string,
): void {
  const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForDocument(registry, documentId));
  if (!session) {
    return;
  }

  requireIkaDocRuntimeCapabilityForSession(session, capability, operation);
}

export function requireIkaDocRuntimeCapabilityForSession(
  session: IkaDocRuntimeSession,
  capability: IkaDocCapabilityName,
  operation: string,
): void {
  if (isIkaDocCapabilityAllowed(session, capability)) {
    return;
  }

  denyIkaDocRuntimeOperationForSession(session, operation);
}

export function denyIkaDocRuntimeOperationForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  operation: string,
): void {
  const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForDocument(registry, documentId));
  if (!session) {
    return;
  }

  denyIkaDocRuntimeOperationForSession(session, operation);
}

export function denyIkaDocRuntimeOperationForSession(
  session: IkaDocRuntimeSession,
  operation: string,
): never {
  reportBlockedCapability(session, operation);
  throw deniedIkaDocRuntimeOperation(operation, session);
}

/** The document's session after IkaDoc confirmed it for [operation]; undefined outside IkaDoc. */
export async function validateIkaDocRuntimeSessionForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  validator: IkaDocRuntimeSessionValidator | undefined,
  documentId: string,
  operation: string,
): Promise<IkaDocRuntimeSession | undefined> {
  const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForDocument(registry, documentId));
  if (!session) {
    return undefined;
  }

  await validator?.validate(session, operation);

  return session;
}

export async function validateIkaDocRuntimeSession(
  validator: IkaDocRuntimeSessionValidator | undefined,
  session: IkaDocRuntimeSession,
  documentId: string,
  operation: string,
  action?: IkaDocValidatedAction,
): Promise<void> {
  if (!sessionMatchesDocumentId(session, documentId)) {
    throw deniedIkaDocRuntimeOperation("use this runtime session for another document", session);
  }

  if (isIkaDocRuntimeSessionExpired(session)) {
    throw deniedIkaDocRuntimeOperation("use expired runtime session", session);
  }

  await validator?.validate(session, operation, action);
}

/**
 * The batch must be allowed for the document's session. With the request at hand, IkaDoc's
 * service account is recognized and held to its own action list instead (GW-SRC-06).
 */
export function assertIkaDocUserActionsAllowedForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
  actions: unknown,
  req?: Request,
): void {
  if (req && isIkaDocServiceRequest(req, documentId)) {
    assertIkaDocServiceActionsAllowed(actions);
    return;
  }

  const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForDocument(registry, documentId));
  if (!session) {
    refuseIkaDocEditWithoutAdmission("change a document without an IkaDoc session");
    return;
  }

  assertIkaDocUserActionsAllowedForSession(session, actions);
}

/**
 * GR-03, SEC-1: an IkaDoc-only runtime changes a document only for a person IkaDoc admitted or for
 * IkaDoc's service. Without either (no session registered here, after a restart or on another
 * process) the edit is refused instead of reaching Grist unchecked. Plain Grist is unchanged.
 */
export function refuseIkaDocEditWithoutAdmission(operation: string): void {
  if (readIkaDocRuntimeOnly()) {
    throw deniedIkaDocRuntimeOperation(operation);
  }
}

/** The resolved session, or undefined without one; an expired or another document's session is refused. */
function activeSessionOrRefuse(resolution: IkaDocRuntimeSessionResolution): IkaDocRuntimeSession | undefined {
  if (resolution.kind === "expired") {
    throw deniedIkaDocRuntimeOperation("use expired runtime session", resolution.session);
  }

  if (resolution.kind === "forbidden") {
    throw deniedIkaDocRuntimeOperation("use this runtime session for another document", resolution.session);
  }

  return resolution.kind === "active" ? resolution.session : undefined;
}

/**
 * The request's session for a gate. A browser that names a session the registry no longer has
 * (ended, or lost on restart) is refused rather than treated as a plain Grist request.
 */
function requestSessionOrRefuse(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const session = activeSessionOrRefuse(resolveIkaDocRuntimeSessionForRequest(registry, req));
  if (!session && hasIkaDocRuntimeSessionCookie(req)) {
    throw deniedIkaDocRuntimeOperation("use expired runtime session");
  }

  return session;
}

function resolveIkaDocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSessionResolution {
  if (!registry) {
    return { kind: "missing" };
  }

  const docId = req.params?.docId;
  const hasDocId = typeof docId === "string" && docId.length > 0;

  const cookieSession = attachedIkaDocRuntimeSession(req) ?? ikadocRuntimeSessionFromCookie(registry, req);
  if (cookieSession) {
    return hasDocId && !sessionMatchesDocumentId(cookieSession, docId) ?
      { kind: "forbidden", session: cookieSession } :
      { kind: "active", session: cookieSession };
  }

  // A request that names its own session never borrows someone else's entry for the document.
  if (hasIkaDocRuntimeSessionCookie(req) || !hasDocId) {
    return { kind: "missing" };
  }

  return registry.resolveByDocumentId(docId);
}

function resolveIkaDocRuntimeSessionForDocument(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  documentId: string,
): IkaDocRuntimeSessionResolution {
  return registry?.resolveByDocumentId(documentId) ?? { kind: "missing" };
}

function ikadocRuntimeSessionFromCookie(
  registry: IkaDocRuntimeSessionRegistry,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const handle = ikaDocRuntimeParticipantCookie(req);
  const session = handle ? registry.getByHandle(handle) : undefined;
  const sessionId = ikaDocRuntimeSessionCookie(req);

  return session && (!sessionId || sessionId === session.sessionId) ? session : undefined;
}

function sessionMatchesDocumentId(session: IkaDocRuntimeSession, documentId: string): boolean {
  return documentId === session.documentId || documentId === session.documentUrlId;
}
