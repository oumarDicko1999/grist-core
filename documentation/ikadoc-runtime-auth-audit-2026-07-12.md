# Owarelin Grist Runtime Auth Audit

Date: 2026-07-12

## Current Live Failure

- Browser route: `https://records.owarelin.localhost/grist/editor/<sessionId>`.
- Grist client then calls `GET /api/docs/<remoteDocumentUrlId>`.
- Live response: `403 {"error":"access denied"}`.
- IkaDoc backend logs show:
  - document-file session creation succeeds,
  - Grist import succeeds,
  - editor admission succeeds,
  - Traefik forward-auth succeeds with `204`,
  - session status calls succeed.
- Direct signed request inside the Grist container to `http://127.0.0.1:8484/api/docs/<remoteDocumentUrlId>` also returns `403 {"error":"access denied"}`.

Conclusion: this is not primarily Traefik, not IkaDoc admission, and not the IkaDoc session store. The rejection is inside Grist's own HomeDB authorization path.

## Confirmed Request Flow

1. IkaDoc creates/imports a runtime Grist document.
2. Browser opens `/grist/editor/:sessionId`.
3. Grist fork endpoint `app/server/lib/IkaDocEditorEndpoint.ts`:
   - calls IkaDoc admission,
   - registers `IkaDocRuntimeSession`,
   - sets runtime cookie,
   - serves Grist app with `gristConfig.ikadoc`,
   - sets `assignmentId`, `getWorker`, and `workerUrl`.
4. Browser requests Home API document metadata: `GET /api/docs/:did`.
5. Traefik forward-auth calls IkaDoc backend and receives `204`.
6. Traefik forwards signed IkaDoc headers to Grist.
7. Grist `createIkaDocRuntimeAuthMiddleware` validates the signed assertion and attaches an `AuthSession` with `IkaDocRuntimeCredential`.
8. Grist `ApiServer` route still calls `HomeDBManager.getDoc(req)`.
9. `HomeDBManager.getDoc(req)` calls `getScope(req)`.
10. `getScope(req)` asks `authSession.credential.scope(req)`.
11. `IkaDocRuntimeCredential.scope()` currently returns `undefined`.
12. Grist falls back to anonymous/native HomeDB ACL and returns `403 access denied`.

## Confirmed Safe Paths

- `DocApi` route access guard uses `getOrSetDocAuth(...)`.
- `DocApiForwarder` uses `getOrSetDocAuth(...)`.
- `DocWorker.assertDocAccess` uses `getOrSetDocAuth(...)`.
- `getOrSetDocAuth(...)` correctly delegates to `authSession.credential.docAuth(...)` when a credential exists.
- IkaDoc capability guards exist on dangerous document APIs:
  - browser export,
  - fork/copy,
  - admin mutations,
  - history mutation,
  - assistant/proposals,
  - external send,
  - document creation.

## Confirmed Gaps

### Gap 1: IkaDoc runtime credential does not contribute Grist scope

- Evidence:
  - `app/server/lib/IkaDocRuntimeAuth.ts`
  - `IkaDocRuntimeCredential.scope(_req)` returns `undefined`.
  - `app/server/lib/requestUtils.ts` uses credential scope from `authSession.credential.scope(req)`.
  - `HomeDBManager.getDoc(req)` relies on `getScope(req)`.
- Impact:
  - Any Grist route using `getScope(req)` can ignore the IkaDoc runtime restriction and fall back to native anonymous/user ACL.
  - Current visible failure: `GET /api/docs/:did` returns `403`.
  - If native ACL accidentally allowed access, this could become over-broad unless the scope has an exact runtime document filter.
- Required fix:
  - `IkaDocRuntimeCredential.scope(req)` must return a Grist scope using a service/previewer user plus a resource filter that allows only the admitted `documentId` or `documentUrlId`.

### Gap 2: Websocket `DocAuthorizerImpl` bypasses credentials

