# IkaDoc Grist Editor Surface Map

This document maps the Grist editor surfaces that matter for Owarelin/IkaDoc
runtime modes. It exists to prevent mode regressions where `viewer`, `editor`,
search-result editing, and native Grist read-only behavior get mixed together.

## Source Context

- Upstream Grist is a client/server document runtime. The browser shell renders
  pages, panels, widgets, cells, and menus; document writes go through REST or
  websocket user actions and are applied by the document worker.
- DeepWiki's Grist overview describes the main layers as browser client,
  `FlexServer`, document workers, and storage. Document operations flow over
  websocket to `ActiveDoc`, which checks permissions, compiles user actions, and
  persists SQLite document changes.
- DeepWiki's client architecture page maps `AppUI` as the top-level client
  shell, `TopBar` as document navigation/search/actions, and `PagePanels` as the
  three-panel layout.
- DeepWiki's view-layer page maps `BaseView` as the common view foundation,
  `GridView` as the spreadsheet implementation, and `DetailView` as the card
  implementation. `BaseView.activateEditorAtCursor()` is the normal cell editor
  entrypoint; `GridView` owns selection, row/column interactions, paste, and
  drag operations.
- DeepWiki's access-control page maps native Grist security as layered:
  request authentication, HomeDB document ACL, `GranularAccess`, and action
  filtering. IkaDoc runtime gates wrap that model rather than replacing it.
- DeepWiki's data-processing page maps write flow as browser user actions,
  websocket/REST transport, server sharing lock, data-engine translation into
  doc actions, granular access checks, SQLite persistence, and broadcast.

External source pages used for this map:

- `https://deepwiki.com/gristlabs/grist-core`
- `https://deepwiki.com/gristlabs/grist-core/3-client-architecture`
- `https://deepwiki.com/gristlabs/grist-core/3.2-view-layer`
- `https://deepwiki.com/gristlabs/grist-core/2.6-access-control-system`
- `https://deepwiki.com/gristlabs/grist-core/4-data-processing`

## Runtime Authority

IkaDoc remains authoritative for:

- tenant, deployment, collection, actor, document, and source ownership;
- runtime mode, source type, and capabilities;
- vault lifecycle, checkout/check-in, save/discard, audit, and final import or
  export actions.

Grist remains responsible for:

- rendering the spreadsheet document;
- running native view/layout/data models;
- applying allowed user actions after IkaDoc runtime policy accepts them;
- evaluating formulas only when the runtime admits formula capability and the
  sandbox is effective.

## Product Behavior Contract

The runtime contract is intentionally simple:

- Search-result sessions materialize IkaDoc search data into a normal Grist
  `.grist` document. After materialization, the editor must behave like normal
  Grist when the session is in `editor` mode and the backend grants edit
  capabilities.
- Document-file editor sessions also behave like normal Grist for the admitted
  temporary copy. IkaDoc owns checkout, save/check-in, discard, audit, and final
  vault persistence, but it does not micromanage native Grist tables, pages,
  widgets, charts, summaries, formulas, or layout edits inside the working copy.
- Read-only viewer sessions are the opposite. They are for viewing pages and
  spreadsheet content. Authoring controls should be hidden or inert in the
  browser, and the server/websocket policy must deny writes as defense in
  depth.
- Import, export, record creation, record import, bulk edit, and bulk write are
  the special IkaDoc integration surfaces. Those flows use guided workspace
  markers, IkaDoc schema/reference metadata, validation, protected columns,
  conflict handling, idempotency, and final apply/export endpoints.
- Source type is not an authorization shortcut for native Grist editing. Use
  `mode` and explicit capabilities to decide browser affordances. Use source
  type only for IkaDoc-owned host controls such as save/check-in, search
  artifact download/save-as-document, refresh/proposal availability, and guided
  workspace helpers.

Consequence: do not block or hide one native Grist action in a feature chain
without mapping the rest of that chain. Charts, summary tables, page widgets,
layout changes, field lists, and right-panel configuration are coupled through
Grist metadata. If edit mode exposes a native feature, the whole set of Grist
metadata writes needed by that feature must either work or the feature must not
be shown.

Client-side visibility is not security. Every sensitive action must have a
server or websocket policy gate. Client patches are still mandatory because a
viewer must not look like an editor.

## Runtime Modes

| Mode                    | Meaning                                                                               | Expected Browser Surface                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native Grist            | No IkaDoc runtime config.                                                             | Upstream Grist behavior. IkaDoc helpers return permissive defaults so native Grist is not broken.                                                                                                                                                                                                                                |
| IkaDoc viewer           | Admitted IkaDoc session with `mode: "viewer"` or no edit capability.                  | Spreadsheet content and page navigation only. Optional browser export may be shown only when `canExportFromBrowser` is true. No cell editors, row/column write controls, widget menus, page menus, layout drag/resize, right authoring panel, formulas, widgets, access, share, plugins, or native Grist account/admin surfaces. |
| IkaDoc editor           | Admitted IkaDoc session with `mode: "editor"` and authoring capabilities.             | Normal Grist editing inside IkaDoc boundaries. If cell, structure, formula, and chart capabilities are granted, native rows, columns, pages, widgets, charts, summaries, formulas, layout, and right-panel configuration must work coherently. Unsupported external/product surfaces remain gated. |
| Search result workspace | IkaDoc editor source type used for temporary search/result processing.                | A seeded normal Grist document. Search only controls how the initial rows/columns are materialized and which IkaDoc exit actions are available. It must not disable native Grist editor behavior by source type.                                                                                                                   |
| Guided workspace        | IkaDoc import/export/batch use case marker on a normal Grist file.                    | Normal Grist editing plus task-specific IkaDoc helpers, schema/reference-aware editors, protected columns, validation, conflict tooling, and final Owarelin action. The marker affects IkaDoc integration UX, not native Grist document semantics.                                                                                |

## End-to-End Runtime Flow

```text
IkaDoc tenant UI
  -> creates or resumes Grist gateway/editor session
  -> browser opens /grist/editor/:sessionId
  -> app/server/lib/IkaDocEditorEndpoint.ts asks IkaDoc backend for admission
  -> IkaDocBackendAdmissionClient parses runtimeConfig
  -> IkaDocRuntimeSessionRegistry stores session by sessionId, documentId, documentUrlId
  -> sendAppPage injects gristConfig.ikadoc into browser boot config
  -> app/client/ui/createAppPage.ts attaches theme/runtime event bridge
  -> AppUI / DocPageModel / TopBar / GristDoc build document shell
  -> GristWSConnection opens admitted workerUrl
  -> app/server/lib/Comm.ts builds IkaDoc AuthSession for websocket
  -> DocAuthorizer grants only admitted document id or url id
  -> DocWorker activeDocMethod wrappers validate session and capabilities
  -> ActiveDoc applies allowed user actions and broadcasts updates
```

Direct document API/websocket calls that skip the editor entrypoint are still
admitted through IkaDoc forward-auth:

```text
Browser request to /api/docs/:docId...
  -> Traefik forward-auth calls IkaDoc backend
  -> backend validates browser session, gateway session, tenant, document, path
  -> backend returns signed X-IkaDoc-Grist-* assertion headers
  -> Grist verifies HMAC, timestamp, and path
  -> request becomes an IkaDoc runtime identity
```

Never trust query parameters, native Grist org/workspace ACL, anonymous state, or
browser-supplied `X-IkaDoc-*` headers as IkaDoc authority.

## Native Grist Source Inventory

These are the upstream Grist files that explain most editor behavior. Start here
before patching.

| Responsibility        | Primary Files                                                                                                                                                                                                       | Notes                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| URL/load config       | `app/common/gristUrls.ts`, `app/common/urlUtils.ts`, `app/server/lib/sendAppPage.ts`                                                                                                                                | Encodes/decodes Grist URL state and browser boot config. IkaDoc runtime config rides inside `GristLoadConfig.ikadoc`. |
| Client app shell      | `app/client/ui/App.ts`, `app/client/ui/AppUI.ts`, `app/client/ui/PagePanels.ts`, `app/client/ui/TopBar.ts`, `app/client/ui/BottomBar.ts`                                                                            | Builds the document shell and panel layout. Use for top-level chrome problems.                                        |
| Document page model   | `app/client/models/DocPageModel.ts`, `app/client/components/GristDoc.ts`                                                                                                                                            | Opens docs, creates `DocComm`/`GristDoc`, manages readonly and active page state.                                     |
| Search                | `app/client/models/SearchModel.ts`, `app/client/ui2018/search.ts`, `app/client/ui/TopBar.ts`                                                                                                                        | Search is read/navigation behavior. Do not confuse it with edit mode.                                                 |
| Page tree             | `app/client/ui/Pages.ts`, `app/client/ui2018/pages.ts`, `app/client/ui/TreeViewComponent.ts`                                                                                                                        | Page navigation, page menu, rename, remove, duplicate, collapse, drag/drop.                                           |
| View layout           | `app/client/components/ViewLayout.ts`, `app/client/components/LayoutEditor.ts`, `app/client/components/LayoutTray.ts`, `app/client/components/buildViewSectionDom.ts`                                               | Widget layout, resize, drag, title row, collapsed sections.                                                           |
| View base             | `app/client/components/BaseView.ts`, `app/client/components/BaseView2.ts`                                                                                                                                           | Common cursor, row write, cell editor, copy/cut/paste helpers.                                                        |
| Grid view             | `app/client/components/GridView.ts`, `app/client/components/GridView.css`, `app/client/components/viewCommon.css`                                                                                                   | Spreadsheet grid, selection, row/column headers, menus, drag, paste, resize.                                          |
| Detail/card view      | `app/client/components/DetailView.ts`, `app/client/components/DetailView.css`, `app/client/components/RecordLayoutEditor.js`                                                                                        | Card/single-record rendering and card layout editing.                                                                 |
| Context menus         | `app/client/ui/ViewSectionMenu.ts`, `app/client/ui/ViewLayoutMenu.ts`, `app/client/ui/GridViewMenus.ts`, `app/client/ui/RowContextMenu.ts`, `app/client/ui/CellContextMenu.ts`, `app/client/ui/FieldContextMenu.ts` | Most visible leaks come from these files. Menus often render first and only disable individual entries later.         |
| Right authoring panel | `app/client/ui/RightPanel.ts`, `app/client/ui/RightPanelStyles.ts`, `app/client/ui/RightPanelUtils.ts`, creator/config subcomponents                                                                                | Field/widget/table/page configuration. Should not exist in viewer mode.                                               |
| Raw data view         | `app/client/components/DataTables.ts`                                                                                                                                                                               | Raw table list and table management.                                                                                  |
| Client RPC            | `app/client/components/Comm.ts`, `app/client/components/DocComm.ts`, `app/client/models/DocData.ts`                                                                                                                 | Browser RPC and user action bundling.                                                                                 |
| Server websocket      | `app/server/lib/Comm.ts`, `app/server/lib/DocWorker.ts`, `app/server/lib/IkaDocActiveDocMethod.ts`                                                                                                                  | Websocket identity, registered methods, active doc method policy.                                                     |
| Server REST API       | `app/server/lib/DocApi.ts`, `app/server/lib/DocApiTriggers.ts`, `app/server/lib/DocApiUtils.ts`                                                                                                                     | REST read/write/export/attachment/history/admin routes.                                                               |
| Native auth/ACL       | `app/server/lib/Authorizer.ts`, `app/server/lib/DocAuthorizer.ts`, `app/gen-server/lib/homedb/HomeDBManager.ts`, `app/server/lib/GranularAccess.ts`                                                                 | Native Grist authority that IkaDoc runtime wraps and narrows.                                                         |
| Document processing   | `app/server/lib/ActiveDoc.ts`, `app/server/lib/Sharing.ts`, `app/server/lib/DocStorage.ts`, `app/server/lib/DocManager.ts`                                                                                          | User actions, data engine, SQLite transactions, action history, broadcasts.                                           |
| Worker routing/scale  | `app/gen-server/lib/DocWorkerMap.ts`, `app/server/lib/DocWorkerMap.ts`, `app/server/lib/DocWorkerLoadTracker.ts`, `app/gen-server/lib/DocApiForwarder.ts`                                                           | Multi-worker routing and load.                                                                                        |
| IkaDoc owned runtime  | `app/ikadoc/*.ts`, `app/server/lib/IkaDoc*.ts`, `app/client/ui/IkaDoc*.ts`                                                                                                                                          | Product authority, capabilities, event bridge, theme bridge, admission, runtime session, backend validation.          |

