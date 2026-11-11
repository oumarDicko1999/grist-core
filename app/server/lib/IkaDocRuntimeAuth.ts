import { ApiError } from "app/common/ApiError";
import { FullUser } from "app/common/LoginSessionAPI";
import * as roles from "app/common/roles";
import { Organization } from "app/common/UserAPI";
import { Document } from "app/gen-server/entity/Document";
import { Scope } from "app/gen-server/lib/homedb/HomeDBManager";
import { IkaDocEditorAdmissionClient } from "app/ikadoc/IkaDocEditorAdmission";
import { AuthCredential } from "app/server/lib/AuthCredential";
import { RequestWithLogin } from "app/server/lib/Authorizer";
import { AuthSession } from "app/server/lib/AuthSession";
import { readIkaDocRuntimeOnly } from "app/server/lib/IkaDocAdmissionConfig";
import {
  IkaDocForwardAuthAssertion,
  ikaDocForwardAuthAssertionForRequest,
} from "app/server/lib/IkaDocForwardAuthAssertion";
import {
  hasIkaDocRuntimeSessionCookie,
  IKADOC_RUNTIME_PARTICIPANT_COOKIE,
  ikaDocRuntimeParticipantCookie,
  ikaDocRuntimeSessionCookie,
} from "app/server/lib/IkaDocRuntimeCookies";
import { deniedIkaDocRuntimeOperation } from "app/server/lib/IkaDocRuntimeDenial";
import { ikadocRuntimeSessionForRequest } from "app/server/lib/IkaDocRuntimePolicy";
import {
  attachIkaDocRuntimeSession,
  IkaDocRuntimeSession,
  IkaDocRuntimeSessionRegistry,
  isIkaDocRuntimeSessionExpired,
} from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import type {
  DocAuthResult,
  HomeDBAuth,
  HomeDBDocAuth,
} from "app/gen-server/lib/homedb/Interfaces";
import type { Request, RequestHandler, Response } from "express";
import type { IncomingMessage } from "http";

/** The editor entry admits its own session, so it is reachable before any IkaDoc cookie exists. */
const IKADOC_EDITOR_ENTRY_PATH_PREFIX = "/grist/editor/";

export function createIkaDocRuntimeAuthMiddleware(
  dbManager: HomeDBAuth,
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
  runtimeOnly: boolean = readIkaDocRuntimeOnly(),
): RequestHandler {
  return async (req, res, next) => {
    try {
      const request = await liveIkaDocSessionForRequest(registry, req, admissionClient, forwardAuthSecret, res);

      if (request.kind === "plain-grist") {
        if (runtimeOnly && !reachableWithoutIkaDocSession(req)) {
          log.warn("IkaDoc runtime refused a request without an IkaDoc session", {
            method: req.method,
            path: req.path,
          });

          return next(deniedIkaDocRuntimeOperation("use Grist outside an IkaDoc session"));
        }

        return next();
      }

      const { session } = request;

      const anonymousUser = dbManager.getAnonymousUser();
      const credential = new IkaDocRuntimeCredential(
        session,
        dbManager.getAnonymousUserId(),
        dbManager.getPreviewerUserId(),
      );

      const mreq = req as RequestWithLogin;
      mreq.user = anonymousUser;
      mreq.userId = anonymousUser.id;
      mreq.userIsAuthorized = false;
      mreq.altSessionId = runtimeParticipantSessionId(session);
      mreq.fullUser = runtimeTransportUser(dbManager.makeFullUser(anonymousUser), session);
      mreq.users = [credential.identifiedUser];
      mreq.authSession = AuthSession.fromReq(mreq, credential);
      attachIkaDocRuntimeSession(req, session);

      log.info("IkaDoc runtime auth attached request session", {
        method: req.method,
        path: req.path,
        sessionId: session.sessionId,
        documentId: session.documentId,
        documentUrlId: session.documentUrlId,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createIkaDocRuntimeProfileHandler(
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const request = await liveIkaDocSessionForRequest(registry, req, admissionClient, forwardAuthSecret, res);
      if (request.kind === "plain-grist") {
        return next();
      }

      const { session } = request;

      res.status(200).json({
        email: runtimeUserEmail(session),
        name: session.config.user.displayName,
        picture: null,
        ref: runtimeUserRef(session),
        locale: session.config.locale,
        anonymous: false,
      });
    } catch (error) {
      next(error);
    }
  };
}

export function createIkaDocRuntimeSessionAccessHandler(
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const request = await liveIkaDocSessionForRequest(registry, req, admissionClient, forwardAuthSecret, res);
      if (request.kind === "plain-grist") {
        return next();
      }

      const { session } = request;

      const user = runtimeTransportUser(
        {
          id: 0,
          email: runtimeUserEmail(session),
          loginEmail: runtimeUserEmail(session),
          name: session.config.user.displayName,
          ref: runtimeUserRef(session),
          picture: null,
          anonymous: false,
          locale: session.config.locale,
        },
        session,
      );
      const org = runtimeOrganization(session);

      if (req.path.endsWith("/all")) {
        res.status(200).json({ users: [user], orgs: [org] });
        return;
      }

      res.status(200).json({ user, org });
    } catch (error) {
      next(error);
    }
  };
}

export async function createIkaDocRuntimeAuthSession(
  dbManager: HomeDBAuth,
  registry: IkaDocRuntimeSessionRegistry,
  req: IncomingMessage,
  org: string,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): Promise<AuthSession | undefined> {
  const request = await liveIkaDocSessionForRequest(
    registry,
    req as Request,
    admissionClient,
    forwardAuthSecret,
    undefined,
  );
  if (request.kind === "plain-grist") {
    return undefined;
  }

  const credential = new IkaDocRuntimeCredential(
    request.session,
    dbManager.getAnonymousUserId(),
    dbManager.getPreviewerUserId(),
  );

  return AuthSession.fromUser(
    credential.identifiedUser,
    org,
    runtimeParticipantSessionId(request.session),
    credential,
    false,
  );
}

export function ikaDocRuntimeSessionFromAuthSession(
  authSession: AuthSession,
): IkaDocRuntimeSession | undefined {
  const credential = authSession.credential;
  return credential instanceof IkaDocRuntimeCredential ?
    credential.session :
    undefined;
}

/** A request as IkaDoc sees it: plain Grist, or one person's live IkaDoc session. */
type IkaDocRequestSession =
  | { kind: "plain-grist" } |
  { kind: "ikadoc"; session: IkaDocRuntimeSession };

/**
 * A request that says it belongs to IkaDoc (session cookie or signed forward-auth assertion) gets
 * its person's live session; its refusal is thrown when that session is gone or has expired.
 * Requests that say nothing of IkaDoc are plain Grist requests.
 */
async function liveIkaDocSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry,
  req: Request,
  admissionClient: IkaDocEditorAdmissionClient | undefined,
  forwardAuthSecret: string | undefined,
  res: Response | undefined,
): Promise<IkaDocRequestSession> {
  const assertion = ikaDocForwardAuthAssertionForRequest(req, forwardAuthSecret);
  if (!hasIkaDocRuntimeSessionCookie(req) && !assertion) {
    return { kind: "plain-grist" };
  }

  const session = await getIkaDocRuntimeSessionForRequest(registry, req, admissionClient, assertion, res);
  if (!session) {
    log.warn("IkaDoc runtime auth rejected request without registered session", {
      method: req.method,
      path: req.path,
    });

    throw deniedIkaDocRuntimeOperation("use expired runtime session");
  }

  if (isIkaDocRuntimeSessionExpired(session)) {
    log.warn("IkaDoc runtime auth rejected expired session", {
      method: req.method,
      path: req.path,
      sessionId: session.sessionId,
      documentId: session.documentId,
      documentUrlId: session.documentUrlId,
    });

    throw deniedIkaDocRuntimeOperation("use expired runtime session", session);
  }

  return { kind: "ikadoc", session };
}