- Evidence:
  - `app/server/lib/DocManager.ts` creates `new DocAuthorizerImpl({ authSession: client.authSession })`.
  - `app/server/lib/DocAuthorizer.ts` uses `dbManager.getDocAuthCached(this._key)` directly.
  - It does not call `authSession.credential.docAuth(...)`.
- Impact:
  - REST/forwarder can be credential-aware while websocket open/re-auth can still use native Grist ACL.
  - This can cause editor load failures after websocket connect, reconnect, or session revalidation.
- Required fix:
  - `DocAuthorizerImpl.assertAccess(...)` must use `authSession.credential.docAuth(...)` when a credential exists, matching `getOrSetDocAuth(...)`.

### Gap 3: App page preload has native ACL assumptions

- Evidence:
  - `app/server/lib/AppEndpoint.ts` document handler calls:
    - `dbManager.getDoc({ userId, org, urlId })`
    - `dbManager.getDocAuthCached({ userId, org, urlId })`
  - It does not use credential doc auth.
- Impact:
  - For normal `/doc/:id` pages this can bypass IkaDoc runtime semantics.
  - The custom `/grist/editor/:sessionId` currently avoids this handler by serving the app directly, but future route changes could reintroduce the failure.
- Required fix:
  - Either keep `/grist/editor/:sessionId` isolated and document that invariant, or make app-page preload credential-aware too.

### Gap 4: Middleware order can overwrite IkaDoc auth

- Evidence:
  - `FlexServer.addApiMiddleware()` installs IkaDoc runtime auth before `_userIdMiddleware`.
  - `addRequestUser()` calls `setRequestUser(...)`, replacing `mreq.authSession`.
  - Existing code re-attaches IkaDoc middleware at DocApi and Home API seams.
- Impact:
  - Global `/api` auth alone is not enough.
  - Every Grist surface that needs runtime credentials must attach the middleware after Grist user resolution, or the shared lower-level auth must not depend on global middleware ordering.
- Required fix:
  - Keep explicit seam middleware for Home API and DocApi.
  - Verify app/doc page and websocket paths use runtime admission directly or attach after native user resolution.

## Security Invariants For Fix

- IkaDoc remains source of truth.
- Grist native ACL must not grant broader access than IkaDoc.
- IkaDoc runtime session must authorize exactly one Grist document.
- Missing/expired/rejected IkaDoc runtime session fails closed.
- Forward-auth signed headers must remain required for proxied browser traffic.
- Direct forged Grist headers must remain rejected.
- Previewer/service reads are allowed only after IkaDoc session validation and exact document filtering.

## Test Cases Needed

- `GET /api/docs/:did` with signed IkaDoc assertion returns metadata for the admitted document.
- `GET /api/docs/:otherDid` with the same signed assertion fails.
- Websocket `openDoc` succeeds for the admitted document.
- Websocket `openDoc` fails for a different document.
- Missing local runtime session revalidates against IkaDoc for REST and websocket paths.
- Forged signed assertion fails closed.
- Expired session fails closed.
- Home resource list routes do not reveal documents beyond the runtime document.
- Existing normal Grist auth behavior remains unchanged for non-IkaDoc requests.

## Fix Applied

### Runtime credential scope

- File: `app/server/lib/IkaDocRuntimeAuth.ts`
- Change:
  - `IkaDocRuntimeCredential.scope()` now returns a previewer-backed Grist `Scope`.
  - The scope includes a resource filter that allows only the admitted runtime `Document`.
  - `IkaDocRuntimeCredential.docAuth()` now fetches the Grist document metadata through previewer access, validates that the cached document is the admitted runtime document, then overlays IkaDoc's admitted access level (`viewer`/`editor`) without mutating the cached previewer document.
- Why:
  - Grist HomeDB routes use `getScope(req)`.
  - Without a credential scope, those routes fell back to native anonymous ACL.
  - The exact-document filter keeps previewer access from becoming broad access.