## Capability Model

Client helper file:

- `app/client/ui/IkaDocRuntimeAccess.ts`
  - `getIkaDocRuntimeConfig()`: parses runtime config from Grist load config.
  - `isIkaDocRuntimeMode()` and `isIkaDocRuntimeEditor()`: distinguish native
    Grist fallback from IkaDoc viewer/editor mode.
  - `canEditIkaDocRuntimeStructure()`: true only for native Grist or IkaDoc
    editor with `canEditStructure`.
  - `canEditIkaDocRuntimeCells()`: true only for native Grist or IkaDoc editor
    with `canEditCells`.
  - named helpers for formulas, charts, custom widgets, attachments,
    comments, external data, local import, history, refresh, save/discard,
    sharing/access, fork/publish, plugins, and proposal building.
  - `canExportFromIkaDocRuntimeBrowser()`: true only for native Grist or
    explicit IkaDoc browser export permission.
  - `shouldShowIkaDocRuntimeAuthoringSurfaces()`: true for native Grist or
    IkaDoc editor sessions with at least one authoring capability.

Server authority files:

- `app/server/lib/IkaDocRuntimePolicy.ts`
  - gates REST capabilities and websocket-style user actions;
  - maps metadata, formula, custom widget, chart/layout, ACL, attachment,
    trigger/webhook, and cell-edit actions to explicit capabilities;
  - defaults unrecognized Grist metadata/write actions to structure editing.
- `app/server/lib/IkaDocActiveDocMethod.ts`
  - wraps active document websocket methods with session revalidation and
    capability checks before active document execution.
- `app/server/lib/DocApi.ts`
  - gates REST apply, export/download, attachments, fork/copy, history,
    assistant/proposal, external data, table operations, and raw API actions.

## Key Runtime Config Fields

| Field                  | Meaning                                                                                   | Notes                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sessionId`            | Opaque IkaDoc gateway/editor session id.                                                  | Stored in `IKADOC_GRIST_GATEWAY_SESSION` HTTP-only cookie.                                       |
| `collectionCode`       | IkaDoc collection scope.                                                                  | Backend-owned. Grist must not infer it from URL path.                                            |
| `sourceType`           | Runtime use case: document file, search workspace, report workspace, migration workspace. | Determines policy defaults on the backend.                                                       |
| `mode`                 | `viewer` or `editor`.                                                                     | Viewer is content/page navigation only. Editor still needs explicit capabilities.                |
| `documentId`           | Grist internal doc id admitted by IkaDoc.                                                 | Used by registry and websocket gates.                                                            |
| `documentUrlId`        | Short/public URL id admitted by IkaDoc.                                                   | Also accepted for exact-document routing.                                                        |
| `workerUrl`            | Admitted doc worker endpoint.                                                             | Client `GristWSConnection` must use this directly.                                               |
| `validationUrl`        | Backend session validation endpoint.                                                      | Browser URL is public; Grist container may use internal override `IKADOC_EDITOR_VALIDATION_URL`. |
| `saveUrl`              | IkaDoc-owned save/check-in endpoint when saving is allowed.                               | Editor-only; Grist native save is not authoritative for IkaDoc vault lifecycle.                  |
| `discardUrl`           | IkaDoc-owned discard/close endpoint.                                                      | Editor-only user action; background cleanup remains backend-owned.                               |
| `blockedCapabilityUrl` | User-facing fallback when a capability is denied.                                         | Used for safe UX, not authorization.                                                             |
| `guidedWorkspace`      | Optional future workflow marker.                                                          | Distinguishes normal `.grist` files from import/bulk/edit/search workflows.                      |
| `capabilities`         | Partial wire map normalized to denied defaults.                                           | Missing capability means denied in IkaDoc runtime mode.                                          |

## Client Shell Map

| Area                 | Files                                                    | What It Builds                                                                                           | IkaDoc Control Point                                                                                                                                                                         |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App boot             | `app/client/ui/createAppPage.ts`, `app/client/ui/App.ts` | Parses load config, attaches runtime event bridge and theme bridge, starts app shell.                    | IkaDoc runtime config must be parsed once and treated as a mode/capability contract.                                                                                                         |
| Main document layout | `app/client/ui/AppUI.ts`                                 | Left panel, topbar, main document, optional right panel.                                                 | `shouldShowIkaDocRuntimeAuthoringSurfaces()` decides whether right panel exists. Viewer must not create it.                                                                                  |
| Topbar               | `app/client/ui/TopBar.ts`                                | Search, undo/redo, active users, IkaDoc save/discard/status controls, native breadcrumbs outside IkaDoc. | IkaDoc runtime hides native breadcrumbs/share/account surfaces and uses `IkaDocEditorControls`. Search is read-only. Undo/redo are allowed only if resulting user actions pass server gates. |
| Left pane            | `app/client/models/DocPageModel.ts`                      | Add/New button, page list, tools.                                                                        | Add/New appears only for authoring-capable editor sessions.                                                                                                                                  |
| Tools list           | `app/client/ui/Tools.ts`                                 | History/access/raw-data/assistant/help tools.                                                            | IkaDoc runtime keeps only IkaDoc-approved tools, currently history when `canViewHistory`.                                                                                                    |
| Theme                | `app/client/ui/IkaDocThemeBridge.ts`                     | Runtime CSS variables and M3/Owarelin skin.                                                              | Visual-only. Must never be a permission gate.                                                                                                                                                |

## Client Write Pipeline

Most client writes eventually become Grist `UserAction[]`.

```text
UI event or command
  -> BaseView/GridView/GristDoc/ViewLayout/RightPanel method
  -> DocData.sendAction/sendActions or TableData.sendTableAction(s)
  -> DocData.BundleSender batches applyUserActions
  -> DocComm.applyUserActions
  -> client Comm sends websocket request
  -> server Comm dispatches registered DocWorker method
  -> IkaDocActiveDocMethod validates session/capability/user-action payload
  -> ActiveDoc.applyUserActions
  -> Sharing.addUserAction serializes bundle
  -> Python data engine converts UserActions to DocActions
  -> GranularAccess checks native Grist permissions
  -> DocStorage SQLite transaction persists stored actions
  -> broadcast filtered actions to clients
```

REST writes follow the same lower half once they call
`ActiveDoc.applyUserActions(...)`, but they enter through `DocApi.ts` routes and
must pass route-level IkaDoc middleware first.

Audit rule: when adding or hiding a client control, identify the exact
`UserAction` or REST route behind it and confirm the matching IkaDoc server
gate exists.

## Chart And Summary Flow

Native Grist charts are structural document features. Treat them as normal
editor behavior when `mode: "editor"` grants chart and structure capabilities.

The important chart path is:

```text
RightPanel chart controls
  -> ChartConfig in app/client/components/ChartView.ts
  -> _setAggregation(), _setXAxis(), _setGroupDataColumn()
  -> GristDoc.saveViewSection(...)
  -> GristDoc._replaceViewSection(...) when table, summarize, or group-by changes require a replacement section
  -> CreateViewSection, UpdateSummaryViewSection, UpdateRecord, RemoveViewSection
  -> sandbox/grist/useractions.py summary/view-section handlers
  -> _grist_Tables, _grist_Tables_column, _grist_Views, _grist_Views_section,
     and _grist_Views_section_field metadata changes
