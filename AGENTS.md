# AGENTS.md

## Project Overview

This repository is the Owarelin/IkaDoc fork of Grist Core. Grist remains a
spreadsheet engine and document runtime, but IkaDoc-owned behavior turns it into
a controlled editor/viewer extension for IkaDoc records, vault files, search
results, and future spreadsheet workflows.

The fork target is upstream Grist `v1.7.16` on the `release/ikadoc-v1.7.16`
branch. Keep IkaDoc changes isolated, findable, testable, and easy to rebase.

Upstream tags are immutable source references. Do not commit directly on a tag.
Owarelin work belongs on `release/ikadoc-vX.Y.Z` branches, with one maintained
release branch per upstream Grist release. Future upstream upgrades create a new
release branch from the new upstream tag and replay or rebase the Owarelin patch
stack.

## Mandatory Compliance

This file is the project standard for this fork. It is not advisory.

- Every rule in this file is an acceptance criterion for work in this fork.
- Do not trade these rules off against speed, convenience, lint suppression, or
  local preference.
- If a user request appears to conflict with this file, stop and resolve the
  conflict explicitly before editing.
- If existing code violates this file, do not expand the violation. Touching
  violating code requires either a scoped move toward the standard or an
  explicit caveat when the requested change cannot safely include that refactor.
- Passing build, lint, or tests is not enough when the code shape violates this
  standard.
- User changes in the worktree are off-limits unless explicitly requested. Do
  not clean up, reformat, revert, or fix unrelated dirty files.

## Required Reading

Before non-trivial IkaDoc/Owarelin work in this fork, read:

- `documentation/ikadoc-integration-seams.md`
- `documentation/ikadoc-fork-sync.md`
- `documentation/ikadoc-runtime-auth-audit-2026-07-12.md`
- `documentation/owarelin-integration.md`

For frontend visual, theme, or shell integration, also read the IkaDoc frontend
standards:

- `/home/taka/WebStormProject/ikadoc-ng/AGENTS.md`
- `/home/taka/WebStormProject/ikadoc-ng/doc/architecture/README.md`
- `/home/taka/WebStormProject/ikadoc-ng/doc/codex/memory/project_design_tokens.md`
- `/home/taka/WebStormProject/ikadoc-ng/doc/codex/GOOGLE_UX_GUIDELINES.md`

Treat `/home/taka/projects/boilerplate-test/docs/architecture-findings.md` and
`/home/taka/projects/boilerplate-test/docs/swappable-pieces.md` as background
references for explicit module seams, wiring discipline, and swappable
adapters. Adapt the ideas to Grist; do not copy React-specific implementation
shapes.

## Fork Ownership

IkaDoc-owned code should live in one of these locations whenever possible:

- `app/ikadoc/**`
- `app/server/lib/IkaDoc*.ts`
- `app/client/ui/IkaDoc*.ts`
- `test/**/IkaDoc*.ts`
- `documentation/ikadoc-*.md`
- `documentation/owarelin-*.md`

These files may be formatted and refactored normally because they are owned by
the fork.

Upstream Grist files may be patched only at stable seams needed to enter IkaDoc
mode, inject runtime config, gate capabilities, route websocket/API traffic, or
replace upstream product surfaces. Keep upstream seam patches small and
findable. Do not reformat unrelated upstream code.

Every patched upstream file must be listed in
`documentation/ikadoc-integration-seams.md` with:

- the exact seam being patched,
- why the seam exists,
- the regression test that protects it,
- whether live validation is still required.

Every upstream seam patch must include a findable IkaDoc/Owarelin anchor: an
import, identifier, or short comment containing `IkaDoc`, `ikadoc`, `Owarelin`,
or `owarelin`.

## IkaDoc Runtime Authority

IkaDoc is the source of truth for auth, tenant isolation, record permissions,
vault ownership, document lifecycle, checkout/check-in, audit, and module or
license availability. Grist must not become the owner of IkaDoc data.

Security invariants:

- Do not use Grist orgs, workspaces, accounts, anonymous users, API keys, or
  browser-supplied headers as authority for IkaDoc runtime documents.
