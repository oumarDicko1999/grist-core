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

Native Grist documents remain native unless a table or column carries an explicit IkaDoc schema binding. Schema-bound tables may use IkaDoc reference, value-list, administrative-unit, enum, and validation editors, but those editors must never change the semantics of unbound Grist `Choice`, `ChoiceList`, `Ref`, or `RefList` columns.

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
- formula and Python execution surfaces, including sandbox effectiveness,
- structure edits,
- admin/account/workspace/org features.

Client-side hiding is only UX. Server, REST, websocket, and user-action policy
gates are the security boundary.


## Formula Sandbox

Grist formulas are Python code evaluated by the document data engine. Existing
formulas can run when a document opens or recalculates, so sandboxing is required
for formula-bearing managed sessions even when formula editing UI is hidden.

Owarelin/IkaDoc runtime mode requires an effective sandbox:

- `GRIST_SANDBOX_FLAVOR=unsandboxed` and `GRIST_SANDBOX_FLAVOR=skip` are not
  acceptable for managed sessions;
- Linux/container production should prefer `gvisor`/`runsc` when the runtime
  probe proves it functional;
- `pyodide` may be used for local development, tests, or explicitly accepted
  deployments when the probe reports it functional and effective;
- request/network formula features, webhook domains, and trusted plugins remain
  disabled unless a separate threat model and allowlist approve them;
- sandbox failures and Python errors shown to users must be product-safe and must
  not expose server paths, environment variables, secrets, upstream stderr, or
  document content.

Formula capability controls whether users may create or edit formula definitions.
It is not a substitute for sandboxing, because existing formulas may still
execute inside native `.grist`, search, report, and schema-bound workspaces.

## Document Lifecycle

Owarelin owns document lifecycle. Grist is an editor/viewer runtime.

- IkaDoc creates sessions and runtime documents.
- Grist opens only admitted sessions.
- Save/discard must call IkaDoc-owned endpoints.
- No-op saves must not imply a new vault version.
- Saved `.grist` workspaces must persist through IkaDoc vault/content versioning;
  Grist runtime storage and cache are not durable product persistence.
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
- Material mode follows the tenant UI Nexus/M3 baseline: primary `#27496c`,
  tertiary `#693c00`, Inter body text, Manrope headings, M3 state layers,
  and table/menu/list geometry that matches the Angular Material shell.
- Runtime font assets live under `static/fonts/ikadoc/` and are loaded only by
  `IkaDocThemeBridge`. Keep bundled font files, their upstream family names, and
  license provenance together when refreshing Inter, Manrope, Fraunces, or
  Material Symbols assets.
- CSS bridge changes may tune tokens, row rhythm, surfaces, borders, radius, and
  state layers. They must not be treated as sufficient for icon systems, menu
  DOM structure, toolbar composition, picker behavior, or security gates. Those
  require explicit fork seams with tests and entries in the seam ledger.

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
- Column ids are stable IkaDoc metadata/identity ids; display labels are resolved
  by IkaDoc backend from the authenticated user language, tenant default
  language, schema variant overrides, and metadata labels. Grist and frontend
  label hints are not authoritative.
- Identity columns use reserved ids such as `ikadoc_record_id`,
  `ikadoc_schema_type`, and `ikadoc_schema_code`, while displaying compact
  labels such as `ID`, `Schema type`, and `Schema` or `Schema code`.
- Range semantics must be explicit: current page, page range, or all matching
  results.
- Backend endpoints prepare the temporary Grist processing workspace.
- After processing, the user may download the `.grist` file or save it back to
  IkaDoc through backend-owned flows.

Bulk update/apply is a separate feature and must not be mixed into
search-to-Grist unless the spec explicitly changes.

## Guided Metadata Integration

Guided Grist workspaces are the path for future IkaDoc import and bulk-write workflows. The `.grist` file remains a normal Grist file; the special part is the Owarelin/IkaDoc use case attached to it. A table becomes guided only through an explicit IkaDoc action that chooses the workflow, schema type, and optional schema variant. The fork then shows the right labels, editors, and controls for non-technical users until they click the final Owarelin/IkaDoc export/apply action.