```

`Aggregate values` is not just a visual checkbox. In upstream Grist it may turn
a chart section into a summary-backed section. That can create a summary table,
generate formula columns such as `count`, replace the current section, rewrite
the page layout, and remove the old section. This is expected Grist behavior.

Therefore:

- in IkaDoc viewer mode, hide the chart authoring panel and block the write
  path server-side;
- in IkaDoc editor mode with chart and structure capability, allow the complete
  native chart/summary/layout chain;
- do not special-case `search-workspace` to disable chart aggregation or summary
  creation. Search workspaces are regular Grist documents after seeding;
- if a future guided import/export workspace needs a constrained chart builder,
  implement that as guided UX on top of Grist instead of partially blocking
  upstream chart internals.

Search seeding now carries an explicit Grist column type for the safe subset:
integer metadata maps to `Int`, decimal/percentage/currency metadata maps to
`Numeric`, boolean metadata maps to `Bool`, and conversion-sensitive metadata
such as date/datetime/reference/enum/list/json remains `Text` until the value
representation is proven compatible with Grist `noparse` record ingestion.
Mixed schema-type conflicts for the same visible field fail closed as typed
IkaDoc validation errors instead of lying about the Grist column type.

## Page Tree Map

| Behavior               | Files                                                              | Write Risk                             | Expected IkaDoc Policy                                                             |
| ---------------------- | ------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| Page navigation        | `Pages.ts`, `TreeViewComponent.ts`, `pages.ts`                     | No write.                              | Always available when document is viewable.                                        |
| Page rename            | `pages.ts` -> `onRename` -> `viewRec.name.saveOnly`                | Renames page metadata.                 | Structure edit only. Viewer must not expose rename editor/menu.                    |
| Page remove/duplicate  | `pages.ts`, `Pages.ts` -> `removeView`, `buildDuplicatePageDialog` | Removes/duplicates Grist views/tables. | Structure edit only. Viewer must not expose menu.                                  |
| Page drag/drop reorder | `TreeViewComponent.ts` -> model `sendTableActions`                 | Reorders `_grist_Pages`.               | Structure edit only. Viewer must use readonly tree behavior.                       |
| Page default collapse  | `pages.ts` -> `onCollapseByDefault`                                | Persists page tree metadata.           | Treat as structure/user configuration write in IkaDoc viewer; hide menu in viewer. |

Native Grist `activeDoc.isReadonly` is insufficient by itself when IkaDoc runtime
uses an internal Grist editor-capable identity to load a viewer session. The
page tree must also respect IkaDoc structure capability.

### Page Tree Source Notes

- `Pages.ts` creates `TreeViewComponent` with `isReadonly: activeDoc.isReadonly`.
- `TreeViewComponent._startDrag()` returns early when `isReadonly` is true.
- `ui2018/pages.ts` always constructs the page dots menu, then marks entries
  disabled when readonly. That is not enough for IkaDoc viewer UX; viewer should
  not see a page edit menu at all.
- `DocPageModel.addMenu(...)` is the Add/New surface. IkaDoc already hides it
  through `shouldShowIkaDocRuntimeAuthoringSurfaces()`.

## View/Layout Map

| Behavior               | Files                                                    | Write Risk                                           | Expected IkaDoc Policy                                                                                                        |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Build page layout      | `ViewLayout.ts`                                          | No write by render alone.                            | Always render allowed visible sections.                                                                                       |
| Layout editor creation | `ViewLayout.ts`, `LayoutEditor.ts`                       | Enables resize/reorder interactions.                 | Only create/use when structure edit is allowed.                                                                               |
| Save layout spec       | `ViewLayout.ts` -> `layoutSpecObj.setAndSave`            | Persists `_grist_Views` layout.                      | Must check native readonly and IkaDoc structure capability.                                                                   |
| Widget drag handle     | `buildViewSectionDom.ts`                                 | Visual and interaction affordance for layout writes. | Hide/disable unless structure edit is allowed.                                                                                |
| Widget title rename    | `WidgetTitle.ts`                                         | Renames table/view section metadata.                 | Already gates on `canEditIkaDocRuntimeStructure()`.                                                                           |
| Widget menu trigger    | `ViewSectionMenu.ts`                                     | Opens raw-data/export/print/options/collapse/delete. | Viewer: absent unless browser export is granted; export-only if present. Editor: menu entries follow individual capabilities. |
| Sort/filter menu       | `ViewSectionMenu.ts`, `FilterConfig.ts`, `SortConfig.ts` | Persists filters, sorts, custom options.             | Viewer: absent. Editor: structure/config policy should govern persistent changes.                                             |
| Collapsed widget menu  | `buildViewSectionDom.ts`, `ViewLayoutMenu.ts`            | Expand/raw-data/delete/collapse writes.              | Viewer: absent. Editor: structure gates.                                                                                      |

### View/Layout Source Notes

- `GristDoc.buildDom()` creates `ViewLayout` for normal numeric page ids.
- `ViewLayout` owns the `Layout` tree, creates `LayoutEditor`, and persists
  layout through `viewModel.layoutSpecObj.setAndSave(...)`.
- IkaDoc runtime layout editability is centralized in
  `ViewLayout.canEditStructure()`. It combines native Grist readonly with
  `canEditIkaDocRuntimeStructure()`, and is used by layout save, keyboard
  mutation commands, `LayoutEditor`, and `LayoutTray`.
- `LayoutTray` is still allowed to render already-collapsed widgets for reading,
  but its drag/drop, collapse, restore, and delete behavior is disabled when the
  surrounding `ViewLayout` cannot edit structure.
- `buildViewSectionDom()` renders each widget title row. This is where the drag
  icon, widget title, title controls, widget menu, filter bar, view pane, and
  new-record experiment enter the DOM.
- `ViewSectionMenu.ts` renders two separate controls: sort/filter menu and view
  layout menu. Hiding one does not hide the other.
- `ViewSectionMenu.ts` owns the menu triggers. In IkaDoc runtime mode the
  sort/filter trigger requires native write access and IkaDoc structure access.
  The widget kebab trigger is absent unless structure configuration is allowed
  or browser export is explicitly granted; export-only sessions receive only
  CSV/XLSX links.
- `ViewLayoutMenu.ts` decides contents of the widget kebab menu but does not by
  itself decide whether the kebab trigger exists. It still returns an empty menu
  if opened without structure/export capability, which keeps command and trigger
  layers fail-closed.
- `WidgetTitle.ts` gates rename popup creation on
  `canEditIkaDocRuntimeStructure()`.

## Grid and Cell Map

| Behavior                                 | Files                                                                                     | Write Risk                                       | Expected IkaDoc Policy                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Cursor movement/selection                | `BaseView.ts`, `GridView.ts`                                                              | No write.                                        | Viewer may select/copy/read. Selection should not create edit handles.                                   |
| Cell editor activation                   | `BaseView.activateEditorAtCursor()`                                                       | Writes cell values through field builders.       | Requires `canEditCells` and `mode: editor`. Viewer must return before editor creation.                   |
| Add/delete rows                          | `BaseView.insertRow`, `BaseView.deleteRecords`, `RowContextMenu.ts`, `CellContextMenu.ts` | `AddRecord`, `BulkRemoveRecord`.                 | Requires `canEditCells`; server validates user actions too. Viewer should hide/disable write menu items. |
| Paste/cut/fill/clear                     | `GridView.gridCommands`, `CellContextMenu.ts`, `BaseView.sendPasteActions`                | Bulk data writes.                                | Requires `canEditCells`; server validates action payloads. Viewer should allow copy only.                |
| Column insert/delete/rename/type/formula | `GridView.ts`, `GridViewMenus.ts`, `WidgetTitle.ts`                                       | `_grist_Tables_column` and view metadata writes. | Requires structure; formula paths require formulas plus structure; server action classifier enforces.    |
| Row/column drag                          | `GridView.ts` drag/drop methods                                                           | Reorders row/column metadata/data.               | Requires cell or structure capability depending on action payload; viewer must treat grid as readonly.   |
| Freeze columns                           | `GridView.toggleFreeze`                                                                   | Persists view metadata when not readonly.        | Treat as structure/view config. Viewer may not save.                                                     |
| Raw data table actions                   | `DataTables.ts`                                                                           | Rename, duplicate, remove, record-card toggles.  | Requires structure; raw-data read navigation may remain available.                                       |

### Grid Source Notes

- `GridView.isReadonly` is the cell-edit gate. It combines native Grist readonly,
  virtual/preview state, and `canEditIkaDocRuntimeCells()`.
- `GridView._isStructureReadonly` is the schema/view gate. It combines native
  Grist readonly, virtual/preview state, and
  `canEditIkaDocRuntimeStructure()`.
- Column insert/delete/rename/show/hide/freeze, column menu triggers, column
  resize saving, and row-to-header conversion use `_isStructureReadonly`.
- Cell edit, paste, clear values, row insert/delete, and duplicate rows use
  `isReadonly`.
- `CellContextMenu.ts` receives both cell readonly and column readonly so
  cell-only editor sessions do not accidentally lose value editing, while viewer
  sessions get only read actions.
- `RowContextMenu.ts` has an explicit viewer branch that keeps view/card/link
  read actions and omits row-write commands.
- `DetailView.ts` and `FieldContextMenu.ts` use the same split for card/detail
  views. Clearing/cut/paste are cell edits, while hiding fields is structure
  configuration. Viewer card/field menus keep copy/link actions only.
- `AppUI.ts` only constructs `RightPanel` when
  `shouldShowIkaDocRuntimeAuthoringSurfaces()` is true. Viewer mode therefore
  has no right-panel command group or tab content.
- `DataTables.ts` uses structure capability for raw-data table mutation and
  record-card configuration. It still allows raw-table navigation as a read
  surface.
- `DocHistory.ts` allows snapshot listing only when the backend permits
  `canViewHistory`; compare links are shown only with browser export capability.
- `DocPageModel.ts` gates local import menu actions with
  `canImportIkaDocRuntimeLocalFiles()`. The server websocket/import method also
  requires the same capability.
| Comments/discussions                     | `BaseView._openDiscussionAtCursor`, `CellContextMenu.ts`                                  | Comment writes.                                  | Requires future `canUseComments` server gate before enabling. Viewer must hide comment write entry.      |

### Grid Source Notes

- `GridView` has a broad command set. The file itself contains a TODO saying
  modifying commands should move behind a single readonly guard; therefore
  IkaDoc must be conservative when relying on command-level readonly behavior.
- `BaseView._commonCommands.input` and `_commonFocusedCommands.editField` both
  call `activateEditorAtCursor()`. That is the right central client guard for
  cell editor activation.
- `GridView.gridCommands.paste` checks `gristDoc.isReadonly`, while several
  row/column commands call write helpers that have their own guards. For IkaDoc
  viewer, setting `GridView.isReadonly` from `canEditIkaDocRuntimeCells()` helps
  context menus and rendering, but server `UserAction` policy is still required.
- Column menu triggers are built inside `GridView` header rendering. If a column
  menu appears in viewer mode, check `this.isReadonly`, `gridOptions.colMenu`,
  and `GridViewMenus.ts`.
- Row/cell context menus mostly disable entries with readonly flags. If viewer
  should not show the menu at all, patch the trigger in `GridView.ts`, not just
  the menu item list.

## Server Gate Map

| Boundary                                 | File                                           | Gate                                                                                                      |
| ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| REST document apply                      | `DocApi.ts` `/api/docs/:docId/apply`           | Native `canEdit`, `requireIkaDocCellEdit`, `requireIkaDocUserActions`, then `ActiveDoc.applyUserActions`. |
| REST table operations                    | `DocApi.ts` `getTableOperations()`             | Wraps `TableOperationsImpl.applyUserActions` with `assertIkaDocUserActionsAllowedForDocument`.            |
| REST export/download                     | `DocApi.ts` download routes                    | `requireIkaDocBrowserExport`, except API-key auth path explicitly bypasses browser export gate.           |
| REST attachments                         | `DocApi.ts` attachments routes                 | `requireIkaDocAttachmentUse`.                                                                             |
| REST history/snapshots                   | `DocApi.ts` states/snapshots/compare routes    | `requireIkaDocHistoryView` and/or `requireIkaDocBrowserExport`.                                           |
| REST fork/copy/admin/proposals/assistant | `DocApi.ts`, `AppEndpoint.ts`, `FlexServer.ts` | Explicit `denyIkaDocRuntimeOperation(...)` in IkaDoc runtime.                                             |
| Trigger/webhook egress                   | `DocApiTriggers.ts`                            | `requireIkaDocExternalData`.                                                                              |
| Websocket identity                       | `Comm.ts`                                      | `createIkaDocRuntimeAuthSession(...)` before native Grist session fallback.                               |
| Websocket doc auth                       | `DocAuthorizer.ts`, `IkaDocRuntimeAuth.ts`     | Runtime credential grants only admitted document id/url id.                                               |
| Websocket method dispatch                | `IkaDocActiveDocMethod.ts`, `DocWorker.ts`     | Session revalidation, capability check, user-action classifier before active document method runs.        |
| User action classifier                   | `IkaDocRuntimePolicy.ts`                       | Classifies Grist user actions by table/action shape and maps to capability names.                         |

## Server Method Map

| Method/Route Family           | Native Entry                                                                        | IkaDoc Hook                                                                                   | Notes                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `openDoc`                     | Client `Comm.openDoc()` to server websocket `Comm`/document open flow               | Runtime auth session and exact-document doc auth                                              | Opening is read-capable but must not fall back to anonymous/native ACL on IkaDoc failure. |
| `fetchTable`                  | `DocComm.fetchTable` -> `DocWorker.fetchTable` -> `ActiveDoc.fetchTable`            | Runtime credential doc auth plus native read filtering                                        | Read path. Viewer must keep this working.                                                 |
| `applyUserActions`            | `DocData.sendActions` -> `DocComm.applyUserActions` -> `DocWorker.applyUserActions` | `IkaDocActiveDocMethod` session validation and user-action classifier; no broad cell-edit pre-gate | Primary write path from browser UI. Each payload action decides its required capability. |
| `applyUserActionsById`        | Websocket method                                                                    | Same active-doc method wrapper                                                                | Write replay path; must not bypass policy.                                                |
| Plugin RPC                    | `forwardPluginRpc`, `pluginsReload`, plugin methods                                 | `canUsePlugins` or explicit deny                                                              | Keep denied unless product explicitly supports plugins.                                   |
| REST `/api/docs/:docId/apply` | `DocApi.ts`                                                                         | `requireIkaDocCellEdit` and `requireIkaDocUserActions`                                        | Primary REST apply endpoint.                                                              |
| REST table CRUD               | `DocApi.ts` records/tables/columns routes                                           | `getTableOperations(...).applyUserActions` policy wrapper or direct `assertIkaDocUserActions` | Watch direct `activeDoc.applyUserActions` calls.                                          |
| REST download/export          | `DocApi.ts` download routes                                                         | `requireIkaDocBrowserExport`                                                                  | Browser export permission.                                                                |
| REST create/import/fork/copy  | `DocApi.ts`, `AppEndpoint.ts`                                                       | explicit deny in runtime mode                                                                 | IkaDoc owns document lifecycle.                                                           |
| REST history mutation         | `DocApi.ts` snapshot/state remove routes                                            | explicit deny                                                                                 | History is read-only in runtime mode.                                                     |
| REST trigger/webhook          | `DocApiTriggers.ts`                                                                 | `requireIkaDocExternalData`                                                                   | External egress.                                                                          |

## Native Read-Only vs IkaDoc Viewer

Do not confuse these:

| Concept               | Source                                                                    | Meaning                                                                 | Problem                                                                                                |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Native Grist readonly | `DocPageModel.isReadonly`, `GristDoc.isReadonly`, `GristDoc.isReadonlyKo` | Derived from native Grist document access/recovery/fork/snapshot state. | In IkaDoc runtime, Grist may use an internal identity that has editor access so the document can load. |
| IkaDoc viewer mode    | `gristConfig.ikadoc.mode === "viewer"`                                    | Product says user may only read this IkaDoc-controlled file.            | Must hide editor affordances regardless of native Grist readonly.                                      |
| IkaDoc editor mode    | `mode === "editor"` plus capability booleans                              | Product says this session may edit the admitted working copy.           | Native Grist editor behavior should remain coherent. Gates protect IkaDoc boundaries and unsupported external/product surfaces, not ordinary internal metadata writes needed by visible editor features. |

Rule: in IkaDoc runtime code, use native readonly plus IkaDoc capability. Native
readonly alone is not a sufficient viewer-mode test.

## Minimal Client Gate Helpers

Keep client-side mode decisions centralized in `IkaDocRuntimeAccess.ts`:

| Helper                                       | Use For                                                                  | Do Not Use For                               |
| -------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `getIkaDocRuntimeConfig()`                   | Detect runtime mode and inspect source/capabilities.                     | Server authorization.                        |
| `isIkaDocRuntimeMode()`                      | Separate native Grist from IkaDoc runtime sessions.                      | Granting or denying a capability.            |
| `isIkaDocRuntimeEditor()`                    | Decide whether authoring-only surfaces may exist in principle.           | Specific cell/structure/formula decisions.   |
| `canEditIkaDocRuntimeCells()`                | Cell editor, paste/fill/clear, row data write affordances.               | Structure/schema/layout edits.               |
| `canEditIkaDocRuntimeStructure()`            | Pages, widgets, layout, columns, table metadata, rename/config surfaces. | Normal cell value edits.                     |
| `canUseIkaDocRuntimeFormulas()`              | Formula editor/schema/actions.                                           | Non-formula structure changes.               |
| `canCreateIkaDocRuntimeCharts()`             | Chart creation and chart-specific authoring surfaces.                    | Normal table widgets.                        |
| `canUseIkaDocRuntimeCustomWidgets()`         | Custom widget creation/configuration surfaces.                           | Native grid/detail/card widgets.             |
| `canViewIkaDocRuntimeHistory()`              | History tool visibility.                                                 | Snapshot compare/download.                   |
| `canRefreshIkaDocRuntimeSource()`            | IkaDoc source refresh control.                                           | General document reload.                     |
| `canSaveToIkaDocRuntime()`                   | IkaDoc-owned save/check-in controls.                                     | Native Grist persistence.                    |
| `canDiscardIkaDocRuntime()`                  | IkaDoc-owned discard/close controls.                                     | Delete/fork/export actions.                  |
| `canUseIkaDocRuntimeComments()`              | Comment affordances.                                                     | Cell value editing.                          |
| `canUseIkaDocRuntimeAttachments()`           | Attachment affordances and attachment APIs.                              | Vault file download permission.              |
| `canUseIkaDocRuntimeExternalData()`          | External data/webhook/request surfaces.                                  | Local file import.                           |
| `canImportIkaDocRuntimeLocalFiles()`         | Local file import entrypoints.                                           | Network-backed imports.                      |
| `canExportFromIkaDocRuntimeBrowser()`        | CSV/XLSX/download/compare links visible to browser.                      | IkaDoc save/check-in or backend export jobs. |
| `canManageIkaDocRuntimeAccess()`             | ACL/access management controls.                                          | Viewing the current user's profile.          |
| `canUseIkaDocRuntimePlugins()`               | Plugin/custom extension management.                                      | Normal document rendering.                   |
| `canBuildIkaDocRuntimeProposal()`            | IkaDoc proposal action.                                                  | Generic cell editing.                        |
| `shouldShowIkaDocRuntimeAuthoringSurfaces()` | Whole authoring panel/Add-New shell decisions.                           | Fine-grained sub-control authorization.      |

If a new helper seems necessary, first check whether it is a real capability or
only a convenience alias. Do not create aliases that hide policy decisions.

## User Action Classification Map

`IkaDocRuntimePolicy.capabilitiesForUserAction(...)` is the last line of defense
for websocket and REST apply payloads.

- REST policy resolves the browser runtime session from
  `IKADOC_GRIST_GATEWAY_SESSION` before falling back to document-id lookup. This
  prevents capability bleed when multiple admitted sessions share one Grist
  document.
- Websocket policy resolves the IkaDoc runtime session from the authenticated
  `AuthSession` credential before falling back to document-id lookup, so
  connected browser clients on the same Grist document keep independent
  capabilities.

| Action/Table Shape                                                                                                 | Capability                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Add/modify formula column or formula metadata                                                                      | `canUseFormulas` and `canEditStructure`                     |
| `_grist_ACL*` metadata                                                                                             | `canManageAccess`                                           |
| `_grist_Attachments` metadata                                                                                      | `canUseAttachments`                                         |
| `_grist_Cells` comment/discussion metadata                                                                         | `canUseComments`                                            |
| `_grist_Triggers`, `_grist_Webhooks`                                                                               | `canUseExternalData`                                        |
| Custom widget metadata/options                                                                                     | `canUseCustomWidgets` and `canEditStructure`                |
| Chart view-section creation and chart-specific `_grist_Views_section` metadata                                      | `canCreateCharts` and `canEditStructure`                    |
| Chart axis/series field membership through `_grist_Views_section_field` Add/Update/RemoveRecord                  | `canEditStructure`                                          |
| Page/view/layout metadata that is not chart-specific                                                            | `canEditStructure`                                          |
| Any other `_grist_*` metadata table                                                                                | `canEditStructure`                                          |
| Normal table cell actions in `CELL_EDIT_ACTIONS`                                                                   | `canEditCells`                                              |
| Unknown write action                                                                                               | `canEditStructure`                                          |

Audit implication: `applyUserActions` must not carry a broad method-level edit capability because chart, formula, cell, and structure edits all share that websocket method. The server validates the session first, then classifies each action in the payload. `applyUserActionsById` cannot inspect the replayed action payload and remains a conservative cell-edit gated replay path until a typed replay contract exists.

Audit implication: any new client surface that sends a Grist user action must
either map cleanly to this classifier or extend it with a test before the UI is
enabled.

The classifier is a security backstop, not a product workflow designer. It must
deny writes in viewer mode and deny unsupported IkaDoc boundaries, but it should
not turn normal editor mode into a partial editor. In editor sessions that grant
cell, structure, formula, and chart capabilities, ordinary `_grist_*` metadata
writes for pages, widgets, charts, summaries, layout, and field lists are part
of the document and should be allowed.

## Practical Patch Index

Use this table when a screenshot shows a Grist surface leaking into the wrong
mode.

| Symptom                                      | Start Here                                                                                        | Then Check                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Right sidebar/editor panel visible in viewer | `AppUI.ts`, `shouldShowIkaDocRuntimeAuthoringSurfaces()`                                          | Server still denies corresponding methods.                                |
| Add/New button visible in viewer             | `DocPageModel.ts`                                                                                 | `AppUI.ts` authoring surfaces.                                            |
| Page dots menu or rename visible in viewer   | `Pages.ts`, `app/client/ui2018/pages.ts`, `TreeViewComponent.ts`                                  | Native `isReadonly` plus IkaDoc structure gate.                           |
| Widget kebab menu visible in viewer          | `ViewSectionMenu.ts`, `ViewLayoutMenu.ts`                                                         | Browser export capability, menu contents.                                 |
| Sort/filter icon visible in viewer           | `ViewSectionMenu.ts`                                                                              | Filter/sort save buttons and server action classifier.                    |
| Widget title can be edited                   | `WidgetTitle.ts`                                                                                  | Structure capability.                                                     |
| Widget drag/resize works in viewer           | `ViewLayout.ts`, `buildViewSectionDom.ts`, `LayoutEditor.ts`                                      | Layout save and `_grist_Views*` action classifier.                        |
| Cell editor opens in viewer                  | `BaseView.activateEditorAtCursor()`                                                               | `GridView.isReadonly`, field builders, server `canEditCells`.             |
| Row/column menu write items visible          | `GridView.ts`, `GridViewMenus.ts`, `RowContextMenu.ts`, `CellContextMenu.ts`                      | `GridView.isReadonly`, user action classifier.                            |
| Raw data/table management visible            | `DataTables.ts`                                                                                   | Structure capability and server `_grist_*` classifier.                    |
| Download appears without permission          | `ViewLayoutMenu.ts`, `DocHistory.ts`, `DocApi.ts`                                                 | `canExportFromBrowser` in runtime config and backend permission mapping.  |
| Websocket edit returns unexpected success    | `IkaDocActiveDocMethod.ts`, `DocWorker.ts`, `IkaDocRuntimePolicy.ts`                              | Session registry resolution, validation URL, action classifier tests.     |
| Editor fails after container rebuild         | `IkaDocRuntimeSessionRegistry.ts`, `IkaDocBackendSessionValidator.ts`, backend admission endpoint | Runtime sessions are in-process; old tabs must revalidate or be reopened. |

## Patch Procedure

When changing any editor behavior:

1. Identify the runtime mode and capability involved. If no capability exists,
   leave the surface hidden and add a product decision note.
2. Find the client owner in the practical patch index.
3. Find the write path: websocket user action, REST route, native Grist local
   state, or pure read/navigation.
4. Confirm the server gate in `DocApi.ts`, `IkaDocActiveDocMethod.ts`, or
   `IkaDocRuntimePolicy.ts`.
5. Patch the smallest stable seam. Prefer `app/ikadoc` or `IkaDoc*.ts`; patch
   upstream files only where the DOM/command is owned upstream.
6. Add an `IkaDoc`/`Owarelin` import, identifier, or short comment anchor in
   every patched upstream file.
7. Update `documentation/ikadoc-integration-seams.md`.
8. Update `test/common/IkaDocClientSeams.ts` or server seam tests.
9. Run `yarn run build`, `yarn run lint`, and focused `GREP_TESTS=IkaDoc yarn
test` when runtime gates moved.
10. Validate live viewer and editor sessions after rebuilding the Grist image.

## Common Failure Patterns

| Pattern                                       | Why It Happens                                                                | Prevention                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Button hidden but shortcut still works        | DOM gate patched but command path remains active.                             | Guard central command/write entrypoint, for example `activateEditorAtCursor()` or active-doc method wrapper. |
| Menu item disabled but menu still visible     | Upstream menus often render a trigger and disable entries later.              | Hide the trigger when the mode should not expose the whole menu.                                             |
| Server denies write but UI looks editable     | Client relied only on server policy.                                          | Patch UI affordance and keep server gate.                                                                    |
| Viewer turns into broken editor               | Code checked native `isReadonly` instead of IkaDoc mode/capability.           | Always combine native readonly with IkaDoc capability helpers in runtime seams.                              |
| Search workspace loses editor controls        | Code treats every IkaDoc runtime as viewer or hides authoring on source type. | Use `mode` plus capabilities, not source type alone.                                                         |
| Export appears without permission             | Download links are generated in several places.                               | Gate `ViewLayoutMenu`, `DocHistory`, and all `DocApi` download routes.                                       |
| Rebuild breaks old tab                        | Runtime registry is in-process.                                               | Reopen from IkaDoc or ensure backend revalidation path can recreate a session safely.                        |
| Formula UI appears but sandbox is ineffective | UI checks capability but not runtime health.                                  | Backend admission must fail closed for formula-capable sessions without effective sandbox.                   |

## Read-Only Contract

IkaDoc viewer mode means:

- visible: grid/card/chart content, page navigation, search, selection, copy,
  optional permitted download/export, optional permitted history reading;
- hidden or inert: page menus, page rename, page drag/drop, Add/New, right
  authoring panel, widget menu, sort/filter menu, widget title rename, layout
  drag/resize/collapse, row insert/delete/duplicate, column insert/delete/type,
  paste/cut/fill/clear, formula/code/schema panels, custom widget config,
  plugins, comments, attachments, share/access/admin/account, native Grist
  creation/import/fork/copy/publish/proposal/assistant surfaces;
- server behavior: every write-capable REST/websocket operation denied unless
  the matching IkaDoc capability is present and the session is valid.

If a browser control is useful only for writing and appears in viewer mode, it
is a bug even if the server denies the write.

## Editor Contract

IkaDoc editor mode is normal Grist editing inside an IkaDoc-controlled session.
The capabilities describe the boundary between normal document work and
IkaDoc-owned or security-sensitive surfaces:

- `canEditCells`: cell editor, row data writes, paste/fill/clear.
- `canEditStructure`: normal Grist table/view/schema/page/widget/layout changes.
- `canUseFormulas`: formula creation/editing, only with structure capability and
  effective sandbox. Existing formula execution is also an admission-time
  sandbox concern.
- `canCreateCharts`: chart creation and chart-specific configuration. Native
  summary tables and section replacement caused by chart aggregation are part of
  the allowed chart/structure chain when this capability is granted.
- `canUseCustomWidgets`: custom widget metadata/configuration and plugin RPC
  paths, only with the corresponding server gate.
- `canUseExternalData`: triggers/webhooks/external egress. In Grist,
  trigger/webhook writes are document-internal automation metadata, mainly rows
  in `_grist_Triggers` with fields such as `tableRef`, `eventTypes`, `actions`,
  `enabled`, and `condition`. They are not IkaDoc record metadata writes. They
  still stay denied for current IkaDoc sessions because they can execute
  outbound actions or webhooks.
- `canUseAttachments`: attachment metadata and file routes.
- `canViewHistory`: history read surfaces.
- `canExportFromBrowser`: document/table/view download and compare/export links.
- `canManageAccess`: ACL/access management metadata.
- `canUsePlugins`: plugin/custom extension management.
- `canBuildIkaDocRuntimeProposal`: IkaDoc proposal action.

Any editor surface that crosses an IkaDoc boundary or external/security surface
and cannot be tied to one of these capabilities should stay hidden until a
capability and server gate are defined. Do not use that rule to block ordinary
Grist document internals that are required by a visible native editor feature.

For the current product contract, document-file editor sessions and search-result
editor sessions that grant `canEditCells`, `canEditStructure`,
`canUseFormulas`, and `canCreateCharts` should expose normal Grist authoring:
rows, columns, formulas, pages, page rename, widgets, chart creation,
aggregation, summaries, layout, and right-panel configuration. Their special
IkaDoc behavior is in lifecycle exits: save/check-in for document files,
download/save-as-document for search artifacts, and future guided apply/export
flows.

## Source Files Audited For This Map

- `AGENTS.md`
- `documentation/ikadoc-integration-seams.md`
- `documentation/ikadoc-fork-sync.md`
- `documentation/ikadoc-runtime-auth-audit-2026-07-12.md`
- `documentation/owarelin-integration.md`
- `app/common/gristUrls.ts`
- `app/ikadoc/IkaDocRuntimeConfig.ts`
- `app/client/ui/IkaDocRuntimeAccess.ts`
- `app/client/ui/createAppPage.ts`
- `app/client/ui/AppUI.ts`
- `app/client/models/DocPageModel.ts`
- `app/client/ui/TopBar.ts`
- `app/client/ui/Tools.ts`
- `app/client/ui/Pages.ts`
- `app/client/ui2018/pages.ts`
- `app/client/ui/TreeViewComponent.ts`
- `app/client/components/ViewLayout.ts`
- `app/client/components/buildViewSectionDom.ts`
- `app/client/ui/ViewSectionMenu.ts`
- `app/client/ui/ViewLayoutMenu.ts`
- `app/client/ui/WidgetTitle.ts`
- `app/client/components/BaseView.ts`
- `app/client/components/GridView.ts`
- `app/client/ui/GridViewMenus.ts`
- `app/client/ui/RowContextMenu.ts`
- `app/client/ui/CellContextMenu.ts`
- `app/client/ui/FieldContextMenu.ts`
- `app/client/ui/PageWidgetPicker.ts`
- `app/client/ui/RightPanel.ts`
- `app/client/widgets/FieldBuilder.ts`
- `app/client/components/DataTables.ts`
- `app/server/lib/IkaDocRuntimePolicy.ts`
- `app/server/lib/IkaDocActiveDocMethod.ts`
- `app/server/lib/IkaDocRuntimeAuth.ts`
- `app/server/lib/IkaDocRuntimeHealthEndpoint.ts`
- `app/server/lib/IkaDocRuntimeSessionRegistry.ts`
- `app/server/lib/IkaDocBackendAdmissionClient.ts`
- `app/server/lib/IkaDocBackendSessionValidator.ts`
- `app/server/lib/IkaDocEditorEndpoint.ts`
- `app/server/lib/AppEndpoint.ts`
- `app/server/lib/Comm.ts`
- `app/server/lib/DocAuthorizer.ts`
- `app/server/lib/DocWorker.ts`
- `app/server/lib/DocApi.ts`
- `app/server/lib/DocApiTriggers.ts`
- `test/common/IkaDocClientSeams.ts`
- `test/common/IkaDocServerSeams.ts`
- `test/common/IkaDocRuntimeAccess.ts`
- `test/server/lib/IkaDocRuntimePolicy.ts`
- `test/server/lib/IkaDocRuntimeHealthEndpoint.ts`

Cross-worktree backend files inspected for this correction:

- `/home/taka/IdeaProjects/ikadoc-grist/docs/grist-editor-integration-spec.md`
- `/home/taka/IdeaProjects/ikadoc-grist/docs/grist-core-runtime-integration-spec.md`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/domain/GristEditorPolicySnapshot.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/AdmitGristEditorSessionUseCase.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/ValidateGristEditorSessionUseCase.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/domain/GristColumn.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/client/KtorGristProtocol.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/GristSearchColumnResolver.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/GristSearchSeedBuilder.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/GristSearchDisplayValueFormatter.kt`
- `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/application/session/GristSearchDisplayProjector.kt`

