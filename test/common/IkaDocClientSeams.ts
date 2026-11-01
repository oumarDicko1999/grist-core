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
      "isIkaDocRuntime ? \"ikadocRightPanelWidth\" : \"rightPanelWidth\"",
    ],
  },
  {
    file: "app/client/ui/Tools.ts",
    anchors: ["dom.create(IkaDocSourcesPanel, ikadocConfig),"],
  },
  {
    file: "app/client/models/entities/ColumnRec.ts",
    anchors: [
      "const isIkaDocLocked = ko.pureComputed(() => isIkaDocLockedColumn(this.table().tableId(), this.colId()));",
      "Boolean(this.summarySourceCol()) || isIkaDocLocked()",
    ],
  },
  {
    file: "app/common/ValueFormatter.ts",
    anchors: ["Choice: ChoiceFormatter,", "ChoiceList: ChoiceListFormatter,"],
  },
  {
    file: "app/client/widgets/ChoiceTextBox.ts",
    anchors: ["invalid: !use(this._choiceValuesSet).has(choice),"],
  },
  {
    file: "app/client/widgets/ChoiceListCell.ts",
    anchors: ["isBlank ? \"[Blank]\" : label ?? String(token),"],
  },
  {
    file: "app/client/widgets/ChoiceEditor.js",
    anchors: [
      "this.choiceText = ikaDocChoiceText(options.field);",
      "return this.choiceText.codeOf(text) ?? text;",
      "!this.choiceText.ikadocOwned",
    ],
  },
  {
    file: "app/client/widgets/ChoiceListEditor.ts",
    anchors: [
      "const choiceText = ikaDocChoiceText(options.field);",
      "const label = choiceText.codeOf(text) ?? text;",
      "!choiceText.ikadocOwned",
    ],
  },
  {
    file: "app/client/ui/ColumnFilterMenu.ts",
    anchors: ["{ label: label(v), count: 0, displayValue: v }", "invalid: !choiceSet.has(choice),"],
  },
  {
    file: "app/client/models/entities/TableRec.ts",
    anchors: ["ikaDocSummaryGroupDescription(labels) ?? summaryGroupByDescription(labels)"],
  },
  {
    file: "app/client/models/entities/ViewSectionRec.ts",
    anchors: [
      "const ikadocTitle = ikaDocDefaultWidgetTitle({",
      "if (ikadocTitle !== undefined) { return ikadocTitle; }",
    ],
  },
  {
    file: "app/client/widgets/FieldBuilder.ts",
    anchors: ["kd.text(() => t(\"Field in {{count}} views\", {"],
  },
  {
    file: "app/client/components/duplicatePage.ts",
    anchors: ["confirmModal(t(\"Duplicate page\"), t(\"Save\")", "cssLabel(t(\"Name\"))"],
  },
  {
    file: "app/client/widgets/DateTextBox.js",
    anchors: ["cssLabel(t(\"Date Format\"))", "defaultLabel: t(\"Mixed format\")"],
  },
  {
    file: "app/client/widgets/DateTimeTextBox.js",
    anchors: ["cssLabel(t(\"Timezone\"))", "cssLabel(t(\"Time Format\"))"],
  },
  {
    file: "app/client/ui2018/search.ts",
    anchors: ["{ \"aria-label\": t(\"Search\") }"],
  },
  {
    file: "app/client/ui/ViewSectionMenu.ts",
    anchors: ["{ \"aria-label\": t(\"Sort and filter\") }", "{ \"aria-label\": t(\"Widget options\") }"],
  },
  {
    file: "app/client/components/buildViewSectionDom.ts",
    anchors: ["{ \"aria-label\": t(\"Widget options\") }"],
  },
  {
    file: "app/client/widgets/NumericSpinner.ts",
    anchors: ["{ \"aria-label\": t(\"Increase\") }", "{ \"aria-label\": t(\"Decrease\") }"],
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
      "ikaDocNewRowValues(this.schemaModel.tableId(), { manualSort: insertPos })",
    ],
  },
  {
    file: "app/client/components/GridView.ts",
    anchors: [
      "{ \"aria-label\": t(\"Select all\") }",
      "{ \"aria-label\": t(\"Column options\") }",
      "ikaDocLockedColumnIcon(this.schemaModel.tableId.peek(), field.colId.peek()),",
      "canEditIkaDocRuntimeCells",
      "canEditIkaDocRuntimeStructure",
      "private _isStructureReadonly: boolean;",
      "!canEditIkaDocRuntimeCells()",
      "!canEditIkaDocRuntimeStructure()",
      "isReadonly: this.isReadonly,",
      "isReadonly: this._isStructureReadonly || this.isPreview",
      "await ikaDocPasteActions(",
      "ikaDocGuidedCellIssue(() => this.schemaModel.tableId(), () => row.id(), () => field.colId())",
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
    anchors: ["isReadonly: boolean;", "if (isReadonly)"],
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
      'canEditStructure ? cssSubTab(t("Sort & filter")',
      'canEditStructure ? cssSubTab(t("Data")',
      "if (!canEditIkaDocRuntimeStructure()) { return null; }",
      'use(this._pageWidgetType) === "chart" && canCreateIkaDocRuntimeCharts()',
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
      "font-family: 'IkaDoc Inter';",
      "font-weight: 100 900;",
      "--gridview-header-height: 42px;",
      "html[data-grist-appearance='dark']",
    ],
  },
  {
    file: "app/client/ui2018/theme.ts",
    anchors: [
      "const ikadocTheme = ikaDocRuntimeTheme();",
      "if (ikadocTheme) { return ikadocTheme; }",
    ],
  },
  {
    file: "app/client/components/ChartView.ts",
    anchors: [
      "colorway: ikaDocChartColorway(name)?.slice() ?? [",
    ],
  },
  {
    file: "app/client/ui/errorPages.ts",
    anchors: [
      "const ikadocRefusal = buildIkaDocRefusalPage();",
    ],
  },
  {
    file: "app/client/ui/AppHeader.ts",
    anchors: [
      "isIkaDocRuntime ? null : this._setHomePageUrl(orgLink)",
      "ikaDocLogoUrl() ?? this._appModel.currentOrg?.orgPrefs?.customLogoUrl",
    ],
  },
  {
    file: "app/common/Themes.ts",
    anchors: [
      "OwarelinLight,",
      "OwarelinDark,",
    ],
  },
] as const;