Guided documents must carry an explicit workflow intent. The fork must be able to distinguish regular native Grist files from IkaDoc record-creation workspaces, record-import workspaces, bulk edit proposals, bulk write proposals, search-processing workspaces, report-analysis workspaces, and document-file editor sessions. This is just the use case behind the file, and it must survive saving a partially completed `.grist` file so the user can return later through IkaDoc without losing the right tools.

Intent values must be mutually exclusive and backend-issued. `record-creation` means rows are candidate new records. `record-import` means rows are an import/upsert data set handled by IkaDoc migration import. `bulk-edit-proposal` means rows target existing records only. `bulk-write-proposal` means a broader backend-defined write package. No intent may imply delete, archive, workflow transition, content upload, or schema mutation unless a future product flow explicitly adds that action and permission.

The fork must not infer workflow intent from table names, labels, hidden columns, previous browser state, or native Grist ACL/workspace metadata. IkaDoc stores a small use-case marker with or linked to the IkaDoc vault/content version: intent, target collection, schema type, optional schema code or variant, and allowed final action. IkaDoc UI uses that marker to distinguish normal `.grist` files from guided files in document lists, previews, and action menus. Reopening a saved guided file must re-check that marker before enabling import, bulk edit, bulk write, validation, picker, or export/apply controls. Missing or stale markers fail closed or open as normal/read-only Grist with product-safe guidance. New saved versions carry the current marker; rollback opens with the marker attached to that version; copying a guided `.grist` file must either intentionally copy the marker or create a normal unmarked `.grist` file.

Required behavior:

- native Grist columns keep native Grist widgets;
- bound enum columns store stable enum codes and display localized labels;
- bound value-list columns store canonical entry ids or stable entry codes and display localized labels;
- bound administrative-unit and record-reference columns store canonical IkaDoc record ids or map native Grist lookup row ids to immutable `ikadoc_id` values;
- bound reference-list columns preserve a canonical id list according to the backend contract;
- bound opaque JSON fields are read-only by default and require explicit advanced permission plus backend validation before raw JSON editing is allowed;
- bound structured JSON fields use an IkaDoc descriptor carrying payload class, editor kind, nested members when available, required/default semantics, and whether the JSON object is edited as columns, a modal form, or raw text;
- bound special-domain JSON fields, such as retention rule delay, use IkaDoc-owned domain editors rather than generic JSON cells. Retention schedule descriptors should expose medium types, active/semi-active steps, time unit, trigger field, event options, combined-step logic, disposition step, and sort mapping when supported. A compact retention syntax may be shown in cells, but IkaDoc owns parsing, validation, serialization, and the canonical JSON shape;
- copied, derived, content, and unsupported metadata remain read-only or blocked until the backend contract says otherwise;
- bound column headers show both the localized metadata label and stable metadata code. Labels are semantic display text only; codes remain the mapping and apply authority;
- all picker/autocomplete requests go through IkaDoc backend session validation and return only values allowed for the current actor, tenant, collection, schema, metadata field, and row context;
- users do not type authoritative row ids, record ids, or import strategy switches. IkaDoc generates or resolves those values through add-row, normalization, or the final apply action;
- import rows may carry legacy ids only when IkaDoc selects an `oldSystem` migration/re-import strategy. Normal record creation and bulk-write candidate rows use backend-generated identity. Bulk-edit rows must carry immutable target record id and expected record version from IkaDoc selection state. Apply decides create, update, no-op, or conflict from backend lineage and current database state, not from user-edited id cells, and retries must not create duplicate records;
- bulk-write rows must declare their allowed operation family;
- formula-backed bound cells contribute only their evaluated value in the apply snapshot. Formula expressions remain Grist workspace behavior and are not imported or persisted as IkaDoc record metadata authority.

Same-value fill across selected rows must be represented as one logical bulk proposal or bulk action, not many unrelated single-row edits. IkaDoc validates every target row/cell before apply and reports partial failures with audit-safe detail.

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