## Editor Surface Map

| Surface                              | Main Files                                                                                               | Writes?                                                                              | IkaDoc Rule                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser entrypoint                   | `app/server/lib/IkaDocEditorEndpoint.ts`, `app/server/lib/AppEndpoint.ts`                                | Session registration only.                                                           | Only `/grist/editor/:sessionId` may bootstrap an IkaDoc runtime page. Missing/invalid admission fails closed.                                                              |
| Runtime identity                     | `app/server/lib/IkaDocRuntimeAuth.ts`, `app/server/lib/Comm.ts`, `app/server/lib/DocAuthorizer.ts`       | No direct document write.                                                            | REST, websocket, and profile requests must resolve through the same admitted runtime session or signed forward-auth assertion.                                             |
| Shell/right panel                    | `app/client/ui/AppUI.ts`, `app/client/ui/RightPanel.ts`                                                   | Authoring controls can cause writes indirectly.                                      | Hide the right authoring panel unless IkaDoc editor has an authoring capability. Inside the panel, structure-owned field, sort/filter, data-selection, widget title/layout, visible-field, form submission, and widget-picker controls require `canEditStructure`; chart and custom-widget sections use their own capabilities. |
| Left authoring entrypoint            | `app/client/models/DocPageModel.ts`                                                                      | Creates pages/tables/widgets.                                                        | Hide Add/New unless IkaDoc editor has authoring capability. Viewer keeps page navigation only.                                                                             |
| Page tree                            | `app/client/ui/Pages.ts`, `app/client/ui2018/pages.ts`, `app/client/ui/TreeViewComponent.ts`             | Rename/remove/duplicate/default collapse can write. Drag/drop can reorder pages.     | Viewer must not expose page context menu or drag/drop writes. Native Grist readonly is not enough if IkaDoc viewer is backed by an internal editor-capable Grist identity. |
| Widget container/title               | `app/client/components/buildViewSectionDom.ts`, `app/client/ui/WidgetTitle.ts`                           | Rename, layout drag, resize, menu actions can write.                                 | Viewer must render title as text only and hide drag/menu/resize/collapse controls. Structure edit gates title rename and layout controls.                                  |
| Widget layout editor                 | `app/client/components/ViewLayout.ts`, `app/client/components/LayoutEditor.ts`                           | Resizes, reorders, collapses, removes widgets.                                       | Viewer must not create active layout editing behavior. `saveLayoutSpec()` must check IkaDoc structure capability, not only Grist native readonly.                          |
| Widget menu                          | `app/client/ui/ViewSectionMenu.ts`, `app/client/ui/ViewLayoutMenu.ts`                                    | Contains raw data, print, export, options, sort/filter, collapse, duplicate, delete. | Viewer shows no widget menu unless browser export is granted; export-only menu must contain only explicit download actions.                                                |
| Sort/filter menu and panel           | `app/client/ui/ViewSectionMenu.ts`, `app/client/ui/RightPanel.ts`, `FilterConfig.ts`, `SortConfig.ts`     | Can save sort/filter/widget options.                                                 | Viewer should not expose this menu or panel sub-tab. Search is a separate topbar read affordance. Editor/search workspaces show it only with structure capability.          |
| Cell editor                          | `app/client/components/BaseView.ts`, field builders/widgets under `app/client/widgets`                   | Edits cell values.                                                                   | Viewer must not activate field editors. Editor needs `canEditCells`.                                                                                                       |
| Grid selection/row/column commands   | `app/client/components/GridView.ts`, `app/client/ui/GridViewMenus.ts`, `app/client/ui/RowContextMenu.ts` | Add/delete rows/columns, paste, fill, freeze, modify fields.                         | Viewer must force GridView readonly behavior. Server still denies all apply actions without capability.                                                                    |
| Raw data tables                      | `app/client/components/DataTables.ts`                                                                    | Rename, duplicate, remove, create tables.                                            | Structure edit required. Viewer must hide write affordances.                                                                                                               |
| Share/access/account/admin           | `app/client/ui/ShareMenu.ts`, `app/server/lib/FlexServer.ts`, `DocApi.ts`                                | Can expose or mutate access/account state.                                           | Hidden or denied in IkaDoc runtime unless explicit capability exists. Grist org/workspace/account are never authority.                                                     |
| Export/download                      | `app/client/ui/ViewLayoutMenu.ts`, `app/client/ui/DocHistory.ts`, `app/server/lib/DocApi.ts`             | Reads document bytes/content out of runtime.                                         | Browser export/download shown and allowed only with `canExportFromBrowser`.                                                                                                |
| History/snapshots                    | `app/client/ui/DocHistory.ts`, `DocApi.ts`                                                               | Reads snapshots; compare/download can export.                                        | History viewing and browser export are separate gates. History itself should be read-only.                                                                                 |
| Formula/custom widgets/external data | `IkaDocRuntimePolicy.ts`, `IkaDocRuntimeHealthEndpoint.ts`, `DocApiTriggers.ts`                          | Executes code or egress.                                                             | Formula edits require formula and structure capability plus effective sandbox. Custom widgets/plugins/external data require explicit capabilities.                         |