### HomeDB metadata path

- File: `app/gen-server/lib/homedb/HomeDBManager.ts`
- Change:
  - `getDoc(req)` now checks `req.authSession.credential` and calls `credential.docAuth(...)` before native ACL lookup.
  - Scope-object calls keep the existing native Grist behavior.
- Why:
  - `GET /api/docs/:did` and other metadata callers use `HomeDBManager.getDoc(req)`.
  - This was the live 403 source.

### Websocket document authorization

- File: `app/server/lib/DocAuthorizer.ts`
- Change:
  - `DocAuthorizerImpl.assertAccess(...)` now uses `authSession.credential.docAuth(...)` when the websocket client has a credential.
  - Native `getDocAuthCached(...)` remains the fallback for normal Grist sessions.
- Why:
  - Websocket `openDoc` and reconnect authorization previously bypassed credentials and used native Grist ACL.
  - This could fail independently even after REST metadata was fixed.

## Verification

- `yarn run build` in `~/WebStormProject/owarelin-grist`: passed.
- Focused runtime auth tests:
  - command: `docker run --rm -v /home/taka/WebStormProject/owarelin-grist:/work -w /work node:22-trixie ./test/test_env.sh ./node_modules/.bin/mocha --slow 8000 '_build/test/server/lib/IkaDocRuntimePolicy.js'`
  - result: `35 passing`.
- Docker image:
  - built `owarelin-grist:local`.
  - rebuilt Compose wrapper `ikadoc-grist-runtime:latest` using `GRIST_IMAGE=owarelin-grist:local`.
  - recreated `ikadoc-grist`.
  - verified running container image id matches `ikadoc-grist-runtime:latest`.
  - verified compiled runtime hooks inside container:
    - `IkaDocRuntimeAuth.js` contains previewer-backed runtime credential scope.
    - `HomeDBManager.js` calls `mreq.authSession.credential.docAuth(...)`.
    - `DocAuthorizer.js` calls `credential.docAuth(...)`.

## Remaining Caveat

- A browser-authenticated live open still needs a fresh IkaDoc editor session because recreating Grist clears the runtime session registry.
- Old editor tabs may fail until reopened from IkaDoc because their Grist in-memory runtime registration is gone.
- Direct container probes cannot fully simulate the browser request without the IkaDoc session cookie used by backend admission revalidation.

## Additional Audit: Previewer User Boundary

- Evidence:
  - `app/gen-server/lib/homedb/UsersManager.ts` exposes `getPreviewerUserId()` for the special previewer user and throws if that special user is unavailable.
  - `app/gen-server/lib/homedb/HomeDBManager.ts` uses the previewer user for raw document resolution and includes explicit previewer exceptions in ACL filtering paths.
- Impact:
  - The runtime credential can use previewer access as an internal Grist metadata resolution mechanism without exposing previewer authority to the browser.
  - This remains safe only because `IkaDocRuntimeCredential.docAuth()` validates the requested `urlId` against the admitted `documentId`/`documentUrlId` and validates the returned cached document before overlaying IkaDoc's admitted access.
- Required invariant:
  - Never return previewer authority directly to the browser. The previewer user is only a metadata lookup mechanism inside the fork; IkaDoc session admission and exact-document filtering remain the authority.
- Tests needed:
  - Keep the focused runtime credential test asserting admitted-document access, other-document denial, and no mutation of the previewer cached document.
- Severity: high if violated; currently mitigated by exact-document filtering and tests.

## Latest Container Verification

- `ikadoc-grist` is running `ikadoc-grist-runtime:latest` and is healthy.
- The running image id matches the rebuilt wrapper image id.
- The compiled container code contains:
  - `HomeDBManager.js` calling `mreq.authSession.credential.docAuth(...)` before native metadata ACL.
  - `DocAuthorizer.js` calling `credential.docAuth(...)` for websocket authorization.
  - `IkaDocRuntimeAuth.js` using `_previewerUserId` in both `scope()` and `docAuth()`.
