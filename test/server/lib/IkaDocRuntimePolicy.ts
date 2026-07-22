import { Document } from "app/gen-server/entity/Document";
import {
  DENIED_IKADOC_CAPABILITIES,
  normalizeIkaDocCapabilities,
} from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocEditorAdmissionClient,
  IkaDocEditorAdmissionRequest,
} from "app/ikadoc/IkaDocEditorAdmission";
import { DocAuthorizerImpl } from "app/server/lib/DocAuthorizer";
import { activeDocMethod } from "app/server/lib/IkaDocActiveDocMethod";
import {
  IKADOC_FORWARD_AUTH_PATH_HEADER,
  IKADOC_FORWARD_AUTH_SESSION_HEADER,
  IKADOC_FORWARD_AUTH_SIGNATURE_HEADER,
  IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER,
  ikaDocForwardAuthSignature,
} from "app/server/lib/IkaDocForwardAuthAssertion";
import {
  createIkaDocRuntimeAuthMiddleware,
  createIkaDocRuntimeAuthSession,
  createIkaDocRuntimeSessionAccessHandler,
} from "app/server/lib/IkaDocRuntimeAuth";
import {
  assertIkaDocUserActionsAllowedForDocument,
  denyIkaDocRuntimeOperation,
  denyIkaDocRuntimeOperationForDocument,
  IKADOC_RUNTIME_SESSION_COOKIE,
  requireIkaDocCapability,
  requireIkaDocRuntimeCapabilityForDocument,
} from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

import * as http from "http";

import axios from "axios";
import { assert } from "chai";
import express from "express";

import type { RequestWithLogin } from "app/server/lib/Authorizer";