## Current Correction Findings

- Issue: The previous implementation model treated normal edit/search Grist
  behavior as something IkaDoc should micromanage.
  Evidence: the older editor contract in this file said editor mode was not full
  Grist, while the backend `GristEditorPolicySnapshot` grants search-result
  editor sessions cell, structure, formula, and chart capabilities. Native Grist
  chart aggregation uses structure and summary-table metadata writes.
  Impact: visible edit-mode controls can be only partially functional, causing
  disabled-action toasts, missing sidebars, broken chart aggregation, duplicate
  or blank widgets, and user confusion.
  Required fix: keep source-type-specific restrictions out of normal Grist
  editing. Gate by `mode` and capabilities only; keep IkaDoc-specific behavior
  at lifecycle exits and guided import/export surfaces.
  Tests needed: live browser editor validation for search and document-file
  sessions covering page rename, add widget, chart creation, chart aggregation,
  summary update, right-panel config, row/cell edit, and viewer denial.
  Severity: high.

- Issue: Read-only and edit-mode responsibilities were mixed in client seams.
  Evidence: viewer fixes touch `BaseView`, `GridView`, `ViewLayout`,
  `LayoutEditor`, `LayoutTray`, `Pages`, `ViewSectionMenu`, `ViewLayoutMenu`,
  `RightPanel`, context menus, and widget title paths. These are valid viewer
  UX seams, but each one can also suppress normal editor behavior if the helper
  or capability is interpreted too broadly.
  Impact: read-only can look editable, or edit mode can behave like a broken
  read-only document.
  Required fix: viewer patches should hide or inert only the authoring
  affordances that contradict viewer mode. Editor patches must preserve native
  Grist behavior when the admitted session grants the needed capability.
  Tests needed: source-backed seam tests plus live screenshots in viewer and
  editor modes.
  Severity: high.