- Runtime REST, websocket, profile, and editor entrypoint requests must resolve
  through the same IkaDoc session/admission model.
- Backend admission failures are authorization failures, not anonymous
  fallbacks.
- Tenant isolation is mandatory. A valid URL must never let one tenant access
  another tenant's document or session.
- Capability checks must fail closed for export, download, attachments,
  structure edits, formulas, Python/network execution, access management,
  sharing, publishing, external egress, assistant, proposal, fork, copy, admin,
  plugin, trigger, and webhook surfaces unless IkaDoc explicitly grants them.
- Direct public Grist exposure is out of contract. Production exposure must sit
  behind IkaDoc-controlled auth/proxy/session checks.
- CSS, hidden buttons, disabled menu items, or client-side checks are not
  security boundaries. Server and websocket gates must enforce every sensitive
  decision.

## Architecture Rules

- Keep product logic in `app/ikadoc/**` or `IkaDoc*.ts` owned files where
  possible.
- Use upstream patches only as thin entrypoints into IkaDoc-owned code.
- Keep cross-runtime reactions discoverable. Browser-to-host editor messages use
  the versioned `owarelin:*` event bridge only.
- Do not scatter new IkaDoc reactions across unrelated Grist files. If a new
  cross-runtime command is needed, define the event contract in
  `app/ikadoc/OwarelinRuntimeEvents.ts`, handle it in an owned bridge/control
  surface, and document it.
- Keep route and websocket path spaces explicit. IkaDoc editor routes must not
  collide with native Grist, IkaDoc tenant UI, or backend API routes.
- Do not introduce broad generic helpers, junk-drawer folders, or convenience
  abstractions when a narrow owned module or existing upstream API fits.
- Do not add global mutable state for runtime sessions unless the lifecycle,
  cleanup, expiry, and tenant scope are explicit and tested.
- Do not add fake, noop, in-memory, or unconfigured defaults to
  production-capable flows. Test fakes must be explicit in tests.

## TypeScript And Code Quality

- Prefer explicit, typed contracts over raw strings, raw maps, or unstructured
  `any`.
- Use discriminated unions for exhaustive runtime states, command kinds,
  capability decisions, and error categories.
- Do not return `null` or `undefined` to mean failure, missing required data,
  unsupported state, invalid input, or lookup failure. Model the state or throw
  an upstream-compatible typed error at the boundary.
- Nullable values are allowed only when absence has a clear product or protocol
  meaning. Normalize boundary nullable values before deeper runtime flow.
- Do not use non-null assertions (`!`) in new IkaDoc-owned code. If a value is
  required, validate it once at the boundary and fail with a typed error.
- Do not swallow errors. Convert external failures into typed, product-safe
  errors with enough context for logs and tests.
- Do not expose raw upstream response bodies, secrets, cookies, tokens, vault
  bytes, document contents, or personal data in browser-visible errors.
- Use explicit imports. Do not introduce wildcard-style namespace dumping for
  new IkaDoc code unless the upstream API requires it.
- Keep one clear responsibility per file. Do not pile unrelated DTOs, runtime
  services, adapters, stores, and UI controls into one file.
- File-level constants belong near the top of the file after imports. Do not
  hide meaningful magic strings or numbers inside business logic.
- Helper functions must name a real domain, protocol, validation, authorization,
  or boundary decision. Do not extract tiny helpers just to shorten a method,
  silence lint, or hide obvious local flow.
- Prefer readable top-to-bottom flow with guard exits for failure paths over
  deeply nested branches.

## UI, Theme, And I18n

Grist is visually embedded as an IkaDoc editor/runtime extension.

- IkaDoc runtime UI should follow IkaDoc frontend visual standards: Material
  Design 3 semantics, Angular Material token language, compact flat workspace
  patterns, clear hierarchy, and direct product copy.
- Theme bridge code must consume runtime theme state and CSS variables; it must
  not hard-code a one-off palette that cannot react to IkaDoc visual style or
  dark mode.
- Styling must support both IkaDoc visual modes that the tenant UI exposes:
  Material and Owarelin. If only one mode is implemented, document the missing
  mode and risk.