/**
 * The person this request comes from, in the session it names (GR-03): the entry the signed
 * forward-auth assertion names, or the one this browser's participant cookie names. Without one,
 * IkaDoc is asked to admit the person behind the request's own IkaDoc sign-in, and only that
 * person's entry is used. A request is never given someone else's entry.
 */
async function getIkaDocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry,
  req: Request,
  admissionClient: IkaDocEditorAdmissionClient | undefined,
  assertion: IkaDocForwardAuthAssertion | undefined,
  res: Response | undefined,
): Promise<IkaDocRuntimeSession | undefined> {
  const session = assertion ?
    registry.getByParticipant(assertion.sessionId, assertion.userId) :
    ikadocRuntimeSessionForRequest(registry, req);
  if (session || !admissionClient) {
    return session;
  }

  const sessionId = assertion?.sessionId ?? ikaDocRuntimeSessionCookie(req);
  if (!sessionId) {
    return undefined;
  }

  log.info("IkaDoc runtime auth revalidating missing local session", {
    method: req.method,
    path: req.path,
    sessionId,
  });
  const result = await admissionClient.admitEditor({
    sessionId,
    proof: { kind: "backend-session" },
    cookieHeader: req.headers.cookie,
    origin:
      typeof req.headers.origin === "string" ? req.headers.origin : undefined,
  });
  if (result.kind === "denied") {
    log.warn("IkaDoc runtime auth backend revalidation denied", {
      method: req.method,
      path: req.path,
      sessionId,
      code: result.code,
    });
    return undefined;
  }
  const admittedUserId = result.admission.runtimeConfig.user.userId;
  if (assertion && assertion.userId !== admittedUserId) {
    log.warn("IkaDoc runtime auth admitted another person than the assertion names", {
      method: req.method,
      path: req.path,
      sessionId,
    });
    return undefined;
  }
  const browserHandle = ikaDocRuntimeParticipantCookie(req);
  const registered = registry.register(result.admission.runtimeConfig, Date.now(), browserHandle);
  res?.cookie(IKADOC_RUNTIME_PARTICIPANT_COOKIE, registered.participantHandle, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: req.protocol === "https",
  });
  return registered;
}

