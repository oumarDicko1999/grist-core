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
import {
  IkaDocForwardAuthAssertion,
  ikaDocForwardAuthAssertionForRequest,
} from "app/server/lib/IkaDocForwardAuthAssertion";
import {
  deniedIkaDocRuntimeOperation,
  hasIkaDocRuntimeSessionCookie,
  ikaDocRuntimeSessionCookie,
  ikadocRuntimeSessionForRequest,
  isIkaDocRuntimeSessionExpired,
} from "app/server/lib/IkaDocRuntimePolicy";
import {
  IkaDocRuntimeSession,
  IkaDocRuntimeSessionRegistry,
} from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import type {
  DocAuthResult,
  HomeDBAuth,
  HomeDBDocAuth,
} from "app/gen-server/lib/homedb/Interfaces";
import type { Request, RequestHandler } from "express";
import type { IncomingMessage } from "http";

export function createIkaDocRuntimeAuthMiddleware(
  dbManager: HomeDBAuth,
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): RequestHandler {
  return async (req, _res, next) => {
    let assertion: IkaDocForwardAuthAssertion | undefined;
    try {
      assertion = ikaDocForwardAuthAssertionForRequest(req, forwardAuthSecret);
    } catch (error) {
      return next(error);
    }
    if (!hasIkaDocRuntimeSessionCookie(req) && !assertion) {
      return next();
    }

    const session = await getIkaDocRuntimeSessionForRequest(
      registry,
      req,
      admissionClient,
      assertion,
    );
    if (!session) {
      log.warn(
        "IkaDoc runtime auth rejected request without registered session",
        {
          method: req.method,
          path: req.path,
        },
      );
      return next(
        deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session"),
      );
    }
    if (isIkaDocRuntimeSessionExpired(session)) {
      log.warn("IkaDoc runtime auth rejected expired session", {
        method: req.method,
        path: req.path,
        sessionId: session.sessionId,
        documentId: session.documentId,
        documentUrlId: session.documentUrlId,
      });
      return next(
        deniedIkaDocRuntimeOperation(
          "use expired IkaDoc runtime session",
          session,
        ),
      );
    }

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
    mreq.altSessionId = session.sessionId;
    mreq.fullUser = runtimeTransportUser(
      dbManager.makeFullUser(anonymousUser),
      session,
    );
    mreq.users = [credential.identifiedUser];
    mreq.authSession = AuthSession.fromReq(mreq, credential);
    log.info("IkaDoc runtime auth attached request session", {
      method: req.method,
      path: req.path,
      sessionId: session.sessionId,
      documentId: session.documentId,
      documentUrlId: session.documentUrlId,
    });
    next();
  };
}

export function createIkaDocRuntimeProfileHandler(
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): RequestHandler {
  return async (req, res, next) => {
    let assertion: IkaDocForwardAuthAssertion | undefined;
    try {
      assertion = ikaDocForwardAuthAssertionForRequest(req, forwardAuthSecret);
    } catch (error) {
      return next(error);
    }
    if (!hasIkaDocRuntimeSessionCookie(req) && !assertion) {
      return next();
    }

    const session = await getIkaDocRuntimeSessionForRequest(
      registry,
      req,
      admissionClient,
      assertion,
    );
    if (!session) {
      return next(
        deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session"),
      );
    }
    if (isIkaDocRuntimeSessionExpired(session)) {
      return next(
        deniedIkaDocRuntimeOperation(
          "use expired IkaDoc runtime session",
          session,
        ),
      );
    }

    res.status(200).json({
      email: runtimeUserEmail(session),
      name: session.config.user.displayName,
      picture: null,
      ref: runtimeUserRef(session),
      locale: session.config.locale,
      anonymous: false,
    });
  };
}