/** IkaDoc UI files whose texts must be translated; makeT's scope is the file name. */
const IKADOC_TRANSLATED_FILES = [
  "app/client/ui/IkaDocEditorControls.ts",
  "app/client/ui/IkaDocEditorControlState.ts",
  "app/client/ui/IkaDocGuidedWorkspaceControls.ts",
];

describe("IkaDoc client seams", function() {
  for (const seam of CLIENT_SEAMS) {
    it(`keeps IkaDoc runtime UI anchors in ${seam.file}`, function() {
      const source = readSource(seam.file);

      for (const anchor of seam.anchors) {
        assert.include(source, anchor);
      }
    });
  }

  it("lets the native IkaDoc themes own Grist's colors (GW-THM-04)", function() {
    const source = readSource("app/client/ui/IkaDocThemeBridge.ts");

    const forcedGristVariables = source.match(/^\s+--grist-[a-z0-9-]+\s*:/gm) ?? [];
    const hardCodedColors = source.match(/#[0-9a-f]{3,8}\b/gi) ?? [];

    assert.deepEqual(forcedGristVariables, []);
    assert.deepEqual(hardCodedColors, [], "grid colors come from ikadocPalette.ts");
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
    const source = [
      readSource("app/client/ui/IkaDocEditorControls.ts"),
      readSource("app/client/ui/IkaDocGuidedWorkspaceControls.ts"),
    ].join("\n");

    assert.include(source, "postOwarelinRuntimeEvent");
    assert.include(source, "isApply ? urls.applyUrl : urls.validateUrl");
    assert.include(
      source,
      'current.descriptor.marker.finalAction === "APPLY_TO_IKADOC"',
    );
    assert.include(source, "pendingGuidedWorkspaceApplyIdempotencyKeys");
    assert.include(source, "guidedWorkspaceApplyIdempotencyKey(");
    assert.include(source, '"owarelin:guidedWorkspaceValidated"');
    assert.include(source, '"owarelin:guidedWorkspaceApplied"');
    assert.include(source, "guidedWorkspaceResultSummary(result)");
    assert.include(source, 'testId("ikadoc-guided-workspace-apply")');
    assert.include(source, 'testId("ikadoc-guided-workspace-simulate")');
    assert.notInclude(source, "postIkaDocEditorHostEvent");
    assert.notInclude(source, "ikadoc:grist:");
  });

  it("keeps guided workspace setup descriptor-driven", function() {
    const source = readSource("app/ikadoc/IkaDocGuidedWorkspaceSetup.ts");

    assert.include(source, "field.enumValues");
    assert.include(source, "GUIDED_REFERENCE_WIDGET");
    assert.include(source, "GUIDED_JSON_WIDGET");
    assert.include(source, "metadataCode: field.code");
    assert.include(source, "columnLabel: column.label");
    assert.include(source, "label: field.columnLabel");
  });

  it("keeps IkaDoc reference lookup session-scoped and text-backed", function() {
    const runtimeConfig = readSource("app/ikadoc/IkaDocRuntimeConfig.ts");
    const lookup = readSource("app/ikadoc/IkaDocReferenceLookup.ts");
    const userType = readSource("app/client/widgets/UserType.ts");
    const userTypeImpl = readSource("app/client/widgets/UserTypeImpl.ts");

    assert.include(runtimeConfig, "referenceSearchUrl");
    assert.include(runtimeConfig, "referenceResolveUrl");
    assert.include(lookup, "searchIkaDocGuidedReferenceOptions");
    assert.include(lookup, "resolveIkaDocGuidedReferenceOptions");
    assert.include(lookup, "requestIkaDocJson(config, url, { method: \"POST\", body })");
    assert.include(userType, "IkaDocReference");
    assert.include(userType, 'cons: "IkaDocReferenceTextBox"');
    assert.include(userTypeImpl, "IkaDocReferenceEditor");
  });

  it("keeps IkaDoc JSON metadata text-backed and read-only", function() {
    const widget = readSource("app/client/ui/IkaDocJsonWidget.ts");
    const userType = readSource("app/client/widgets/UserType.ts");
    const userTypeImpl = readSource("app/client/widgets/UserTypeImpl.ts");

    assert.include(widget, "IkaDocJsonTextBox");
    assert.include(widget, "IkaDocJsonEditor");
    assert.include(widget, "formatJsonCellValue");
    assert.include(userType, "IkaDocJson");
    assert.include(userType, 'editCons: "IkaDocJsonEditor"');
    assert.include(userTypeImpl, "IkaDocJsonTextBox");
  });

  it("translates every IkaDoc editor control text in the supported runtime locales", function() {
    const localeFiles = [
      "static/locales/en.client.json",
      "static/locales/en_GB.client.json",
      "static/locales/fr.client.json",
    ];

    for (const file of IKADOC_TRANSLATED_FILES) {
      const scope = file.replace(/^.*\//, "").replace(/\.ts$/, "");
      const keys = [...readSource(file).matchAll(/\bt\("((?:[^"\\]|\\.)*)"/g)].map(match => match[1]);
      assert.isNotEmpty(keys, `${file} has no translated text`);

      for (const localeFile of localeFiles) {
        const translations: Record<string, string> = JSON.parse(readSource(localeFile))[scope] ?? {};

        for (const key of keys) {
          const translated = translations[key] ?? translations[`${key}_other`] ?? "";
          assert.isNotEmpty(translated, `${localeFile} does not translate "${key}" (${scope})`);
        }
      }
    }
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
