# Owarelin Integration Guide

This fork embeds Grist as an Owarelin spreadsheet editor and viewer. Grist
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
- The active fork line for that release is `owarelin/integration-v1.7.16`
  (pushed to `origin`); `release/ikadoc-v1.7.16` only marks the upstream tag.
- Owarelin commits sit on top of the active fork line; topic work branches from
  it as `owarelin/<topic>` and merges back.
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

Each admission registers one browser of one person
(`IkaDocRuntimeSessionRegistry`). A person may have several tabs and devices in a
session: entering again never disconnects them. Their entries take the newest
config at once (capabilities may have changed), the browser's own entry (its
participant cookie) is reused, entries for a document the session has left are
dropped, and at most 8 entries per person are kept. `smoke.mjs` checks that a
second tab leaves the first one working.

An IkaDoc deployment runs the fork as an IkaDoc-only runtime (GW-SEC-01): when
IkaDoc admission is configured (`IKADOC_EDITOR_ADMISSION_URL`), browser requests
without an IkaDoc session or signed forward-auth assertion are refused, except
the `/grist/editor/:sessionId` entry, which runs admission itself, and API-key
calls from the IkaDoc service account. The backend's initial `GET`/`POST`
`/api/profile/apikey` requests may reach native boot-key authentication without
an editor session so that the service key can be retrieved or created. An
invalid boot key still fails native authentication; boot keys do not admit
other routes or API-key deletion through the IkaDoc-only gate.
`IKADOC_GRIST_RUNTIME_ONLY=false` turns
this off for the development harness only (`devtools/ikadoc-runtime-harness`).

Native Grist documents remain native unless a table or column carries an explicit IkaDoc schema binding. Schema-bound tables may use IkaDoc reference, value-list, administrative-unit, enum, and validation editors, but those editors must never change the semantics of unbound Grist `Choice`, `ChoiceList`, `Ref`, or `RefList` columns.

The fork compatibility rule is stricter than the UX requirement: do not modify Grist built-in type behavior globally. Guided columns may be created with a backend-selected native Grist type, and the column may carry IkaDoc widget/editor options, but `Text`, `Int`, `Numeric`, `Bool`, `Date`, `DateTime`, `Choice`, `ChoiceList`, `Ref`, and `RefList` must keep upstream-compatible behavior for normal Grist files and unbound columns. Autocomplete, reference picking, value-list picking, administrative-unit picking, structured JSON editing, and retention-specific editing belong in IkaDoc-bound editors/renderers that activate only when column options contain a valid guided metadata binding.

Do not add new Grist storage types for IkaDoc metadata. A `.grist` file persists
column `type` and JSON `widgetOptions` in its own metadata tables, but it does
not persist the fork's TypeScript widget implementation. Custom IkaDoc widgets
are therefore a runtime capability of the fork version that opens the file. The
stored cell value must remain canonical and backend-valid even if the widget is
missing, disabled, or upgraded and the file falls back to a native display.

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

Protected websocket mutations perform an additional server-to-server validation
callback before Grist executes the document action. The fork sends the admitted
session id in `X-IkaDoc-Grist-Session` and sends the per-session
`validationToken` from runtime config as bearer auth. The admission bearer
configured for the fork is not callback authority. IkaDoc uses its durable
session-routing index to resolve tenant/deployment in shared-runtime mode and
then re-checks the tenant session, document ids, status, expiry, and capability
policy.

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

IkaDoc-owned columns (`lockedColumns` in the runtime config, per table) are
read-only for users: the policy refuses value writes, renames and removals that
touch them, and the grid marks them with a lock (GW-RFR-03).