export function createIkaDocRuntimeSessionAccessHandler(
  registry: IkaDocRuntimeSessionRegistry,
  admissionClient?: IkaDocEditorAdmissionClient,
  forwardAuthSecret?: string,
): RequestHandler {
  return async (req, res, next) => {
    let assertion: IkaDocForwardAuthAssertion | undefined;
    try {
      assertion = ikaDocForwardAuthAssertionForRequest(req, forwardAuthSecret);
    } catch (error) {
      return next(error);
    }
    if (!hasIkaDocRuntimeSessionCookie(req) && !assertion) {
      return next();
    }

    const session = await getIkaDocRuntimeSessionForRequest(
      registry,
      req,
      admissionClient,
      assertion,
    );
    if (!session) {
      return next(
        deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session"),
      );
    }
    if (isIkaDocRuntimeSessionExpired(session)) {
      return next(
        deniedIkaDocRuntimeOperation(
          "use expired IkaDoc runtime session",
          session,
        ),
      );
    }

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
  const assertion = ikaDocForwardAuthAssertionForRequest(
    req,
    forwardAuthSecret,
  );
  if (!hasIkaDocRuntimeSessionCookie(req as Request) && !assertion) {
    return undefined;
  }

  const session = await getIkaDocRuntimeSessionForRequest(
    registry,
    req as Request,
    admissionClient,
    assertion,
  );
  if (!session) {
    throw deniedIkaDocRuntimeOperation("use expired IkaDoc runtime session");
  }
  if (isIkaDocRuntimeSessionExpired(session)) {
    throw deniedIkaDocRuntimeOperation(
      "use expired IkaDoc runtime session",
      session,
    );
  }

  const credential = new IkaDocRuntimeCredential(
    session,
    dbManager.getAnonymousUserId(),
    dbManager.getPreviewerUserId(),
  );
  return AuthSession.fromUser(
    credential.identifiedUser,
    org,
    session.sessionId,
    credential,
    false,
  );
}

async function getIkaDocRuntimeSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry,
  req: Request,
  admissionClient: IkaDocEditorAdmissionClient | undefined,
  assertion: IkaDocForwardAuthAssertion | undefined,
): Promise<IkaDocRuntimeSession | undefined> {
  const session = assertion ?
    (registry.getBySessionId(assertion.sessionId) ??
      ikadocRuntimeSessionForRequest(registry, req)) :
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
  return registry.register(result.admission.runtimeConfig, Date.now());
}

class IkaDocRuntimeCredential implements AuthCredential {
  public readonly identifiedUser: FullUser;

  public constructor(
    private readonly _session: IkaDocRuntimeSession,
    anonymousUserId: number,
    private readonly _previewerUserId: number,
  ) {
    this.identifiedUser = {
      id: anonymousUserId,
      email: runtimeUserEmail(_session),
      loginEmail: runtimeUserEmail(_session),
      name: _session.config.user.displayName,
      ref: runtimeUserRef(_session),
      picture: null,
      anonymous: false,
      locale: _session.config.locale,
      extra: {
        ikadocUserId: _session.config.user.userId,
        ikadocSessionId: _session.sessionId,
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
      urlId !== this._session.documentId &&
      urlId !== this._session.documentUrlId
    ) {
      log.warn("IkaDoc runtime doc auth denied", {
        urlId,
        documentId: this._session.documentId,
        documentUrlId: this._session.documentUrlId,
        sessionId: this._session.sessionId,
      });
      throw new ApiError("IkaDoc document access denied", 403);
    }

    log.info("IkaDoc runtime doc auth granted", {
      urlId,
      documentId: this._session.documentId,
      documentUrlId: this._session.documentUrlId,
      sessionId: this._session.sessionId,
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
      throw new ApiError("IkaDoc document access denied", 403);
    }

    const access =
      this._session.config.mode === "editor" ? roles.EDITOR : roles.VIEWER;
    return {
      ...docAuth,
      docId: this._session.documentId,
      access,
      cachedDoc: cloneRuntimeDocumentWithAccess(docAuth.cachedDoc, access),
    };
  }

  public permissionMask() {
    return undefined;
  }

  private _isRuntimeDocument(doc: Document): boolean {
    return (
      doc.id === this._session.documentId ||
      doc.urlId === this._session.documentUrlId ||
      Boolean(
        doc.aliases?.some(
          alias => alias.urlId === this._session.documentUrlId,
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