describe("IkaDoc runtime policy", function() {
  it("does not affect normal Grist documents", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );

    const response = await requestApp(app, "/api/docs/normal-doc/download");

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });
  });

  it("denies registered IkaDoc runtime documents when a capability is missing", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: false }));
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/download");

    assert.equal(response.status, 403);
    assert.deepEqual(response.data, {
      error: "This Grist session does not allow export document.",
      details: {
        userError: "This action is disabled for this spreadsheet editor.",
      },
    });
  });

  it("denies editor-only browser capabilities in viewer mode even when granted", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canSaveToIkaDoc: true },
        undefined,
        "2099-01-01T00:00:00.000Z",
        "viewer",
      ),
    );
    const app = express();
    app.post(
      "/api/docs/:docId/save",
      requireIkaDocCapability(
        registry,
        "canSaveToIkaDoc",
        "save document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/save", "post");

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow save document.",
    );
  });

  it("denies direct editor-only document capabilities in viewer mode even when granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canSaveToIkaDoc: true },
        undefined,
        "2099-01-01T00:00:00.000Z",
        "viewer",
      ),
    );

    assert.throws(
      () =>
        requireIkaDocRuntimeCapabilityForDocument(
          registry,
          "doc-1",
          "canSaveToIkaDoc",
          "save document",
        ),
      "This Grist session does not allow save document.",
    );
  });

  it("reports browser REST capability denials to the admitted IkaDoc audit callback", async function() {
    const audit = await startAuditServer();
    try {
      const registry = new IkaDocRuntimeSessionRegistry();
      const admitted = runtimeConfig(
        { canExportFromBrowser: false },
        `${audit.baseUrl}/api/grist/sessions/session-1/blocked-capability`,
      );
      registry.register({
        ...admitted,
        statusUrl: `${audit.baseUrl}/api/grist/sessions/session-1`,
      });
      const app = express();
      app.get(
        "/api/docs/:docId/download",
        requireIkaDocCapability(
          registry,
          "canExportFromBrowser",
          "export document",
        ),
        (_req, res) => res.status(200).json({ ok: true }),
      );
      attachJsonErrorHandler(app);

      const response = await requestApp(
        app,
        "/api/docs/doc-1/download",
        "get",
        {
          Cookie: "ikadoc-session=session-cookie",
        },
      );

      assert.equal(response.status, 403);
      await audit.waitForRequest();
      assert.equal(audit.requests.length, 1);
      assert.equal(
        audit.requests[0].path,
        "/api/grist/sessions/session-1/blocked-capability",
      );
      assert.equal(audit.requests[0].cookie, "ikadoc-session=session-cookie");
      assert.deepEqual(audit.requests[0].body, {
        capability: "export document",
        reason: "Forked Grist runtime denied export document.",
      });
    } finally {
      await audit.close();
    }
  });

  it("reports browser REST capability denials without forwarding cookies cross-origin", async function() {
    const audit = await startAuditServer();
    try {
      const registry = new IkaDocRuntimeSessionRegistry();
      const admitted = runtimeConfig(
        { canExportFromBrowser: false },
        `${audit.baseUrl}/api/grist/sessions/session-1/blocked-capability`,
      );
      registry.register({
        ...admitted,
        statusUrl:
          "https://records.owarelin.localhost/api/grist/sessions/session-1",
      });
      const app = express();
      app.get(
        "/api/docs/:docId/download",
        requireIkaDocCapability(
          registry,
          "canExportFromBrowser",
          "export document",
        ),
        (_req, res) => res.status(200).json({ ok: true }),
      );
      attachJsonErrorHandler(app);

      const response = await requestApp(
        app,
        "/api/docs/doc-1/download",
        "get",
        {
          Cookie: "ikadoc-session=session-cookie",
        },
      );

      assert.equal(response.status, 403);
      await audit.waitForRequest();
      assert.equal(audit.requests.length, 1);
      assert.equal(audit.requests[0].cookie, undefined);
      assert.deepEqual(audit.requests[0].body, {
        capability: "export document",
        reason: "Forked Grist runtime denied export document.",
      });
    } finally {
      await audit.close();
    }
  });

  it("allows registered IkaDoc runtime documents when the capability is granted", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );

    const response = await requestApp(app, "/api/docs/doc-1/download");

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });
  });

  it("uses the browser runtime cookie before document lookup when sessions share a document", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: false }));
    registry.register({
      ...runtimeConfig({ canExportFromBrowser: true }),
      sessionId: "session-2",
    });
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/download", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow export document.",
    );
  });

  it("rejects a browser runtime cookie used against a different document route", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    registry.register({
      ...runtimeConfig({ canExportFromBrowser: true }),
      sessionId: "session-2",
      documentId: "doc-2",
      documentUrlId: "doc-url-2",
    });
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-2/download", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow use this runtime session for another document.",
    );
  });

  it("restores runtime credentials after Grist user auth rewrites document REST requests", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    const dbManager = fakeRuntimeAuthDbManager();
    app.use("/api", createIkaDocRuntimeAuthMiddleware(dbManager, registry));
    app.use("/api", (req, _res, next) => {
      const mreq = req as unknown as RequestWithLogin;
      mreq.authSession = undefined;
      mreq.docAuth = undefined;
      next();
    });
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry),
    );
    app.get("/api/docs/:docId", (req, res) => {
      const mreq = req as unknown as RequestWithLogin;
      res.status(200).json({
        hasCredential: Boolean(mreq.authSession?.credential),
        altSessionId: mreq.altSessionId,
      });
    });

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      hasCredential: true,
      altSessionId: "session-1",
    });
  });

  it("restores runtime credentials from a signed IkaDoc forward-auth assertion", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    const dbManager = fakeRuntimeAuthDbManager();
    const secret = "test-forward-auth-secret";
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry, undefined, secret),
    );
    app.get("/api/docs/:docId", (req, res) => {
      const mreq = req as unknown as RequestWithLogin;
      res.status(200).json({
        hasCredential: Boolean(mreq.authSession?.credential),
        altSessionId: mreq.altSessionId,
      });
    });

    const path = "/api/docs/doc-url-1";
    const timestampMillis = Date.now();
    const response = await requestApp(app, path, "get", {
      [IKADOC_FORWARD_AUTH_SESSION_HEADER]: "session-1",
      [IKADOC_FORWARD_AUTH_PATH_HEADER]: path,
      [IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER]: timestampMillis.toString(),
      [IKADOC_FORWARD_AUTH_SIGNATURE_HEADER]: ikaDocForwardAuthSignature(
        secret,
        "session-1",
        path,
        timestampMillis,
      ),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      hasCredential: true,
      altSessionId: "session-1",
    });
  });

  it("serves active session details from the admitted IkaDoc runtime session", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    app.get(
      "/api/session/access/active",
      createIkaDocRuntimeSessionAccessHandler(registry),
      (_req, res) => res.status(500).json({ nativeHandlerReached: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(
      app,
      "/api/session/access/active",
      "get",
      {
        Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
      },
    );

    assert.equal(response.status, 200);
    assert.equal(response.data.user.email, "alice@example.test");
    assert.equal(response.data.user.name, "Alice");
    assert.equal(response.data.user.ref, "ikadoc:user-1");
    assert.equal(response.data.user.anonymous, false);
    assert.equal(response.data.org.name, "records");
    assert.equal(response.data.org.domain, null);
    assert.equal(response.data.org.access, "editors");
  });

  it("serves session user and org lists from the admitted IkaDoc runtime session", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    app.get(
      "/api/session/access/all",
      createIkaDocRuntimeSessionAccessHandler(registry),
      (_req, res) => res.status(500).json({ nativeHandlerReached: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/session/access/all", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 200);
    assert.lengthOf(response.data.users, 1);
    assert.lengthOf(response.data.orgs, 1);
    assert.equal(response.data.users[0].email, "alice@example.test");
    assert.equal(response.data.orgs[0].name, "records");
  });

  it("does not handle native Grist session details without an IkaDoc runtime session", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const app = express();
    app.get(
      "/api/session/access/active",
      createIkaDocRuntimeSessionAccessHandler(registry),
      (_req, res) => res.status(200).json({ nativeHandlerReached: true }),
    );

    const response = await requestApp(app, "/api/session/access/active");

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { nativeHandlerReached: true });
  });

  it("creates websocket runtime auth sessions from signed IkaDoc forward-auth assertions", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const dbManager = fakeRuntimeAuthDbManager();
    const secret = "test-forward-auth-secret";
    const path = "/api/docs/doc-url-1";
    const timestampMillis = Date.now();

    const authSession = await createIkaDocRuntimeAuthSession(
      dbManager,
      registry,
      {
        url: `${path}?clientId=0&counter=1`,
        headers: {
          [IKADOC_FORWARD_AUTH_SESSION_HEADER]: "session-1",
          [IKADOC_FORWARD_AUTH_PATH_HEADER]: path,
          [IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER]: timestampMillis.toString(),
          [IKADOC_FORWARD_AUTH_SIGNATURE_HEADER]: ikaDocForwardAuthSignature(
            secret,
            "session-1",
            path,
            timestampMillis,
          ),
        },
      } as unknown as http.IncomingMessage,
      "ikadoc",
      undefined,
      secret,
    );

    assert.equal(authSession?.altSessionId, "session-1");
    assert.equal(authSession?.org, "ikadoc");
    assert.equal(authSession?.identifiedUser?.email, "alice@example.test");
    assert.equal(
      authSession?.identifiedUser?.extra?.ikadocSessionId,
      "session-1",
    );
  });

  it("limits runtime credential scope and document auth to the admitted IkaDoc document", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));
    const admittedDoc = runtimeDocument("doc-1", "doc-url-1");
    const otherDoc = runtimeDocument("doc-2", "doc-url-2");
    const dbManager = fakeRuntimeAuthDbManager({ cachedDoc: admittedDoc });
    const app = express();
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry),
    );
    app.get("/api/docs/:docId", async (req, res) => {
      const credential = (req as unknown as RequestWithLogin).authSession
        ?.credential;
      const scope = credential?.scope(req);
      const docAuth = await credential?.docAuth(
        req as unknown as RequestWithLogin,
        dbManager,
        req.params.docId,
      );
      res.status(200).json({
        filteredIds: scope
          ?.filter?.([admittedDoc, otherDoc])
          .map(doc => doc.id),
        scopeUserId: scope?.userId,
        authAccess: docAuth?.access,
        authDocId: docAuth?.docId,
        cachedAccess: docAuth?.cachedDoc?.access,
        originalAccess: admittedDoc.access,
      });
    });

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      filteredIds: ["doc-1"],
      scopeUserId: 1,
      authAccess: "editors",
      authDocId: "doc-1",
      cachedAccess: "editors",
      originalAccess: "viewers",
    });
  });

  it("uses runtime credential doc auth for websocket document authorization", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));
    const dbManager = fakeRuntimeAuthDbManager({
      cachedDoc: runtimeDocument("doc-1", "doc-url-1"),
    });
    const app = express();
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry),
    );
    app.get("/api/docs/:docId", async (req, res) => {
      const mreq = req as unknown as RequestWithLogin;
      const authorizer = new DocAuthorizerImpl({
        authSession: mreq.authSession!,
        dbManager,
        openMode: "default",
        urlId: req.params.docId,
      });
      await authorizer.assertAccess("editors");
      res.status(200).json({
        docId: authorizer.getCachedAuth().docId,
        access: authorizer.getCachedAuth().access,
      });
    });

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      docId: "doc-1",
      access: "editors",
    });
  });

  it("uses viewer document auth for read-only IkaDoc runtime sessions", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register({
      ...runtimeConfig({ canEditCells: false, canEditStructure: false }),
      mode: "viewer",
    });
    const dbManager = fakeRuntimeAuthDbManager({
      cachedDoc: runtimeDocument("doc-1", "doc-url-1"),
    });
    const app = express();
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry),
    );
    app.get("/api/docs/:docId", async (req, res) => {
      const credential = (req as unknown as RequestWithLogin).authSession
        ?.credential;
      const docAuth = await credential?.docAuth(
        req as unknown as RequestWithLogin,
        dbManager,
        req.params.docId,
      );
      res.status(200).json({
        access: docAuth?.access,
        cachedAccess: docAuth?.cachedDoc?.access,
      });
    });

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      access: "viewers",
      cachedAccess: "viewers",
    });
  });

  it("fails closed for forged IkaDoc forward-auth assertions", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    const app = express();
    const dbManager = fakeRuntimeAuthDbManager();
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(
        dbManager,
        registry,
        undefined,
        "test-forward-auth-secret",
      ),
    );
    app.get("/api/docs/:docId", (_req, res) =>
      res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const path = "/api/docs/doc-url-1";
    const response = await requestApp(app, path, "get", {
      [IKADOC_FORWARD_AUTH_SESSION_HEADER]: "session-1",
      [IKADOC_FORWARD_AUTH_PATH_HEADER]: path,
      [IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER]: Date.now().toString(),
      [IKADOC_FORWARD_AUTH_SIGNATURE_HEADER]: "0".repeat(64),
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "Invalid IkaDoc forward-auth assertion signature",
    );
  });

  it("revalidates missing local runtime sessions with IkaDoc before document REST auth", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const admissionRequests: IkaDocEditorAdmissionRequest[] = [];
    const app = express();
    const dbManager = fakeRuntimeAuthDbManager();
    const admissionClient: IkaDocEditorAdmissionClient = {
      async admitEditor(request) {
        admissionRequests.push(request);
        return {
          kind: "accepted",
          admission: runtimeAdmission(
            runtimeConfig({ canExportFromBrowser: true }),
          ),
        };
      },
    };
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry, admissionClient),
    );
    app.get("/api/docs/:docId", (req, res) => {
      const mreq = req as unknown as RequestWithLogin;
      res.status(200).json({
        hasCredential: Boolean(mreq.authSession?.credential),
        altSessionId: mreq.altSessionId,
      });
    });

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ikadoc-session=signed-user-session`,
      Origin: "https://records.owarelin.localhost",
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.data, {
      hasCredential: true,
      altSessionId: "session-1",
    });
    assert.equal(
      registry.getBySessionId("session-1")?.documentUrlId,
      "doc-url-1",
    );
    assert.deepEqual(admissionRequests, [
      {
        sessionId: "session-1",
        proof: { kind: "backend-session" },
        cookieHeader: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ikadoc-session=signed-user-session`,
        origin: "https://records.owarelin.localhost",
      },
    ]);
  });

  it("fails closed when IkaDoc rejects revalidation for a missing local runtime session", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const admissionRequests: IkaDocEditorAdmissionRequest[] = [];
    const app = express();
    const dbManager = fakeRuntimeAuthDbManager();
    const admissionClient: IkaDocEditorAdmissionClient = {
      async admitEditor(request) {
        admissionRequests.push(request);
        return {
          kind: "denied",
          code: "permission-denied",
          safeMessage: "Permission denied.",
        };
      },
    };
    app.use(
      "/api/docs/:docId",
      createIkaDocRuntimeAuthMiddleware(dbManager, registry, admissionClient),
    );
    app.get("/api/docs/:docId", (_req, res) =>
      res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-url-1", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ikadoc-session=signed-user-session`,
      Origin: "https://records.owarelin.localhost",
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow use expired runtime session.",
    );
    assert.isUndefined(registry.getBySessionId("session-1"));
    assert.deepEqual(admissionRequests, [
      {
        sessionId: "session-1",
        proof: { kind: "backend-session" },
        cookieHeader: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ikadoc-session=signed-user-session`,
        origin: "https://records.owarelin.localhost",
      },
    ]);
  });

  it("denies registered IkaDoc runtime documents after session expiry", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canExportFromBrowser: true },
        undefined,
        "2000-01-01T00:00:00.000Z",
      ),
    );
    const app = express();
    app.get(
      "/api/docs/:docId/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/download");

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow use expired runtime session.",
    );
  });

  it("denies registered IkaDoc runtime documents for always-blocked operations", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canFork: true }));
    const app = express();
    app.post(
      "/api/docs/:docId/copy",
      denyIkaDocRuntimeOperation(registry, "copy document"),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/copy", "post");

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow copy document.",
    );
  });

  it("denies always-blocked operations for IkaDoc browser sessions without document route params", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({}));
    const app = express();
    app.post(
      "/api/docs",
      denyIkaDocRuntimeOperation(registry, "create Grist-owned document"),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs", "post", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow create Grist-owned document.",
    );
  });

  it("fails closed for stale IkaDoc browser session cookies", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const app = express();
    app.get(
      "/api/profile/user",
      denyIkaDocRuntimeOperation(registry, "use Grist profile management"),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/profile/user", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=missing-session`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow use expired runtime session.",
    );
  });

  it("denies Grist home-resource APIs for IkaDoc browser sessions", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({}));
    const app = express();
    app.get(
      "/api/templates/",
      denyIkaDocRuntimeOperation(registry, "browse Grist home resources"),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/templates/", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow browse Grist home resources.",
    );
  });

  it("fails closed for stale IkaDoc browser session cookies on capability-gated routes", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    const app = express();
    app.get(
      "/api/docs/doc-1/download",
      requireIkaDocCapability(
        registry,
        "canExportFromBrowser",
        "export document",
      ),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    attachJsonErrorHandler(app);

    const response = await requestApp(app, "/api/docs/doc-1/download", "get", {
      Cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=missing-session`,
    });

    assert.equal(response.status, 403);
    assert.equal(
      response.data.error,
      "This Grist session does not allow use expired runtime session.",
    );
  });

  it("prunes expired runtime sessions during registry lookup", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canExportFromBrowser: true },
        undefined,
        "2000-01-01T00:00:00.000Z",
      ),
    );

    assert.isUndefined(registry.getBySessionId("session-1"));
    assert.isUndefined(registry.getByDocumentId("doc-1"));
    assert.isUndefined(registry.getByDocumentId("doc-url-1"));
  });

  it("prunes expired runtime sessions without removing active sessions", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canExportFromBrowser: true },
        undefined,
        "2000-01-01T00:00:00.000Z",
      ),
    );
    registry.register({
      ...runtimeConfig({ canExportFromBrowser: true }),
      sessionId: "session-2",
      documentId: "doc-2",
      documentUrlId: "doc-url-2",
    });

    registry.pruneExpired(Date.parse("2026-01-01T00:00:00.000Z"));

    assert.isUndefined(registry.getBySessionId("session-1"));
    assert.equal(registry.getBySessionId("session-2")?.documentId, "doc-2");
    assert.equal(registry.getByDocumentId("doc-url-2")?.sessionId, "session-2");
  });

  it("removes stale document indexes when a runtime session is replaced", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canExportFromBrowser: true }));
    registry.register({
      ...runtimeConfig({ canExportFromBrowser: true }),
      documentId: "doc-2",
      documentUrlId: "doc-url-2",
    });

    assert.isUndefined(registry.getByDocumentId("doc-1"));
    assert.isUndefined(registry.getByDocumentId("doc-url-1"));
    assert.equal(registry.getByDocumentId("doc-2")?.sessionId, "session-1");
    assert.equal(registry.getBySessionId("session-1")?.documentId, "doc-2");
  });

  it("denies websocket-style operations by registered document id", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUsePlugins: false }));

    assert.throws(
      () =>
        requireIkaDocRuntimeCapabilityForDocument(
          registry,
          "doc-1",
          "canUsePlugins",
          "use plugin RPC",
        ),
      "This Grist session does not allow use plugin RPC.",
    );
  });

  it("reports websocket-style capability denials without storing the browser cookie", async function() {
    const audit = await startAuditServer();
    try {
      const registry = new IkaDocRuntimeSessionRegistry();
      registry.register(
        runtimeConfig(
          { canUsePlugins: false },
          `${audit.baseUrl}/api/grist/sessions/session-1/blocked-capability`,
        ),
      );

      assert.throws(
        () =>
          requireIkaDocRuntimeCapabilityForDocument(
            registry,
            "doc-1",
            "canUsePlugins",
            "use plugin RPC",
          ),
        "This Grist session does not allow use plugin RPC.",
      );
      await audit.waitForRequest();
      assert.equal(audit.requests.length, 1);
      assert.equal(audit.requests[0].cookie, undefined);
      assert.deepEqual(audit.requests[0].body, {
        capability: "use plugin RPC",
        reason: "Forked Grist runtime denied use plugin RPC.",
      });
    } finally {
      await audit.close();
    }
  });

  it("allows websocket-style operations by registered document id when the capability is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUsePlugins: true }));

    requireIkaDocRuntimeCapabilityForDocument(
      registry,
      "doc-1",
      "canUsePlugins",
      "use plugin RPC",
    );
  });

  it("denies websocket-style operations after session expiry", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canUsePlugins: true },
        undefined,
        "2000-01-01T00:00:00.000Z",
      ),
    );

    assert.throws(
      () =>
        requireIkaDocRuntimeCapabilityForDocument(
          registry,
          "doc-1",
          "canUsePlugins",
          "use plugin RPC",
        ),
      "This Grist session does not allow use expired runtime session.",
    );
  });

  it("denies websocket-style always-blocked operations by registered document id", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canFork: true }));

    assert.throws(
      () =>
        denyIkaDocRuntimeOperationForDocument(
          registry,
          "doc-1",
          "fork document",
        ),
      "This Grist session does not allow fork document.",
    );
  });

  it("blocks websocket dispatcher calls before active document execution", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUsePlugins: false }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "forwardPluginRpc",
      {
        capability: "canUsePlugins",
        operation: "use plugin RPC",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "forwardPluginRpc", () => {
          called = true;
        }),
        1,
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow use plugin RPC.",
    );
    assert.isFalse(called);
  });

  it("uses websocket client runtime session before document lookup when sessions share a document", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUsePlugins: false }));
    registry.register({
      ...runtimeConfig({ canUsePlugins: true }),
      sessionId: "session-2",
    });
    const authSession = await createIkaDocRuntimeAuthSession(
      fakeRuntimeAuthDbManager(),
      registry,
      {
        headers: {
          cookie: `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1`,
        },
      } as unknown as http.IncomingMessage,
      "ikadoc",
    );
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "forwardPluginRpc",
      {
        capability: "canUsePlugins",
        operation: "use plugin RPC",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc(
          "doc-1",
          "forwardPluginRpc",
          () => {
            called = true;
          },
          authSession,
        ),
        1,
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow use plugin RPC.",
    );
    assert.isFalse(called);
  });

  it("revalidates registered IkaDoc runtime sessions before websocket document execution", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));
    const validatedOperations: string[] = [];
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      {
        async validate(_session, operation) {
          validatedOperations.push(operation);
          throw new Error("IkaDoc session was revoked");
        },
      },
      "editors",
      "applyUserActions",
      {
        capability: "canEditCells",
        operation: "apply document edits",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "applyUserActions", () => {
          called = true;
        }),
        1,
        [["UpdateRecord", "Table1", 1, { Name: "Updated" }]],
      ),
    );

    assert.equal(error?.message, "IkaDoc session was revoked");
    assert.deepEqual(validatedOperations, ["apply document edits"]);
    assert.isFalse(called);
  });

  it("blocks websocket ACL helper calls without access-management capability", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canManageAccess: false }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "viewers",
      "getAclResources",
      {
        capability: "canManageAccess",
        operation: "list access resources",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "getAclResources", () => {
          called = true;
        }),
        1,
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow list access resources.",
    );
    assert.isFalse(called);
  });

  it("allows websocket ACL helper calls with access-management capability", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canManageAccess: true }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "viewers",
      "checkAclFormula",
      {
        capability: "canManageAccess",
        operation: "check access formula",
      },
    );

    await method(
      clientForActiveDoc("doc-1", "checkAclFormula", () => {
        called = true;
      }),
      1,
      "user.Email == 'alice@example.test'",
    );

    assert.isTrue(called);
  });

  it("blocks websocket assistant and proposal calls in IkaDoc runtime mode", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({}));
    const blockedMethods = [
      {
        methodName: "getAssistantState",
        role: "owners" as const,
        operation: "use assistant",
      },
      {
        methodName: "getAssistance",
        role: "viewers" as const,
        operation: "use assistant",
      },
      {
        methodName: "applyProposal",
        role: "owners" as const,
        operation: "use proposals",
      },
    ];

    for (const blocked of blockedMethods) {
      let called = false;
      const method = activeDocMethod(
        undefined,
        registry,
        undefined,
        blocked.role,
        blocked.methodName,
        { operation: blocked.operation },
      );

      const error = await captureError(() =>
        method(
          clientForActiveDoc("doc-1", blocked.methodName, () => {
            called = true;
          }),
          1,
        ),
      );

      assert.equal(
        error?.message,
        `This Grist session does not allow ${blocked.operation}.`,
      );
      assert.isFalse(called);
    }
  });

  it("allows websocket dispatcher calls when the capability is granted", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUsePlugins: true }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "forwardPluginRpc",
      {
        capability: "canUsePlugins",
        operation: "use plugin RPC",
      },
    );

    await method(
      clientForActiveDoc(
        "doc-1",
        "forwardPluginRpc",
        function(this: { docName: string }) {
          called = true;
          assert.equal(this.docName, "doc-1");
        },
      ),
      1,
    );

    assert.isTrue(called);
  });

  it("blocks websocket history summaries when history viewing is missing", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canViewHistory: false }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "viewers",
      "getActionSummaries",
      {
        capability: "canViewHistory",
        operation: "view document history",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "getActionSummaries", () => {
          called = true;
        }),
        1,
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow view document history.",
    );
    assert.isFalse(called);
  });

  it("allows websocket history summaries when history viewing is granted", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canViewHistory: true }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "viewers",
      "getActionSummaries",
      {
        capability: "canViewHistory",
        operation: "view document history",
      },
    );

    await method(
      clientForActiveDoc("doc-1", "getActionSummaries", () => {
        called = true;
      }),
      1,
    );

    assert.isTrue(called);
  });

  it("allows local file import without enabling external data access", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canImportLocalFiles: true, canUseExternalData: false }),
    );
    let called = false;
    const importMethod = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "importFiles",
      {
        capability: "canImportLocalFiles",
        operation: "import files",
      },
    );
    const fetchMethod = activeDocMethod(
      undefined,
      registry,
      undefined,
      "viewers",
      "fetchURL",
      {
        capability: "canUseExternalData",
        operation: "fetch external URL",
      },
    );

    await importMethod(
      clientForActiveDoc("doc-1", "importFiles", () => {
        called = true;
      }),
      1,
    );
    const externalError = await captureError(() =>
      fetchMethod(
        clientForActiveDoc("doc-1", "fetchURL", () => {
          throw new Error("external fetch should not run");
        }),
        1,
      ),
    );

    assert.isTrue(called);
    assert.equal(
      externalError?.message,
      "This Grist session does not allow fetch external URL.",
    );
  });

  it("blocks local file import when the import capability is missing", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "importFiles",
      {
        capability: "canImportLocalFiles",
        operation: "import files",
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "importFiles", () => {
          called = true;
        }),
        1,
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow import files.",
    );
    assert.isFalse(called);
  });

  it("blocks websocket applyUserActions payloads before active document execution", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "applyUserActions",
      {
        operation: "apply document edits",
        classifyUserActions: true,
      },
    );

    const error = await captureError(() =>
      method(
        clientForActiveDoc("doc-1", "applyUserActions", () => {
          called = true;
        }),
        1,
        { malformed: true },
      ),
    );

    assert.equal(
      error?.message,
      "This Grist session does not allow apply malformed document edits.",
    );
    assert.isFalse(called);
  });

  it("allows websocket chart actions through the action classifier without cell-edit capability", async function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canCreateCharts: true }),
    );
    let called = false;
    const method = activeDocMethod(
      undefined,
      registry,
      undefined,
      "editors",
      "applyUserActions",
      {
        operation: "apply document edits",
        classifyUserActions: true,
      },
    );

    await method(
      clientForActiveDoc("doc-1", "applyUserActions", () => {
        called = true;
      }),
      1,
      [
        ["CreateViewSection", 1, 1, "chart", null, null],
        [
          "AddRecord",
          "_grist_Views_section_field",
          null,
          { parentId: 7, colRef: 2, parentPos: 1 },
        ],
      ],
    );

    assert.isTrue(called);
  });

  it("allows normal user-table edits when cell editing is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["UpdateRecord", "Table1", 1, { Name: "Updated" }],
      ["BulkAddRecord", "Table1", [2], { Name: ["New"] }],
    ]);
  });

  it("denies user-table edits in viewer mode even when cell editing is present", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig(
        { canEditCells: true },
        undefined,
        "2099-01-01T00:00:00.000Z",
        "viewer",
      ),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "Table1", 1, { Name: "Updated" }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies structure actions when only cell editing is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditCells: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddColumn", "Table1", "Formula", { type: "Any" }],
        ]),
      "This Grist session does not allow apply AddColumn.",
    );
  });

  it("allows structure actions when structure editing is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditCells: true, canEditStructure: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["AddColumn", "Table1", "Formula", { type: "Any" }],
    ]);
  });

  it("denies formula schema actions when only structure editing is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: false }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["ModifyColumn", "Table1", "A", { isFormula: true, formula: "$B" }],
        ]),
      "This Grist session does not allow apply ModifyColumn.",
    );
  });

  it("denies formula schema actions when structure editing is missing", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: false, canUseFormulas: true }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["ModifyColumn", "Table1", "A", { isFormula: true, formula: "$B" }],
        ]),
      "This Grist session does not allow apply ModifyColumn.",
    );
  });

  it("allows formula schema actions when formula and structure editing are granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["ModifyColumn", "Table1", "A", { isFormula: true, formula: "$B" }],
    ]);
  });

  it("denies formula metadata edits without formula capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: false }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "_grist_Tables_column", 1, { formula: "$B" }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies validation formula metadata edits without formula capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: false }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddRecord", "_grist_Validations", null, { formula: "$A > 0" }],
        ]),
      "This Grist session does not allow apply AddRecord.",
    );
  });

  it("denies visible column formula creation without formula capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: false }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddVisibleColumn", "Table1", "Formula", { formula: "$A + 1" }],
        ]),
      "This Grist session does not allow apply AddVisibleColumn.",
    );
  });

  it("denies table creation with formula columns without formula capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseFormulas: false }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          [
            "AddTable",
            "Table1",
            [
              { id: "Name", type: "Text" },
              { id: "Formula", formula: "$Name" },
            ],
          ],
        ]),
      "This Grist session does not allow apply AddTable.",
    );
  });

  it("denies comment metadata edits without comment capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditStructure: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddRecord", "_grist_Cells", null, { content: "comment" }],
        ]),
      "This Grist session does not allow apply AddRecord.",
    );
  });

  it("allows comment metadata edits with comment capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canUseComments: true }));

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["AddRecord", "_grist_Cells", null, { content: "comment" }],
    ]);
  });

  it("denies attachment metadata edits without attachment capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditStructure: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddRecord", "_grist_Attachments", null, { fileName: "secret.pdf" }],
        ]),
      "This Grist session does not allow apply AddRecord.",
    );
  });

  it("denies trigger metadata edits without external data capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditStructure: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["AddRecord", "_grist_Triggers", null, { label: "Webhook" }],
        ]),
      "This Grist session does not allow apply AddRecord.",
    );
  });

  it("denies access-rule metadata edits without access management capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditCells: true, canEditStructure: true }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          [
            "AddRecord",
            "_grist_ACLRules",
            null,
            { aclFormula: "user.Email == 'x@example.test'" },
          ],
        ]),
      "This Grist session does not allow apply AddRecord.",
    );
  });

  it("denies custom-widget layout creation without custom-widget capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canCreateCharts: true }),
    );

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "_grist_Views_section", 1, { parentKey: "custom" }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies custom-widget option changes without custom-widget capability", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditStructure: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          [
            "UpdateRecord",
            "_grist_Views_section",
            1,
            {
              options: JSON.stringify({
                customView: { mode: "url", url: "https://example.test" },
              }),
            },
          ],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies page metadata edits when only chart creation is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canCreateCharts: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "_grist_Pages", 1, { pagePos: 2 }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies generic layout metadata edits when only chart creation is granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canCreateCharts: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "_grist_Views_section", 1, { title: "Renamed" }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("denies chart metadata edits when chart creation is missing", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(runtimeConfig({ canEditStructure: true }));

    assert.throws(
      () =>
        assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
          ["UpdateRecord", "_grist_Views_section", 1, { chartType: "bar" }],
        ]),
      "This Grist session does not allow apply UpdateRecord.",
    );
  });

  it("allows chart metadata edits when chart and structure capabilities are granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canCreateCharts: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["UpdateRecord", "_grist_Views_section", 1, { chartType: "bar" }],
    ]);
  });

  it("allows chart view-section creation when chart and structure capabilities are granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canCreateCharts: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["CreateViewSection", 1, 1, "chart", null, null],
    ]);
  });

  it("allows the native chart summary action chain with chart and structure capabilities", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canCreateCharts: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["CreateViewSection", 1, 1, "chart", null, null],
      ["UpdateSummaryViewSection", 1, [2], { groupBy: [2] }],
      ["AddRecord", "_grist_Tables", null, { tableId: "GristSummary_1" }],
      [
        "BulkAddRecord",
        "_grist_Tables_column",
        [101, 102],
        { parentId: [7, 7], colId: ["Schema", "count"], type: ["Text", "Int"] },
      ],
      [
        "UpdateRecord",
        "_grist_Views_section",
        7,
        { parentKey: "chart", chartType: "bar" },
      ],
      ["RemoveViewSection", 4],
    ]);
  });

  it("allows custom-widget layout creation when custom-widget and structure capabilities are granted", function() {
    const registry = new IkaDocRuntimeSessionRegistry();
    registry.register(
      runtimeConfig({ canEditStructure: true, canUseCustomWidgets: true }),
    );

    assertIkaDocUserActionsAllowedForDocument(registry, "doc-1", [
      ["UpdateRecord", "_grist_Views_section", 1, { parentKey: "custom" }],
    ]);
  });
});

function runtimeConfig(
  capabilities: Partial<typeof DENIED_IKADOC_CAPABILITIES>,
  blockedCapabilityUrl?: string,
  expiresAt = "2099-01-01T00:00:00.000Z",
  mode: "editor" | "viewer" = "editor",
) {
  return {
    enabled: true,
    sessionId: "session-1",
    collectionCode: "records",
    user: {
      userId: "user-1",
      username: "alice",
      displayName: "Alice",
      email: "alice@example.test",
    },
    sourceType: "document-file",
    mode,
    expiresAt,
    documentId: "doc-1",
    documentUrlId: "doc-url-1",
    workerUrl: "/api/docs/doc-1",
    statusUrl: "/api/grist/sessions/session-1",
    validationUrl: "/api/grist/editor/session-validation",
    discardUrl: "/api/grist/sessions/session-1/cancel",
    blockedCapabilityUrl,
    capabilities: normalizeIkaDocCapabilities(capabilities),
    locale: "en",
    appearance: "light",
  } as const;
}

interface AuditRequest {
  path: string;
  cookie: string | undefined;
  body: unknown;
}

async function startAuditServer() {
  const requests: AuditRequest[] = [];
  let notifyRequest: (() => void) | undefined;
  const app = express();
  app.use(express.json());
  app.post("/api/grist/sessions/session-1/blocked-capability", (req, res) => {
    requests.push({
      path: req.path,
      cookie: req.headers.cookie,
      body: req.body,
    });
    notifyRequest?.();
    res.status(204).end();
  });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  assert.isObject(address);
  const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;
  return {
    baseUrl,
    requests,
    waitForRequest: () =>
      requests.length > 0 ?
        Promise.resolve() :
        new Promise<void>((resolve, reject) => {
          notifyRequest = resolve;
          setTimeout(
            () => reject(new Error("Timed out waiting for audit callback")),
            1000,
          );
        }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      }),
  };
}

function attachJsonErrorHandler(app: express.Application) {
  app.use(
    (
      err: Error & { status?: number; details?: unknown },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(err.status || 500)
        .json({ error: err.message, details: err.details });
    },
  );
}

async function requestApp(
  app: express.Application,
  path: string,
  method: "get" | "post" = "get",
  headers?: Record<string, string>,
) {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  assert.isObject(address);

  try {
    const port = (address as { port: number }).port;
    const url = `http://127.0.0.1:${port}${path}`;
    const config = {
      headers,
      validateStatus: () => true,
    };
    if (method === "post") {
      return await axios.post(url, undefined, config);
    }
    return await axios.get(url, config);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

function runtimeAdmission(
  runtimeConfigValue: ReturnType<typeof runtimeConfig>,
) {
  return {
    sessionId: runtimeConfigValue.sessionId,
    actorId: "actor-1",
    tenantId: "tenant-1",
    deploymentId: "deployment-1",
    controlAuthority: "saas",
    sourceType: runtimeConfigValue.sourceType,
    mode: runtimeConfigValue.mode,
    expiresAt: runtimeConfigValue.expiresAt,
    capabilities: runtimeConfigValue.capabilities,
    runtimeConfig: runtimeConfigValue,
  };
}

function runtimeDocument(id: string, urlId: string): Document {
  const doc = new Document();
  doc.id = id;
  doc.urlId = urlId;
  doc.aliases = [];
  doc.access = "viewers";
  return doc;
}

function fakeRuntimeAuthDbManager(options: { cachedDoc?: Document } = {}) {
  const anonymousUser = { id: 0 };
  const previewerUserId = 1;
  return {
    getAnonymousUser() {
      return anonymousUser;
    },
    getAnonymousUserId() {
      return anonymousUser.id;
    },
    getPreviewerUserId() {
      return previewerUserId;
    },
    async getDocAuthCached() {
      const cachedDoc = options.cachedDoc;
      return {
        access: cachedDoc?.access ?? "viewers",
        cachedDoc,
        disabled: false,
        docId: cachedDoc?.id ?? "doc-1",
        removed: false,
      };
    },
    makeFullUser(user: { id: number }) {
      return {
        id: user.id,
        name: "Anonymous",
      };
    },
  } as never;
}

async function captureError(
  action: () => Promise<unknown>,
): Promise<Error | undefined> {
  try {
    await action();
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

function clientForActiveDoc(
  docName: string,
  methodName: string,
  onCall: (this: { docName: string }) => void,
  authSession: unknown = { isApiKeyAuth: false },
) {
  return {
    authSession,
    getDocSession() {
      return {
        activeDoc: {
          docName,
          getLogMeta: () => ({}),
          [methodName]: async function() {
            onCall.call(this);
          },
        },
        authorizer: {
          assertAccess: async () => undefined,
          getCachedAuth: () => ({}),
        },
      };
    },
  } as never;
}
