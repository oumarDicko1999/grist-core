# Owarelin Integration Guide

This fork embeds Grist as an Owarelin/IkaDoc spreadsheet editor and viewer. Grist
still provides the spreadsheet runtime, but Owarelin/IkaDoc remains the authority
for users, tenants, records, vault files, search results, document lifecycle,
permissions, audit, and deployment policy.

Use this document as the starting point for Owarelin-related work in the fork.

## Source Documents

- `AGENTS.md`: mandatory fork standards, cleanup criteria, audit protocol, and
  verification gates.
- `documentation/ikadoc-integration-seams.md`: ledger of every upstream Grist
  file patched for Owarelin/IkaDoc behavior.
- `documentation/ikadoc-fork-sync.md`: rebase and sync rules for keeping fork
  changes recognizable.
- `documentation/ikadoc-runtime-auth-audit-2026-07-12.md`: detailed runtime auth,
  HomeDB, websocket, and live-debugging audit history.

When adding or changing Owarelin behavior, update the relevant source document
in the same change. Do not rely on commit messages as the only explanation.

## Branch Evolution

Owarelin work is maintained on release branches, not on upstream tags.

- Upstream tags such as `v1.7.16` are immutable source references.
- The active fork line for that release is `release/ikadoc-v1.7.16`.
- Owarelin commits sit on top of the release branch.
- Future upgrades create a new branch from the new upstream tag, such as
  `release/ikadoc-v1.7.17`, then replay or rebase the Owarelin patch stack.

Do not commit directly on upstream release tags. Do not use `main` as the stable
Owarelin release line unless the project explicitly changes the branch strategy.

## Ownership Model

Owarelin-owned behavior should live in:

- `app/ikadoc/**`
- `app/server/lib/IkaDoc*.ts`
- `app/client/ui/IkaDoc*.ts`
- `test/**/IkaDoc*.ts`
- `test/**/Owarelin*.ts`
- `documentation/ikadoc-*.md`
- `documentation/owarelin-*.md`

Upstream Grist files are patched only as thin seams into owned code. Any patched
upstream file must:

- contain a searchable `IkaDoc`, `ikadoc`, `Owarelin`, or `owarelin` anchor,
- appear in `documentation/ikadoc-integration-seams.md`,
- have regression coverage listed in that ledger,
- avoid unrelated formatting churn.

## Runtime Authority

Owarelin/IkaDoc is the source of truth. Grist must not become authoritative for:

- tenant identity or tenant isolation,
- browser session validity,
- document ownership,
- record permissions,
- vault persistence,
- checkout/check-in lifecycle,
- module or license availability,
- audit decisions.

Grist runtime access is admitted by IkaDoc and constrained to the exact runtime
session and Grist document id/url id that IkaDoc created. Native Grist orgs,
workspaces, anonymous users, sharing state, API keys, and browser-supplied
headers must not expand access.

## Request Flow

Editor entry:

1. IkaDoc creates or resolves the Grist runtime document.
2. The browser opens `/grist/editor/:sessionId`.
3. `IkaDocEditorEndpoint` calls IkaDoc admission.
4. A valid admission registers an `IkaDocRuntimeSession`, sets the runtime
   gateway cookie, and serves Grist with `gristConfig.ikadoc`.
5. Grist REST and websocket paths resolve the runtime identity through the same
   session/admission model.

Direct document REST and websocket requests:

1. Traefik/IkaDoc forward-auth validates the browser session, Grist gateway
   session, tenant scope, source document, and requested path.
2. IkaDoc returns signed assertion headers.
3. Grist verifies the signature, timestamp, and path.
4. Grist converts the request into an IkaDoc runtime credential.
5. Document auth grants only the admitted document.

Failures are authorization failures. Missing, expired, malformed, rejected, or
unreachable IkaDoc admission must fail closed.

## Capability Gates

Sensitive Grist surfaces are denied by default in Owarelin runtime mode. A
capability may open a surface only when IkaDoc explicitly grants it.

High-risk surfaces include:

- export and download,
- attachments,
- fork, copy, share, publish, access management,
- plugin and custom widget execution,
- assistant/proposal features,
- triggers, webhooks, and external egress,
- formula and Python execution surfaces,
- structure edits,
- admin/account/workspace/org features.

Client-side hiding is only UX. Server, REST, websocket, and user-action policy
gates are the security boundary.

## Document Lifecycle

Owarelin owns document lifecycle. Grist is an editor/viewer runtime.

- IkaDoc creates sessions and runtime documents.
- Grist opens only admitted sessions.
- Save/discard must call IkaDoc-owned endpoints.
- No-op saves must not imply a new vault version.
- Session expiry, cleanup, and check-out state must close or block the Grist
  runtime path.
- Recreating the Grist process clears the in-memory runtime registry; live
  testing must start from a fresh IkaDoc edit/view action after container
  recreation.

## Theme And I18n

Grist runtime UI must visually fit the IkaDoc tenant UI.

- `IkaDocThemeBridge` owns Owarelin/Angular Material token bridging.
- Runtime config carries language, theme, and appearance state.
- Supported visual styles are Material and Owarelin.
- Copy must be translatable through locale files.
- Dark mode and visual-style switching must be driven by runtime theme state,
  not hard-coded colors.

CSS overrides are not a security mechanism. They only improve editor fit.

## Custom Events

Browser-to-host integration uses versioned `owarelin:*` events. Do not add
legacy unversioned `ikadoc:grist:*` events.

Event contracts belong in `app/ikadoc/OwarelinRuntimeEvents.ts`. Handlers should
stay in owned bridge/control code unless a stable upstream seam is required.
When adding a new command:

1. Define the typed event contract.
2. Add tests for parsing, session matching, and rejected malformed events.
3. Document the seam or owned handler.
4. Keep security-sensitive actions backed by backend policy, not only events.

## Search Integration

Search-to-Grist is an Owarelin records workflow, not a native Grist import
workflow.

- IkaDoc UI owns the query builder and selected result range.
- Selected columns come from the IkaDoc search result column visibility state.
- Range semantics must be explicit: current page, page range, or all matching
  results.
- Backend endpoints prepare the temporary Grist processing workspace.
- After processing, the user may download the `.grist` file or save it back to
  IkaDoc through backend-owned flows.

Bulk update/apply is a separate feature and must not be mixed into
search-to-Grist unless the spec explicitly changes.

## Logging And Audit

Owarelin runtime actions need structured logs and audit paths that help incident
response without leaking secrets or document content.

Important operations:

- admission accepted or denied,
- runtime session open,
- REST/websocket auth revalidation,
- save, discard, expire, cleanup,
- blocked capability,
- policy-denied user action,
- backend validation failure.

Logs should include stable context when available: session id, Grist document id,
Grist URL id, actor id, tenant/collection scope, operation, and denial reason.
Browser-visible messages must remain product-safe.

## Verification

Use the narrowest gate that covers the change, then broaden when a change crosses
runtime boundaries.

Common gates:

```bash
yarn run build
GREP_TESTS=IkaDoc yarn test
```

For auth, websocket, forward-auth, capability gates, document actions, and
runtime session lifecycle changes, focused tests are mandatory unless the
remaining validation truly requires live Traefik/browser/runtime access.

Before upstream sync, run the seam-anchor audit from
`documentation/ikadoc-fork-sync.md` and reconcile
`documentation/ikadoc-integration-seams.md`.