- No fresh Grist/IkaDoc auth failure logs were present in the last 30 minutes at the time of this audit, so the next live failure must be correlated against new logs rather than old browser console output.

## Additional Audit: Grist Native Session Access During IkaDoc Runtime Boot

- Live symptom:
  - Browser console reported `getSessionActive() failed: TypeError: can't access property "_next", n is null` while Grist websocket connection was racing open/disconnect and Engine.IO polling fallback reported `xhr poll error`.
  - IkaDoc backend logs for the same window showed document-file session creation/import, editor admission, and repeated forward-auth `204` responses. That ruled out IkaDoc admission denial as the first failure.
- Evidence in fork source:
  - `app/client/models/AppModel.ts` always calls `api.getSessionActive()` and `api.getSessionAll()` during Grist boot.
  - `app/gen-server/ApiServer.ts` native `/api/session/access/active` and `/api/session/access/all` handlers depend on normal Grist org/session state.
  - Before this fix, the IkaDoc runtime profile shortcut was wired only for `/api/profile/user`, not the session-access endpoints.
- Impact:
  - The editor could have a valid admitted IkaDoc runtime document while Grist boot still failed inside native account/org session initialization.
  - This is not an authority decision IkaDoc should delegate to Grist native org state.
- Required fix applied:
  - Added `createIkaDocRuntimeSessionAccessHandler(...)` in `app/server/lib/IkaDocRuntimeAuth.ts`.
  - Wired it before native Grist session handlers for `/api/session/access/active` and `/api/session/access/all` in `app/server/lib/FlexServer.ts`.
  - The handler responds only when an IkaDoc runtime cookie or signed forward-auth assertion is present. Non-IkaDoc Grist requests fall through unchanged.
  - The handler returns the admitted IkaDoc runtime user and a minimal runtime organization for Grist boot models only; it does not make Grist orgs/workspaces authoritative.
- Tests added:
  - active session details from an admitted IkaDoc runtime session,
  - session user/org list from an admitted IkaDoc runtime session,
  - fall-through for native Grist requests without an IkaDoc runtime session.
- Verification:
  - `yarn run build`: passed.
  - Focused runtime policy tests: `38 passing`.
  - Built `owarelin-grist:local`.
  - Rebuilt `ikadoc-grist-runtime:latest` from the new fork image.
  - Recreated `ikadoc-grist` and verified the running image id matches `ikadoc-grist-runtime:latest`.
  - Verified live compiled container code contains `createIkaDocRuntimeSessionAccessHandler` and the `/api/session/access/active`, `/api/session/access/all` route wiring.
- Remaining caveat:
  - Recreating Grist clears the in-memory runtime registry. Live retest must start from a fresh IkaDoc `Edit with Grist` action, not an old editor tab.

## Additional Audit: Missing Untrusted Content Origin

- Live symptom:
  - The editor reached websocket `openDoc OK` and returned the IkaDoc runtime user, then immediately shut down the document with `Missing untrustedContentOrigin configuration`.
  - This proved the auth/document-open path was working and the next failure was client boot configuration.
- Evidence in fork source:
  - `app/client/components/GristDoc.ts` creates `DocPluginManager` with `app.topAppModel.getUntrustedContentOrigin()`.
  - `app/client/models/AppModel.ts` throws `Missing untrustedContentOrigin configuration` when `window.gristConfig.pluginUrl` is absent.
  - `app/server/lib/IkaDocEditorEndpoint.ts` explicitly set `pluginUrl: undefined` for IkaDoc runtime pages, overriding Grist's normal `sendAppPage` fallback.
- Impact:
  - Valid IkaDoc editor sessions opened the document and then failed during document UI construction.
  - Using the main editor origin as a shortcut would weaken Grist's plugin/custom-widget isolation boundary.
