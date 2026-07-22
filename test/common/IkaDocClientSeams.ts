import { readFileSync } from "fs";
import { resolve } from "path";

import { assert } from "chai";

const CLIENT_SEAMS = [
  {
    file: "app/client/ui/createAppPage.ts",
    anchors: [
      "attachIkaDocThemeBridge();",
      "parseIkaDocRuntimeConfigFromLoadConfig(getGristConfig())",
      "attachOwarelinRuntimeEventBridge(ikadocRuntimeConfig.config)",
    ],
  },
  {
    file: "app/client/ui/AppUI.ts",
    anchors: [
      "shouldShowIkaDocRuntimeAuthoringSurfaces",
      "rightPanel: showAuthoringSurfaces ?",
    ],
  },
  {
    file: "app/client/models/DocPageModel.ts",
    anchors: [
      "shouldShowIkaDocRuntimeAuthoringSurfaces",
      "canImportIkaDocRuntimeLocalFiles",
      "showAuthoringSurfaces ? addNewButton",
      "const canImportLocalFiles = canImportIkaDocRuntimeLocalFiles();",
      "if (isReadonly || !canImportLocalFiles) { return; }",
    ],
  },
  {
    file: "app/client/ui/IkaDocRuntimeAccess.ts",
    anchors: [
      "isIkaDocRuntimeEditor",
      "canUseIkaDocRuntimeFormulas",
      "canUseIkaDocRuntimeComments",
      "canUseIkaDocRuntimeCustomWidgets",
      "canManageIkaDocRuntimeAccess",
      "hasIkaDocRuntimeCapability",
    ],
  },
  {
    file: "app/client/ui/WidgetTitle.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "const isDisabled = disabled || !canEditIkaDocRuntimeStructure();",
    ],
  },
  {
    file: "app/client/ui/ViewLayoutMenu.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "canExportFromIkaDocRuntimeBrowser",
      "const canConfigureView = !isReadonly && canEditIkaDocRuntimeStructure();",
      "const canExportFromBrowser = canExportFromIkaDocRuntimeBrowser();",
      "return canExportFromBrowser ? buildExportMenuItems(gristDoc) : [];",
      "dom.hide(!canConfigureView)",
    ],
  },
  {
    file: "app/client/ui/ViewSectionMenu.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "canExportFromIkaDocRuntimeBrowser",
      "const canConfigureView = canEditIkaDocRuntimeStructure();",
      "const canExportFromBrowser = canExportFromIkaDocRuntimeBrowser();",
      "!canExportFromBrowser && (use(isReadonly) || !canConfigureView)",
    ],
  },
  {
    file: "app/client/components/ViewLayout.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "LayoutEditor.create(",
      "this.layout,",
      "enabled: this.canEditStructure()",
      "LayoutTray.create(this, this, { enabled: this.canEditStructure() })",
      "public canEditStructure()",
    ],
  },
  {
    file: "app/client/components/LayoutEditor.ts",
    anchors: [
      "enabled: boolean",
      "options: { enabled?: boolean } = {}",
      "IkaDoc viewer mode keeps the layout readable but disables layout write affordances.",
    ],
  },
  {
    file: "app/client/components/buildViewSectionDom.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "const canEditStructure = canEditIkaDocRuntimeStructure();",
      "IkaDoc viewer mode must not expose layout drag affordances.",
    ],
  },
  {
    file: "app/client/components/BaseView.ts",
    anchors: [
      "canEditIkaDocRuntimeCells",
      "canUseIkaDocRuntimeComments",
      "|| !canEditIkaDocRuntimeCells()",
      "if (!canUseIkaDocRuntimeComments())",
    ],
  },
  {
    file: "app/client/components/GridView.ts",
    anchors: [
      "canEditIkaDocRuntimeCells",
      "canEditIkaDocRuntimeStructure",
      "private _isStructureReadonly: boolean;",
      "!canEditIkaDocRuntimeCells()",
      "!canEditIkaDocRuntimeStructure()",
      "isReadonly: this.isReadonly,",
      "isReadonly: this._isStructureReadonly || this.isPreview",
    ],
  },
  {
    file: "app/client/ui/CellContextMenu.ts",
    anchors: [
      "canUseIkaDocRuntimeComments",
      "isReadonly: boolean;",
      "isReadonly: isColumnReadonly",
      "if (isReadonly && isColumnReadonly)",
      "const canUseComments = canUseIkaDocRuntimeComments();",
    ],
  },
  {
    file: "app/client/ui/RowContextMenu.ts",
    anchors: [
      "isReadonly: boolean;",
      "if (isReadonly)",
    ],
  },
  {
    file: "app/client/components/DetailView.ts",
    anchors: [
      "canEditIkaDocRuntimeCells",
      "canEditIkaDocRuntimeStructure",
      "!canEditIkaDocRuntimeCells()",
      "!canEditIkaDocRuntimeStructure()",
      "isStructureReadonly:",
    ],
  },
  {
    file: "app/client/ui/FieldContextMenu.ts",
    anchors: [
      "canUseIkaDocRuntimeComments",
      "isStructureReadonly: boolean;",
      "if (isReadonly && isStructureReadonly)",
      "disableForReadonlyStructure",
      "const canUseComments = canUseIkaDocRuntimeComments();",
    ],
  },
  {
    file: "app/client/ui/Pages.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "const pageTreeReadonly = Computed.create(owner, use =>",
      "buildDomFromTable.bind(null, pagesTable, activeDoc, pageTreeReadonly)",
      "use(activeDoc.isReadonly) || !canEditIkaDocRuntimeStructure()",
    ],
  },
  {
    file: "app/client/ui2018/pages.ts",
    anchors: ["!isReadonly.get()", "dom.hide(isReadonly)"],
  },
  {
    file: "app/client/components/DataTables.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "const canEditStructure = canEditIkaDocRuntimeStructure();",
      "!canEditStructure || use(isReadonly)",
      "this._gristDoc.isReadonly.get() || !canEditIkaDocRuntimeStructure()",
      "dom.hide(use => use(this._gristDoc.isReadonly) || !canEditStructure)",
    ],
  },
  {
    file: "app/client/ui/GridViewMenus.ts",
    anchors: [
      "canUseIkaDocRuntimeFormulas",
      "if (!canUseIkaDocRuntimeFormulas())",
      "buildShortcutsMenuItems(gridView, index)",
    ],
  },
  {
    file: "app/client/ui/PageWidgetPicker.ts",
    anchors: [
      "canCreateIkaDocRuntimeCharts",
      "canUseIkaDocRuntimeCustomWidgets",
      "filterIkaDocWidgetTypes",
      "sectionTypes: IWidgetType[] = filterIkaDocWidgetTypes",
    ],
  },
  {
    file: "app/client/ui/RightPanel.ts",
    anchors: [
      "canEditIkaDocRuntimeStructure",
      "canCreateIkaDocRuntimeCharts",
      "canUseIkaDocRuntimeFormulas",
      "canUseIkaDocRuntimeCustomWidgets",
      "fieldTabOpen: () => canEditIkaDocRuntimeStructure() && this._openFieldTab()",
      "sortFilterTabOpen: () => canEditIkaDocRuntimeStructure() && this._openSortFilter()",
      "dataSelectionTabOpen: () => canEditIkaDocRuntimeStructure() && this._openDataSelection()",
      "canEditStructure ? cssSubTab(t(\"Sort & filter\")",
      "canEditStructure ? cssSubTab(t(\"Data\")",
      "if (!canEditIkaDocRuntimeStructure()) { return null; }",
      "use(this._pageWidgetType) === \"chart\" && canCreateIkaDocRuntimeCharts()",
      "canUseIkaDocRuntimeCustomWidgets()",
      "!canEditIkaDocRuntimeStructure() || !canUseIkaDocRuntimeFormulas()",
    ],
  },
  {
    file: "app/client/widgets/FieldBuilder.ts",
    anchors: [
      "canUseIkaDocRuntimeComments",
      "if (!canUseIkaDocRuntimeComments()) { return false; }",
      "if (!canUseIkaDocRuntimeComments())",
    ],
  },
  {
    file: "app/client/ui/TopBar.ts",
    anchors: [
      "buildIkaDocEditorControls",
      'postOwarelinRuntimeEvent(ikadocConfig, "owarelin:documentDirty")',
    ],
  },
  {
    file: "app/client/ui/ShareMenu.ts",
    anchors: ["if (getGristConfig().ikadoc) {", "return null;"],
  },
  {
    file: "app/client/ui/DocHistory.ts",
    anchors: [
      "canExportFromIkaDocRuntimeBrowser",
      "const canCompareSnapshots = canExportFromIkaDocRuntimeBrowser();",
      'canCompareSnapshots ? menuItemLink(setLink(snapshot, origUrlId), t("Compare to current")) : null',
    ],
  },
  {
    file: "app/client/ui/IkaDocThemeBridge.ts",
    anchors: [
      "data-ikadoc-runtime='true'",
      "--grist-theme-bg:",
      "--ow-color-primary:",
      "--grist-theme-control-border-radius:",
      "--mat-sys-primary: #27496c;",
      "--mat-sys-tertiary: #693c00;",
      "IkaDoc M3 runtime skin",
      "--ik-grid-header-height: 2.625rem;",
      "--ik-grid-row-height: 2.875rem;",
      "--ik-app-border:",
      "--ik-menu-bg:",
      "--ik-table-row-hover:",
      ".searchbar-box.grist-navbar-pfx.part-toolbar-group__item",
      ".celleditor_text_editor",
      ".grist-floating-menu",
      ".viewsection_content",
      ".gridview_data_pane",
      "data-grist-appearance='dark'",
    ],
  },
] as const;