/** Grist tells sessions apart by this id; each person in a shared session gets their own. */
function runtimeParticipantSessionId(session: IkaDocRuntimeSession): string {
  return `${session.sessionId}:${session.userId}`;
}

class IkaDocRuntimeCredential implements AuthCredential {
  public readonly identifiedUser: FullUser;

  public constructor(
    public readonly session: IkaDocRuntimeSession,
    anonymousUserId: number,
    private readonly _previewerUserId: number,
  ) {
    this.identifiedUser = {
      id: anonymousUserId,
      email: runtimeUserEmail(session),
      loginEmail: runtimeUserEmail(session),
      name: session.config.user.displayName,
      ref: runtimeUserRef(session),
      picture: null,
      anonymous: false,
      locale: session.config.locale,
      extra: {
        ikadocUserId: session.config.user.userId,
        ikadocSessionId: session.sessionId,
      },
    };
  }

  public scope(_req: Request): Scope {
    return {
      userId: this._previewerUserId,
      filter: entities =>
        entities.filter((entity) => {
          if (entity instanceof Document) {
            return this._isRuntimeDocument(entity);
          }
          return false;
        }),
    };
  }

  public async docAuth(
    mreq: RequestWithLogin,
    dbManager: HomeDBDocAuth,
    urlId: string,
  ): Promise<DocAuthResult> {
    if (
      urlId !== this.session.documentId &&
      urlId !== this.session.documentUrlId
    ) {
      log.warn("IkaDoc runtime doc auth denied", {
        urlId,
        documentId: this.session.documentId,
        documentUrlId: this.session.documentUrlId,
        sessionId: this.session.sessionId,
      });
      throw new ApiError("Spreadsheet document access denied", 403);
    }

    log.info("IkaDoc runtime doc auth granted", {
      urlId,
      documentId: this.session.documentId,
      documentUrlId: this.session.documentUrlId,
      sessionId: this.session.sessionId,
    });

    const docAuth = await dbManager.getDocAuthCached({
      urlId,
      userId: this._previewerUserId,
      org: mreq.org,
    });
    if (docAuth.error) {
      return docAuth;
    }
    if (!docAuth.cachedDoc || !this._isRuntimeDocument(docAuth.cachedDoc)) {
      throw new ApiError("Spreadsheet document access denied", 403);
    }

    const access =
      this.session.config.mode === "editor" ? roles.EDITOR : roles.VIEWER;
    return {
      ...docAuth,
      docId: this.session.documentId,
      access,
      cachedDoc: cloneRuntimeDocumentWithAccess(docAuth.cachedDoc, access),
    };
  }

  public permissionMask() {
    return undefined;
  }

  private _isRuntimeDocument(doc: Document): boolean {
    return (
      doc.id === this.session.documentId ||
      doc.urlId === this.session.documentUrlId ||
      Boolean(
        doc.aliases?.some(
          alias => alias.urlId === this.session.documentUrlId,
        ),
      )
    );
  }
}

function cloneRuntimeDocumentWithAccess(
  doc: Document,
  access: roles.Role,
): Document {
  return Object.assign(Object.create(Object.getPrototypeOf(doc)), doc, {
    access,
  });
}

function runtimeTransportUser(
  fullUser: FullUser,
  session: IkaDocRuntimeSession,
): FullUser {
  return {
    ...fullUser,
    email: runtimeUserEmail(session),
    loginEmail: runtimeUserEmail(session),
    name: session.config.user.displayName,
    ref: runtimeUserRef(session),
    locale: session.config.locale,
    anonymous: false,
  };
}

function runtimeUserEmail(session: IkaDocRuntimeSession): string {
  return (
    session.config.user.email || `${session.config.user.userId}@ikadoc.local`
  );
}

function runtimeUserRef(session: IkaDocRuntimeSession): string {
  return `ikadoc:${session.config.user.userId}`;
}

function runtimeOrganization(session: IkaDocRuntimeSession): Organization {
  const now = new Date(0).toISOString();
  return {
    id: 0,
    name: session.config.collectionCode,
    createdAt: now,
    updatedAt: now,
    domain: null,
    owner: null,
    host: null,
    access: "editors",
  };
}

/**
 * GW-SEC-01: what an IkaDoc-only runtime still serves without an IkaDoc session — the editor
 * entry, which runs admission itself, and server-to-server calls that carry an API key (the
 * IkaDoc backend's service account). Boot-key requests may only retrieve or create that API
 * key. Native Authorizer still validates either credential before any API handler runs.
 */
function reachableWithoutIkaDocSession(req: Request): boolean {
  const path = req.originalUrl.split("?")[0];
  const isEditorEntry = path.startsWith(IKADOC_EDITOR_ENTRY_PATH_PREFIX);
  const carriesApiKey = Boolean(req.headers.authorization);
  const isServiceKeyBootstrap = (req.method === "GET" || req.method === "POST") &&
    req.path.toLowerCase() === "/profile/apikey" &&
    typeof req.headers["x-boot-key"] === "string" && req.headers["x-boot-key"].length > 0;

  return isEditorEntry || carriesApiKey || isServiceKeyBootstrap;
}