- Required fix applied:
  - `app/server/lib/IkaDocEditorEndpoint.ts` now provides the same fallback shape as Grist's normal app page config: `process.env.APP_UNTRUSTED_URL || "http://plugins.invalid"`.
  - The local IkaDoc Grist stack sets `APP_UNTRUSTED_URL` to `https://grist-untrusted.owarelin.localhost`.
  - Traefik routes `grist-untrusted.owarelin.localhost` to Grist as a separate browser origin.
  - `tools/generate-dev-certs.sh` now includes `grist-untrusted.owarelin.localhost` in the mkcert certificate.
- Tests added/updated:
  - `test/server/lib/IkaDocAppEndpoint.ts` now asserts IkaDoc runtime pages include a non-null `pluginUrl` fallback.

## Additional Audit: Local Node 26 Server-Test Runner

- Symptom:
  - Focused fork server tests failed before executing IkaDoc suites under local Node `v26.0.0`.
  - The failure came from `jsonwebtoken -> jwa -> buffer-equal-constant-time`, where the dependency expected `require("buffer").SlowBuffer`.
- Impact:
  - IkaDoc endpoint, admission, runtime-auth, websocket, and capability-policy tests compiled but could not be executed through `yarn test:server` in the local runtime.
  - That weakened non-live verification even though the code built.
- Required fix applied:
  - Added `test/node_compat.js`, a test-only preload that provides `buffer.SlowBuffer = buffer.Buffer` when Node does not expose `SlowBuffer`.
  - `test/test_env.sh` preloads that shim through `NODE_OPTIONS`.
  - Production runtime code and Docker/runtime images are unchanged.
- Verification:
  - `GREP_TESTS="IkaDoc" yarn test:server`: `63 passing`.
- Remaining caveat:
  - Upstream Grist still warns that Node 26 is unsupported by `oidc-provider`; Node 22 LTS remains the expected runtime for production and full upstream test parity.

## Additional Audit: Runtime Session Registry Hygiene

- Issue:
  - The fork runtime session registry kept expired IkaDoc runtime sessions in memory until process restart or replacement.
- Evidence:
  - `app/server/lib/IkaDocRuntimeSessionRegistry.ts` indexed sessions by Grist document id, Grist URL id, and IkaDoc session id, but lookups did not prune expired entries.
- Impact:
  - Stale editor cookies or old tabs could keep resolving to dead runtime state longer than necessary inside the Grist process.
  - Authorization still checked expiry elsewhere, but stale state increased debugging noise and memory growth risk.
- Required fix applied:
  - Registry lookups now prune expired sessions before returning them.
  - The registry exposes explicit `unregister(sessionId)` and `pruneExpired(nowMs)` operations.
  - Invalid `expiresAt` values fail closed by being treated as already expired.
- Tests added:
  - Expired runtime sessions are pruned during lookup.
  - Bulk pruning removes expired sessions without removing active sessions.
- Verification:
  - `GREP_TESTS="IkaDoc runtime policy" yarn test:server`: `45 passing`.
- Verification:
  - `yarn run build`: passed.
  - Focused runtime/editor endpoint tests: `49 passing`.
  - Regenerated local mkcert certificate and verified SAN includes `grist-untrusted.owarelin.localhost`.
  - Built `owarelin-grist:local`.
  - Rebuilt `ikadoc-grist-runtime:latest`.
  - Recreated `ikadoc-grist` and `ikadoc-traefik`.
  - Verified running Grist image id matches `ikadoc-grist-runtime:latest`.
  - Verified `APP_UNTRUSTED_URL=https://grist-untrusted.owarelin.localhost` inside `ikadoc-grist`.
  - Verified `https://grist-untrusted.owarelin.localhost/v/unknown/main.bundle.js` returns `200 application/javascript` through Traefik.
- Remaining caveat:
  - Recreating Grist clears the in-memory runtime registry. Live retest must start from a fresh IkaDoc edit action.