- Issue: Search-result chart usefulness is limited by backend seed column types.
  Evidence: `/home/taka/IdeaProjects/ikadoc-grist/modules/grist/src/main/kotlin/com/ikadoc/modules/grist/domain/GristColumn.kt` has only `id` and `label`; `KtorGristProtocol.kt` uses the named constant `TEXT_COLUMN_TYPE = "Text"` for every seeded column.
  Impact: native Grist chart series may appear empty or offer only generated
  summary `count` values because search snapshots do not preserve numeric/date
  metadata as Grist column types.
  Required fix: extend the backend seed contract with a typed Grist column kind
  derived from IkaDoc metadata. Start with safe scalar numeric/boolean mappings;
  keep dates as text until the Grist value representation is handled with
  `noparse` ingestion.
  Tests needed: protocol request tests for column types, search column resolver
  tests for metadata type mapping/conflict handling, and live chart smoke tests.
  Severity: medium.

- Issue: The blocked-action toast is too generic for implementation debugging.
  Evidence: `IkaDocRuntimePolicy.deniedIkaDocRuntimeOperation()` returns the
  same browser message for every denied operation.
  Impact: during development, a legitimate edit-mode regression looks like a
  deliberate product denial, making it harder to tell whether a chart/layout
  failure came from policy, Grist, routing, or data typing.
  Required fix: keep browser messages product-safe, but log and audit operation,
  capability, source type, mode, session id, document id, and policy reason.
  Tests needed: blocked-capability audit payload tests and live log inspection.
  Severity: medium.