const IKADOC_EDITOR_CONTROL_KEYS = [
  "Build proposal",
  "Building proposal",
  "Checking session",
  "Guided workspace",
  "Guided workspace unavailable",
  "Guided workspace: {{schema}}",
  "Proposal requested",
  "Refresh",
  "Refreshing source",
  "Request failed",
  "Source refreshed",
  "{{sourceSummary}}Session ready",
  "{{sourceSummary}}Session: {{status}}",
] as const;

describe("IkaDoc client seams", function() {
  for (const seam of CLIENT_SEAMS) {
    it(`keeps IkaDoc runtime UI anchors in ${seam.file}`, function() {
      const source = readSource(seam.file);

      for (const anchor of seam.anchors) {
        assert.include(source, anchor);
      }
    });
  }

  it("keeps the IkaDoc theme bridge aligned with the frontend Material visual contract", function() {
    const source = readSource("app/client/ui/IkaDocThemeBridge.ts");

    assert.include(source, "--mat-sys-primary: #27496c;");
    assert.include(source, "--mat-sys-tertiary: #693c00;");
    assert.include(source, "--ik-grid-header-height: 2.625rem;");
    assert.include(source, "--ik-grid-row-height: 2.875rem;");
    assert.include(source, "min-height: 3rem;");
    assert.include(source, "--ik-radius-pill: 999rem;");
    assert.include(source, "border-radius: var(--ik-radius-pill);");
    assert.include(source, "--ik-menu-bg: var(--mat-sys-surface-container);");
    assert.include(
      source,
      "--ik-table-row-hover: var(--mat-sys-surface-container-low);",
    );
    assert.include(source, "--ik-menu-bg: var(--ow-color-panel);");
    assert.include(source, "--ik-table-row-hover: var(--ow-color-row-hover);");
    assert.include(source, "html[data-ikadoc-visual-style='owarelin']");
    assert.include(
      source,
      "html[data-ikadoc-visual-style='owarelin'][data-grist-appearance='dark']",
    );
  });

  it("keeps the IkaDoc tools panel limited to document history", function() {
    const source = readSource("app/client/ui/Tools.ts");
    const ikadocBranchIndex = source.indexOf(
      "if (ikadocConfig) {\n    return cssTools",
    );
    const normalAssistantIndex = source.indexOf(
      "buildOpenAssistantButton(gristDoc",
    );

    assert.isAtLeast(ikadocBranchIndex, 0);
    assert.isAbove(normalAssistantIndex, ikadocBranchIndex);
    assert.include(source, 'cssLinkText(t("Document history"))');
    assert.include(source, "canViewIkaDocRuntimeHistory(ikadocConfig)");
    assert.include(source, 'testId("log")');
  });

  it("keeps IkaDoc save and discard owned by the host page", function() {
    const source = readSource("app/client/ui/IkaDocEditorControls.ts");

    assert.notInclude(source, 'testId("ikadoc-editor-save")');
    assert.notInclude(source, 'testId("ikadoc-editor-discard")');
    assert.notInclude(source, "runIkaDocSave");
    assert.notInclude(source, "runIkaDocDiscard");
  });

  it("uses the versioned Owarelin event bridge instead of legacy IkaDoc messages", function() {
    const source = readSource("app/client/ui/IkaDocEditorControls.ts");

    assert.include(source, "postOwarelinRuntimeEvent");
    assert.notInclude(source, "postIkaDocEditorHostEvent");
    assert.notInclude(source, "ikadoc:grist:");
  });

  it("keeps IkaDoc editor control translations in supported runtime locales", function() {
    const localeFiles = [
      "static/locales/en.client.json",
      "static/locales/en_GB.client.json",
      "static/locales/fr.client.json",
    ];

    for (const localeFile of localeFiles) {
      const locale = JSON.parse(readSource(localeFile));
      const controls = locale.IkaDocEditorControls;

      assert.isObject(
        controls,
        `${localeFile} is missing IkaDocEditorControls`,
      );
      for (const key of IKADOC_EDITOR_CONTROL_KEYS) {
        assert.isString(controls[key], `${localeFile} is missing ${key}`);
        assert.isAbove(
          controls[key].length,
          0,
          `${localeFile} has an empty ${key}`,
        );
      }
    }
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