IkaDoc's service account fills, extends and refreshes a document's source data
with its API key and the document's service token in `X-IkaDoc-Service-Token`
(GW-SRC-06). Both sides derive that token as HMAC-SHA256 of
`grist-document-service:<documentId>` with the admission bearer secret
(`IKADOC_EDITOR_ADMISSION_BEARER_TOKEN`), so it is never stored nor sent to a
browser, and the fork checks it without any session being registered in its
process, including the first fill of a new document and after a restart; without
that secret no request acts as the service. The browser's validation token and
another document's token are refused. Such a request skips user capabilities but
may only add or remove user tables, add, update or remove rows in them, and remove
fields from a page (to hide IkaDoc's identity columns on an added source); every
other metadata table stays out of reach. A browser session cookie is never
treated as the service.

On an IkaDoc-only runtime, user actions (REST `apply` and table endpoints,
websocket `applyUserActions`) need an admitted person or the service token
(GR-03, SEC-1). An edit for a document without a registered IkaDoc session, for
example with an API key alone, after a restart or on another process, is refused
rather than applied unchecked. API-key reads stay with Grist's own
authentication. With `IKADOC_GRIST_RUNTIME_ONLY=false` plain Grist edits are
unchanged.

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
- the fork image defaults to `GRIST_SANDBOX_FLAVOR=gvisor` (upstream falls back
  to `unsandboxed`); a deployment that cannot run `runsc` must set `pyodide`
  explicitly, and the image refuses to boot when gVisor is selected but fails;
- request/network formula features, webhook domains, and trusted plugins remain
  disabled unless a separate threat model and allowlist approve them;
  `GET /api/ikadoc/runtime/posture` reports the values this process actually
  runs with (sandbox, request function, webhook domains, plugins, widget
  repository) so IkaDoc can verify them (GW-SEC-04);
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

- Each IkaDoc visual style has its own pair of native Grist themes:
  `OwarelinLight`/`OwarelinDark` and `IkaDocMaterialLight`/`IkaDocMaterialDark`
  (`app/common/themes/IkaDocThemes.ts`). They start from Grist's own themes and
  replace the semantic tokens; Grist's component tokens follow from those.
- Colors are the ones the IkaDoc frontend renders, not hand-picked values:
  `devtools/ikadoc-theme-tokens/extract.js` runs in the IkaDoc page and resolves
  `--mat-sys-*`/`--ow-*` and the record table's own formulas for both styles in
  light and dark; `generate.mjs` writes `app/common/themes/ikadocPalette.ts`.
  Never edit that file by hand; re-extract when the frontend's theme changes.
- IkaDoc chooses the theme (`app/client/ui/IkaDocTheme.ts`): from the runtime
  config in a session, from `IKADOC_GRIST_DEFAULT_THEME` on pages served without
  one.
- `IkaDocThemeBridge` serves the IkaDoc fonts (variable Inter, 100–900) and the
  shapes and density theme tokens cannot express: 42px headers, 46px rows, row
  stripes and hover, pill chips, field and menu radius per style, 28px dialogs.
  It never sets colors or `--grist-*` variables; its grid colors come from the
  palette (`test/common/IkaDocClientSeams.ts` enforces it). It targets Grist's
  stable classes (`record-even`, `column_name`, `field_clip`, `test-*`) only.
- Charts use the Owarelin palette under Owarelin (`ikaDocChartColorway`).
- `test/common/IkaDocThemes.ts` checks palette parity and WCAG AA text contrast
  in all four themes.
- Copy must be translatable through locale files.
- Runtime font assets live under `static/fonts/ikadoc/`. Keep bundled font files,
  their upstream family names, and license provenance together when refreshing
  Inter, Manrope, Fraunces, or Material Symbols assets.

CSS is not a security mechanism. Icon systems, menus, toolbar composition and
security gates need explicit fork seams with tests and seam-ledger entries.

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

Sources (GW-SRC-10, GW-RFR-05): the runtime config's `sources` list
(`app/ikadoc/IkaDocSessionSources.ts`: source id, table id, label, origin,
scope, row count, snapshot time) feeds the left panel. The host replaces it with
`owarelin:sourcesChanged` (`detail.sources`) and reports changed records with
`owarelin:sourceRecordsChanged` (`detail.sourceId`, `detail.changedCount`). The
panel's « Actualiser » only sends `owarelin:refreshRequested` with `sourceId`;
the IkaDoc page chooses the refresh mode and refreshes. Grist never refreshes on
its own.

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

Guided Grist workspaces are the path for IkaDoc import and bulk-write workflows. The `.grist` file remains a normal Grist file; the special part is the Owarelin/IkaDoc use case attached to it. A table becomes guided only through an explicit IkaDoc action that chooses the workflow, schema type, and optional schema variant. The fork then shows the right labels, descriptor-bound editors, protected row identity, and simulation/apply controls for non-technical users until they click the final Owarelin/IkaDoc export/apply action.

Guided documents must carry an explicit workflow intent. The fork must be able to distinguish regular native Grist files from IkaDoc record-creation workspaces, record-import workspaces, bulk edit proposals, bulk write proposals, search-processing workspaces, report-analysis workspaces, and document-file editor sessions. This is just the use case behind the file, and it must survive saving a partially completed `.grist` file so the user can return later through IkaDoc without losing the right tools.

Intent values must be mutually exclusive and backend-issued. They are UX/tooling decisions, not browser-owned persistence operations. `record-creation` starts from candidate new rows, `record-import` starts from external/imported rows, and `bulk-write-proposal` starts from a broader backend-defined candidate write package. Those three intents feed the same IkaDoc reconciled import simulation/apply pipeline, where the backend decides create, update, no-op, conflict, invalid, unauthorized, or ignored per row. `bulk-edit-proposal` targets records selected by IkaDoc and is admitted only when the backend session source contract already contains immutable target rows with target record id, baseline version token, and baseline field values. No intent may imply delete, archive, workflow transition, content upload, or schema mutation unless a future product flow explicitly adds that action and permission.

The fork must not infer workflow intent from table names, labels, hidden columns, previous browser state, or native Grist ACL/workspace metadata. IkaDoc stores a small use-case marker with or linked to the IkaDoc vault/content version: intent, target collection, schema type, optional schema code or variant, allowed final action, and optional table bindings. IkaDoc UI uses that marker to distinguish normal `.grist` files from guided files in document lists, previews, and action menus. Reopening a saved guided file must re-check that marker before enabling import, bulk edit, bulk write, simulation, picker, or export/apply controls. Missing or stale markers fail closed or open as normal/read-only Grist with product-safe guidance. New saved versions carry the current marker; rollback opens with the marker attached to that version; copying a guided `.grist` file must either intentionally copy the marker or create a normal unmarked `.grist` file.

The guided workspace descriptor is the fork's render contract. Top-level schema fields preserve the legacy single-table contract. Multi-variant or batch clients must use descriptor `tables[]`, where each item carries the backend-issued Grist `tableId`, resolved target schema code, schema label, metadata field descriptors, and protected columns for that table. The fork may create or repair guided pages/tables only from this descriptor and only in editor sessions with structure-edit capability; viewer sessions remain read-only display surfaces. Guided setup may create missing bound tables, add missing bound columns, or restore one normal table page per existing bound table by using Grist's native `CreateViewSection(tableRef, 0, "table", null, null)` page-creation path. It must not auto-create charts, summaries, custom widgets, or repeated sections; those remain user-driven native Grist actions under the existing capability gates.

The current fork implementation writes descriptor-backed column labels and widget options when it creates or repairs guided columns. User-facing column labels combine the localized metadata label with the stable metadata code so mapping remains inspectable after localization or label drift. Enum descriptors become native Grist `Choice` or `ChoiceList` columns with backend-provided stable values. Date and datetime descriptors become native Grist `Date` and `DateTime` columns unless a future descriptor declares domain-specific constraints that require an IkaDoc-bound editor layered on top. Reference and JSON descriptors store IkaDoc-specific widget metadata in the column options, including metadata code, editor kind, value shape, reference restrictions, JSON payload/editor posture, required/derived/sensitive flags, and read-only posture. Native Grist still owns ordinary scalar editing; the fork enables explicit IkaDoc reference and JSON widgets only on descriptor-bound compatible `Text` storage columns, and backend validation remains the final authority.

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
- users do not type authoritative row ids, record ids, record versions, target ids, or import strategy switches. IkaDoc generates or resolves those values through add-row, normalization, simulation, or the final apply action;
- in guided bound tables, native Grist row creation paths that can add records, including single-row insert and paste into new rows, request backend-issued protected row values before the Grist `AddRecord`/`BulkAddRecord` action is sent. If allocation fails or returns a mismatched row count, the row creation fails closed instead of creating unreconcilable rows;
- import rows may carry legacy ids only when IkaDoc selects an `oldSystem` migration/re-import strategy. Normal record creation and bulk-write candidate rows use backend-generated identity. Bulk-edit rows must carry immutable target record id and opaque baseline version token from IkaDoc selection state. Apply decides create, update, no-op, or conflict from backend lineage and current database state, not from user-edited id cells, and retries must not create duplicate records;
- bulk-write rows must declare their allowed operation family through the backend marker/descriptor only. The user does not choose create versus update in the sheet;
- formula-backed bound cells contribute only their evaluated value in the apply snapshot. Formula expressions remain Grist workspace behavior and are not imported or persisted as IkaDoc record metadata authority.

Reference picker implementation detail:

- Grist native `ReferenceEditor` and `ReferenceUtils` are not suitable for
  normal IkaDoc references because they require `Ref`/`RefList` column types,
  a referenced table inside the `.grist` document, and local Grist row ids.
- Guided IkaDoc references use the explicit `IkaDocReference` widget on
  compatible `Text` storage columns. The registry seam is narrow:
  `UserType.ts` adds only the IkaDoc widget entry for `Text`, and
  `UserTypeImpl.ts` maps that entry to IkaDoc-owned editor/display classes.
  Native `Text`, `Ref`, and `RefList` behavior remains unchanged for unbound
  columns.
- The cell value remains the canonical IkaDoc UUID. The editor searches through
  session-scoped backend lookup endpoints and writes the selected UUID only.
  The renderer resolves UUID labels through a session-scoped batched cache keyed
  by session id, table id, metadata code, row key, and id.
- Guided JSON metadata uses the explicit `IkaDocJson` widget on compatible
  `Text` storage columns. It formats JSON for reading and keeps editing
  read-only; structured JSON writes remain backend-owned through
  simulation/apply validation.
- The fork sends only Grist binding coordinates such as table id, metadata code,
  optional row key, query, and ids. IkaDoc derives schema type, schema variant,
  reference restrictions, allowed target schemas, actor, collection, language,
  and create/update permission context from the owned open guided session.
- Free-typed labels and pasted values are candidate data. They are not silently
  converted to records in the browser; simulation/apply resolves or rejects them
  with row/cell feedback.
- Lookup options may include records the actor can select but cannot normally
  open. This is expected for IkaDoc select-only target types such as categories,
  administrative units, storage spaces, retention rules, classifications, event
  definitions, users, groups, roles, and legacy value lists. When the backend
  returns `canOpen=false`, the fork may display only the safe label/hint from the
  option DTO and must not show record navigation, full details, or hidden
  metadata.
- A future browse button may open the tenant UI reference picker over the
  versioned `owarelin:*` event bridge, but the selected value still goes through
  the same backend lookup/resolve/apply authority.

Same-value fill across selected rows must be represented as one logical bulk proposal or bulk action, not many unrelated single-row edits. IkaDoc validates every target row/cell before apply and reports partial failures with audit-safe detail.

The public backend route name `/validate` is a compatibility detail. Fork UI and host events should treat it as simulation: read the evaluated Grist snapshot, ask IkaDoc what would happen, and display summary/result state without mutating records. Apply must always rerun the same reconciliation against the latest backend state before writing; it must not trust an earlier browser simulation response.

Guided validate/apply browser notifications use the versioned Owarelin event bridge. The fork emits `owarelin:guidedWorkspaceValidated` and `owarelin:guidedWorkspaceApplied` with summary counts only: success, simulation status, imported total, updated total, warning count, error count, and conflict count. Row data, cell values, personal data, and conflict payloads must not be leaked through host notifications. In-grid issue/conflict markers and guided row-state writeback stay inside the Grist runtime; full manual conflict-resolution tooling remains a later guided workspace UI phase.

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