## Audit Findings From This Pass

- Issue: Widget view menu button still renders in IkaDoc viewer mode even when
  the menu contents are empty or should be export-only.
  Evidence: `app/client/ui/ViewSectionMenu.ts` always renders the
  `test-section-menu-viewLayout` dots menu and calls `makeViewLayoutMenu(...)`.
  Impact: Viewer mode still looks editable and exposes native actions such as
  raw-data, print, export, and collapse before menu filtering is complete.
  Required fix: Hide the widget menu trigger in viewer mode unless
  `canExportFromBrowser` is granted; if granted, render export-only menu.
  Tests needed: `test/common/IkaDocClientSeams.ts` anchors plus live browser
  screenshot validation.
  Status: fixed in `app/client/ui/ViewSectionMenu.ts` and
  `app/client/ui/ViewLayoutMenu.ts`.
  Severity: medium.

- Issue: Sort/filter widget menu remains visible in viewer mode.
  Evidence: `app/client/ui/ViewSectionMenu.ts` always renders the filter menu
  wrapper; save is hidden/disabled but the menu remains interactive.
  Impact: Viewer mode is not visually read-only and users can manipulate state
  that looks like document configuration.
  Required fix: Hide sort/filter menu in IkaDoc viewer mode.
  Tests needed: client seam anchor and live browser screenshot validation.
  Status: fixed in `app/client/ui/ViewSectionMenu.ts`.
  Severity: medium.

- Issue: Right-panel sub-tabs and controls are shown for editor/search
  sessions without the matching structure capability.
  Evidence: `app/client/ui/RightPanel.ts` used the coarse authoring-panel
  construction gate but still rendered Field, Sort & filter, Data, form
  submission, widget title/layout, visible-fields, and widget-picker controls
  inside the panel.
  Impact: Users see controls that look usable, then hit the generic IkaDoc
  blocked-action toast. Search workspaces can look broken even though the
  session is writable for permitted actions.
  Required fix: Gate structure-owned right-panel tabs, command handlers, and
  sub-controls with `canEditIkaDocRuntimeStructure()`, while leaving
  chart/custom sections tied to their specific capabilities.
  Tests needed: `test/common/IkaDocClientSeams.ts` anchors plus live screenshot
  validation in viewer, search editor, and full structure editor sessions.
  Status: fixed in `app/client/ui/RightPanel.ts`.
  Severity: medium.

- Issue: Layout editing uses native Grist readonly but not IkaDoc structure
  capability.
  Evidence: `app/client/components/ViewLayout.ts` always creates
  `LayoutEditor`; `saveLayoutSpec()` checks only `gristDoc.isReadonly`.
  Impact: Viewer mode can expose drag/resize/collapse behavior when Grist's
  internal runtime identity is editor-capable while IkaDoc mode is viewer.
  Server gates should deny writes, but the UI still behaves like an editor.
  Required fix: Gate layout editor creation and layout save by
  `canEditIkaDocRuntimeStructure()`.
  Tests needed: client seam anchor and live browser drag/resize validation.
  Status: fixed in `app/client/components/LayoutEditor.ts`,
  `app/client/components/LayoutTray.ts`, and
  `app/client/components/ViewLayout.ts`. The fix covers visible drag/resize
  affordances, `saveLayoutSpec()`, keyboard command handlers, and tray
  collapse/restore/delete/drag-drop paths.
  Severity: high for UX correctness, medium security because server gates still
  deny writes.

- Issue: Widget drag affordance uses native Grist readonly but not IkaDoc
  structure capability.
  Evidence: `app/client/components/buildViewSectionDom.ts` applies
  `layout_grabbable` when `!gristDoc.isReadonlyKo`.
  Impact: Viewer mode can display layout drag affordances.
  Required fix: Include `canEditIkaDocRuntimeStructure()` in the grabbable and
  visibility decisions.
  Tests needed: client seam anchor and live browser screenshot validation.
  Status: fixed in `app/client/components/buildViewSectionDom.ts`.
  Severity: medium.

- Issue: Page context menu remains visible in readonly page navigation.
  Evidence: `app/client/ui2018/pages.ts` builds a page dots menu with disabled
  rename/remove/duplicate plus collapse/default actions; `Pages.ts` passes
  only native `activeDoc.isReadonly`.
  Impact: Viewer mode is not "content and pages only"; page menu actions can be
  confusing, and default collapse may persist page-tree preferences.
  Required fix: Hide page menu in IkaDoc viewer mode and ensure page tree
  readonly uses IkaDoc structure capability.
  Tests needed: client seam anchor and live browser page tree validation.
  Status: fixed in `app/client/ui/Pages.ts` and
  `app/client/ui2018/pages.ts`; `TreeViewComponent` and `buildPageDom` now
  receive the same IkaDoc-aware readonly observable.
  Severity: medium.

- Issue: Cell editor could activate in viewer mode.
  Evidence: screenshot showed an active cell editor in read-only mode; source
  path is `BaseView.activateEditorAtCursor()`.
  Impact: Viewer mode looks writable and may send denied websocket actions.
  Required fix: Block editor activation unless `canEditIkaDocRuntimeCells()`.
  Tests needed: client seam anchor and live browser double-click/keyboard edit
  validation.
  Status: fixed in `app/client/components/BaseView.ts`,
  `app/client/components/GridView.ts`, and `app/client/components/DetailView.ts`.
  Severity: high for UX correctness, medium security because server action
  policy denies writes without `canEditCells`.

- Issue: Comment/discussion writes were classified as generic Grist metadata
  structure edits instead of the explicit comments capability.
  Evidence: `_grist_Cells` actions fell through to the `_grist_*` branch in
  `app/server/lib/IkaDocRuntimePolicy.ts`; client menus and cell indicators
  could expose discussion entrypoints without consulting
  `canUseIkaDocRuntimeComments()`.
  Impact: A session with structure editing could gain comment write behavior
  without the product granting comments explicitly.
  Required fix: Classify `_grist_Cells` as `canUseComments`; hide or no-op
  client discussion entrypoints without the comments capability.
  Tests needed: Server classifier tests for `_grist_Cells`; client seam anchors
  for comment gates.
  Status: fixed in `app/server/lib/IkaDocRuntimePolicy.ts`,
  `app/client/components/BaseView.ts`, `app/client/widgets/FieldBuilder.ts`,
  `app/client/ui/CellContextMenu.ts`, and `app/client/ui/FieldContextMenu.ts`.
  Severity: medium.

- Issue: Request and websocket policy could resolve by shared document id before
  the actual browser runtime session.
  Evidence: `IkaDocRuntimePolicy.resolveIkaDocRuntimeSessionForRequest(...)`
  checked the document registry before the session cookie, and
  `IkaDocActiveDocMethod.ts` used document-id helpers for websocket policy.
  Impact: Multiple admitted sessions for one Grist document could borrow the
  latest registered session's broader capabilities.
  Required fix: Resolve browser REST policy from the runtime cookie first and
  websocket policy from the authenticated runtime credential first; reject
  wrong-document session use explicitly.
  Tests needed: Same-document session collision tests for REST and websocket.
  Status: fixed in `app/server/lib/IkaDocRuntimePolicy.ts`,
  `app/server/lib/IkaDocRuntimeAuth.ts`, and
  `app/server/lib/IkaDocActiveDocMethod.ts`.
  Severity: high.

## Audit Loop 2026-07-22: Chart, Search, And Viewer Corrections

- Issue: Search-result charting was limited by backend seed column types, not by
  the Grist chart permission model.
  Evidence: Grist chart series are filtered through numeric-like column types;
  search-created documents previously seeded every field as `Text`.
  Impact: Search workspaces could create chart widgets and summary sections, but
  real numeric IkaDoc metadata appeared as non-numeric to Grist.
  Required fix: Implemented in `ikadoc-grist`: the seed column contract now
  carries explicit Grist column types for safe integer, numeric, and boolean
  metadata and rejects mixed-schema type conflicts with a typed validation error.
  Tests needed: backend resolver/protocol tests are implemented; live search
  chart smoke with at least one numeric column remains required after container
  rebuild.
  Status: addressed except live browser validation.
  Severity: medium.

- Issue: The native Grist chart/summary chain is broader than a single chart
  creation action.
  Evidence: `ChartView._setAggregation()` calls `GristDoc.saveViewSection(...)`;
  `saveViewSection` may send summary, layout, field, replacement, and section
  removal actions around the chart section.
  Impact: A future capability split or classifier edit could break chart
  aggregation while the top-level chart button remains visible.
  Required fix: Implemented in the fork policy tests: chart creation, summary
  update, summary-table metadata, chart view-section metadata, and section
  replacement/removal are covered under chart plus structure capabilities.
  Tests needed: browser smoke for creating a chart, choosing an X axis, toggling
  aggregation, adding a series, and linking/unlinking a widget remains required.
  Status: addressed except live browser validation.
  Severity: high.