- Prefer semantic CSS custom properties and owned IkaDoc theme bridge code over
  scattered per-component color overrides.
- Do not render raw HTML or parse arbitrary text into HTML. Use safe DOM
  builders/templates and upstream sanitization where content is user-controlled.
- IkaDoc runtime copy must be translatable. Add keys to the relevant locale
  files and ensure language changes propagate from IkaDoc into the editor.
- Do not rely on hiding upstream UI surfaces as permission enforcement. Hidden
  surfaces must be backed by server/websocket policy gates.
- Avoid duplicate save/discard controls. If both Grist and IkaDoc controls are
  present, document which one is authoritative and remove or gate the redundant
  surface.

## Search And Record Integration

- Search-to-Grist flows must use IkaDoc query builder/search contracts and
  backend endpoints. Do not recreate the records query builder inside Grist.
- Selected columns come from the IkaDoc search result column visibility state,
  not from Grist defaults.
- Search result range semantics must be explicit: current page, page range, or
  all matching pages. Do not silently process a different range.
- Temporary search workspaces are IkaDoc-owned processing artifacts. Users may
  download the processed `.grist` file or save it back to IkaDoc only through
  backend-owned flows.
- Future bulk update/apply is a separate feature. Do not mix it with
  search-to-Grist processing unless the spec explicitly authorizes it.

## Observability And Auditability

- Every privileged IkaDoc runtime action needs enough structured logging to
  support incident response without leaking document data or secrets.
- Open, save, discard, expire, cleanup, blocked action, admission denial,
  backend validation failure, websocket denial, and policy-denied upstream
  method paths must be auditable through IkaDoc-owned flows.
- Logs must include stable correlation context where available: session id,
  document id, actor id, tenant/collection scope, operation, and policy reason.
- Browser-visible messages must be product-safe; server logs may carry more
  technical detail but still must not leak secrets or document content.

## Testing And Verification

Use the narrowest verification gate that covers the touched code, then broaden
when a change crosses runtime boundaries.

Common gates:

```bash
yarn run build
yarn run lint
yarn run test:common
yarn run test:server
yarn run test:gen-server
GREP_TESTS=IkaDoc yarn test
```

For UI/runtime changes, add or update focused tests when possible and document
what still requires live browser validation. For auth, ACL, websocket,
forward-auth, export/download, sharing, plugin, external egress, and user-action
policy changes, tests are mandatory unless the remaining validation truly
requires a live proxy/browser environment.

Before syncing upstream, run the fork hygiene audit from
`documentation/ikadoc-fork-sync.md`.

## Audit And Issue-Finding Protocol

Audits are not limited to style. Search for bugs, caveats, security flaws,
tenant isolation risks, lifecycle mismatches, product gaps, and operational
problems.

Use this loop:

1. Map the relevant architecture, routes, services, stores, adapters,
   configuration, tests, docs, UI contracts, and API contracts.
2. Inspect each issue category one by one.
3. Re-check findings against nearby code and docs to remove false positives and
   add evidence.
4. Continue while new issue categories are still being found.
5. Stop only when a full pass finds no new issue category, or when remaining
   work requires runtime access, credentials, external systems, or a user
   decision.

Finding format:

- Issue: concise description of the problem.
- Evidence: file, route, config, test, or behavior that proves or strongly
  suggests the issue.
- Impact: what can break, leak, be lost, mislead operators, or hurt
  maintainability.
- Required fix: the smallest credible remediation or design decision.
- Tests needed: behavior, failure, permission, persistence, or contract tests
  that should catch regressions.
- Severity: blocker, high, medium, or low.

Issue categories:

- correctness bugs
- data loss and durability
- security
- tenant isolation
- concurrency and race conditions
- operational stability
- false positives
- API and contract drift
- observability and auditability
- performance and scale
- upgrade and migration
- testing gaps
- maintainability risks
- product and SaaS semantics

Do not hide caveats because they are out of current implementation scope. If an
issue is intentionally deferred, document it with reason, risk, and the
condition that should trigger revisiting it.
