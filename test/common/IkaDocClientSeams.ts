import { assert } from "chai";
import { readFileSync } from "fs";
import { resolve } from "path";

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
    file: "app/client/ui/TopBar.ts",
    anchors: [
      "buildIkaDocEditorControls",
      "postOwarelinRuntimeEvent(ikadocConfig, \"owarelin:documentDirty\")",
    ],
  },
  {
    file: "app/client/ui/ShareMenu.ts",
    anchors: [
      "if (getGristConfig().ikadoc) {",
      "return null;",
    ],
  },
  {
    file: "app/client/ui/IkaDocThemeBridge.ts",
    anchors: [
      "data-ikadoc-runtime='true'",
	      "--grist-theme-bg:",
	      "--ow-color-primary:",
	      "--grist-theme-control-border-radius:",
	      "data-grist-appearance='dark'",
	    ],
  },
] as const;

const IKADOC_EDITOR_CONTROL_KEYS = [
  "Build proposal",
  "Building IkaDoc proposal",
  "Checking IkaDoc session",
  "IkaDoc proposal requested",
  "IkaDoc request failed",
  "IkaDoc source refreshed",
  "Refresh",
  "Refreshing IkaDoc source",
  "{{sourceSummary}}IkaDoc session ready",
  "{{sourceSummary}}IkaDoc session: {{status}}",
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

  it("keeps the IkaDoc tools panel limited to document history", function() {
    const source = readSource("app/client/ui/Tools.ts");
    const ikadocBranchIndex = source.indexOf("if (ikadocConfig) {\n    return cssTools");
    const normalAssistantIndex = source.indexOf("buildOpenAssistantButton(gristDoc");

    assert.isAtLeast(ikadocBranchIndex, 0);
    assert.isAbove(normalAssistantIndex, ikadocBranchIndex);
    assert.include(source, "cssLinkText(t(\"Document history\"))");
    assert.include(source, "testId(\"log\")");
  });

  it("keeps IkaDoc save and discard owned by the host page", function() {
    const source = readSource("app/client/ui/IkaDocEditorControls.ts");

    assert.notInclude(source, "testId(\"ikadoc-editor-save\")");
    assert.notInclude(source, "testId(\"ikadoc-editor-discard\")");
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

      assert.isObject(controls, `${localeFile} is missing IkaDocEditorControls`);
      for (const key of IKADOC_EDITOR_CONTROL_KEYS) {
        assert.isString(controls[key], `${localeFile} is missing ${key}`);
        assert.isAbove(controls[key].length, 0, `${localeFile} has an empty ${key}`);
      }
    }
  });
});

function readSource(file: string): string {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}