- Issue: Raw data table menus exposed disabled write controls in viewer mode.
  Evidence: `app/client/components/DataTables.ts` owns raw table rename,
  duplicate, remove, record-card enable/disable, and record-card editing
  controls.
  Impact: IkaDoc viewer mode looked partially editable even though server policy
  protected writes.
  Required fix: Implemented in the fork: raw-data dots and record-card controls
  are hidden or inert when the document is readonly or structure editing is not
  granted.
  Tests needed: client seam anchor is implemented; viewer screenshot remains
  required after container rebuild.
  Status: addressed except live browser validation.
  Severity: medium.

- Issue: ACL websocket helpers needed explicit IkaDoc access-management gates.
  Evidence: `DocWorker.ts` routes `checkAclFormula` and `getAclResources` to
  ACL/access-rule resources.
  Impact: Hidden access-rule UI was not enough as a security boundary.
  Required fix: Implemented in the fork: both websocket methods require
  `canManageAccess` before `ActiveDoc` execution.
  Tests needed: dispatcher denial/admission tests are implemented.
  Status: addressed.
  Severity: high.

- Issue: Assistant and proposal websocket methods needed explicit IkaDoc runtime
  denial.
  Evidence: REST proposal and assistant routes are denied in IkaDoc mode, and
  `sendAppPage.makeGristConfig()` can inherit server-level assistant config
  unless the IkaDoc boot config clears it.
  Impact: Hidden UI was not a server boundary for assistant/proposal calls.
  Required fix: Implemented in the fork: assistant boot config is cleared, and
  `getAssistantState`, `getAssistance`, and `applyProposal` are denied before
  `ActiveDoc` execution in IkaDoc sessions.
  Tests needed: dispatcher denial tests and endpoint config assertions are
  implemented.
  Status: addressed.
  Severity: medium.

- Issue: Undo/redo policy is too coarse for future partial editor modes.
  Evidence: `DocWorker.ts` gates `applyUserActionsById` only with
  `canEditCells`; `ActiveDoc.applyUserActionsById()` reconstructs stored user
  actions or undo actions from history and applies them through native Grist
  access checks, not through the IkaDoc action classifier.
  Impact: Current document-file/search editor policies grant cells, structure,
  formulas, and charts together, so normal edit sessions are not blocked by this
  today. A future cell-only or guided partial session could replay structure,
  formula, chart, ACL, attachment, or external-data changes through undo/redo
  with only `canEditCells`.
  Required fix: Design an undo/redo classifier for reconstructed user actions
  and `ApplyUndoActions`, or explicitly require the complete capability set for
  `applyUserActionsById` in partial editor modes.
  Tests needed: dispatcher tests for undo/redo of row edits, structure edits,
  formula edits, chart edits, comments, attachments, ACL, and triggers.
  Status: open.
  Severity: medium.

- Issue: Blocked-action observability is too generic for debugging Grist UI
  regressions.
  Evidence: `IkaDocRuntimePolicy.deniedIkaDocRuntimeOperation(...)` exposes the
  same safe browser message for every denial, and `reportBlockedCapability(...)`
  posts only `capability` and `reason`. The browser screenshot shows the generic
  disabled toast without enough action/table/capability context to distinguish a
  policy denial from a Grist data-type UX problem.
  Impact: Operators and developers waste time guessing which Grist action chain
  failed. Adding detail must not leak cell values, record content, cookies,
  vault bytes, or service credentials.
  Required fix: Log and audit sanitized denial context: operation, action name,
  metadata table id, missing capability, mode, source type, and document/session
  ids. Keep the browser-facing message generic.
  Tests needed: server tests for sanitized audit payload and no cookie/content
  forwarding.
  Status: open.
  Severity: medium.

- Issue: Local runtime logs still show an unrelated IkaDoc SSE 500 during the
  integrated Grist test session.
  Evidence: `docker logs --since 4h ikadoc-app` recorded
  `GET /api/events/stream -> 500` after a 50-second SSE close. Filtered Grist
  logs did not show matching Grist policy denials for the chart attempt.
  Impact: It does not explain the chart breakage, but the integrated runtime
  still has an environment-level route stability issue that can confuse manual
  validation.
  Required fix: Track separately in the IkaDoc backend/frontend environment
  workstream; do not patch Grist internals for it.
  Tests needed: SSE disconnect/timeout behavior test or live environment smoke.
  Status: deferred outside the Grist fork; keep visible for integrated smoke.
  Severity: medium.

## Verification Gates

- `yarn run build`: passed after the focused read-only/editor seam changes and
  seam-test anchor update.
- `GREP_TESTS=IkaDocRuntimeAccess yarn run test:common`: passed for client
  mode/capability helpers.
- `GREP_TESTS="IkaDoc runtime policy" yarn run test:server`: passed for
  server runtime policy/session/capability enforcement.
- `yarn run lint`: passed after the focused read-only/editor seam changes.
- `git diff --check`: must pass before commit.

## 25-Point Iteration Status

| #  | Topic                                | Status                                                                 |
| -- | ------------------------------------ | ---------------------------------------------------------------------- |
| 1  | Viewer/editor mode model             | Addressed: native Grist fallback and IkaDoc editor mode are separated. |
| 2  | Client capability helpers            | Addressed: helpers now cover the runtime capability contract.          |
| 3  | Page tree                            | Addressed: drag/drop and page row menus use IkaDoc readonly state.      |
| 4  | Widget layout                        | Addressed: layout editor, tray, save path, and keyboard mutations share the IkaDoc structure gate. |
| 5  | Widget menus                         | Addressed: trigger and menu contents fail closed; export-only menu is explicit. |
| 6  | Sort/filter/data-selection menu      | Addressed: widget sort/filter trigger, command shortcut, and right-panel sub-tabs require structure access. |
| 7  | Cell/grid editing                    | Addressed: value-edit paths use `canEditCells`; viewer cell menu exposes read actions only. |
| 8  | Column/header controls               | Addressed: schema/view column paths use `canEditStructure`; column menu/add/resize/rename/freeze are hidden or no-op without structure access. |
| 9  | Row controls                         | Addressed: row insert/delete/duplicate use cell gate; row-to-header uses structure gate; viewer row menu omits write actions. |
| 10 | Detail/card view                     | Addressed: add/duplicate/delete/clear use cell gate; field hide uses structure gate; viewer field menu is read-only. |
| 11 | Right authoring panel                | Addressed: panel construction is authoring-gated, and panel sub-tabs/sub-controls are separately gated by structure, chart, formula, and custom-widget capabilities. |
| 12 | Raw data view                        | Partial: raw-data read navigation remains and writes require structure, but viewer dots-menu write entries still need to be hidden or made export-only. |
| 13 | History                              | Addressed: snapshot listing is server-gated by history permission; snapshot mutation is denied; compare links require browser export. |
| 14 | Export/download                      | Addressed: widget/history compare export UI uses browser export helper; `DocApi` gates download/compare/export routes with browser export permission. |
| 15 | Import                               | Addressed: local import UI and websocket import method require `canImportLocalFiles`; external data remains separate. |
| 16 | Formula execution                    | Addressed: formula UI entrypoints are hidden without formula capability; server classifier requires formula plus structure capability; sandbox proof endpoint is covered. |
| 17 | Custom widgets/plugins/external data | Addressed: widget picker, right panel, plugin RPC, external fetch, trigger, and webhook paths use explicit capabilities. |
| 18 | Server/websocket policy              | Partial: REST, websocket ACL/assistant/proposal gates, and `applyUserActions` classification are in place; `applyUserActionsById` remains coarse until a typed replay contract exists. |
| 19 | Forward-auth/session lifecycle       | Addressed: cookie, signed forward-auth, admission fallback, expiry pruning, wrong-document rejection, and backend validation are covered by focused tests. |
| 20 | Multi-runtime scaling                | Addressed in the fork for multiple browser sessions sharing one Grist document; deployment-level runtime pooling remains owned by the IkaDoc gateway/runtime pool. |
| 21 | Runtime health/readiness             | Addressed for formula sandbox proof in the fork; broader pool readiness is owned by the IkaDoc runtime/gateway status API. |
| 22 | Audit/logging                        | Partial: blocked capability callbacks avoid cross-origin cookies, but sanitized action/table/capability denial context is still too generic for UI regression debugging. |
| 23 | Live browser tests                   | Deferred: requires an authenticated live IkaDoc viewer/editor session; unit/build gates are green, but screenshots/browser smoke should run after container rebuild. |
| 24 | Patch hygiene                        | Addressed: upstream seams are listed in `documentation/ikadoc-integration-seams.md` and protected by seam tests. |
| 25 | Docs/spec drift                      | Updated: this map records the current mode/capability/session model, the chart/summary action chain, and the remaining source-backed gaps. |

## Remaining Validation Checklist

- Open a fresh IkaDoc viewer session after Grist rebuild. Verify:
  - page navigation works;
  - page menu is absent;
  - widget menu is absent unless export permission is granted;
  - sort/filter menu is absent;
  - cell double click and keyboard edit do not open editors;
  - row/column write menus are hidden or inert;
  - layout drag/resize handles do not appear and cannot persist layout changes;
  - websocket write attempts are denied server-side.
- Open an IkaDoc editor session with cell editing but without structure editing.
  Verify:
  - cell editing works;
  - page/widget/layout/schema controls remain hidden or denied;
  - formulas remain unavailable unless formula capability is granted.
- Open an IkaDoc editor/search workspace with structure capability.
  Verify:
  - expected Grist authoring surfaces return;
  - chart creation, X-axis selection, aggregation, summary section creation,
    series selection, and linked widget configuration work as native Grist
    actions;
  - save/discard remains IkaDoc-owned;
  - export/download appears only with browser export permission.
