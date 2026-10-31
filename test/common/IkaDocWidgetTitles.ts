import { ikaDocDefaultWidgetTitle, ikaDocSummaryGroupDescription } from "app/client/ui/IkaDocWidgetTitles";

import { assert } from "chai";
import { popGlobals, pushGlobals } from "grainjs/dist/cjs/lib/browserGlobals";
import { JSDOM } from "jsdom";

type WritableGlobal = typeof globalThis & { window?: Window & typeof globalThis };

/** GW-SHL-06: auto-generated titles read naturally in IkaDoc sessions, without "[by …]". */
describe("IkaDocWidgetTitles", function() {
  const writableGlobal = globalThis as WritableGlobal;
  let oldWindow: WritableGlobal["window"];

  // Grist's translator checks its arguments against grainjs's browser Node class.
  function withGristConfig(gristConfig: object) {
    const { window } = new JSDOM("<!doctype html><html><body></body></html>");
    Object.assign(window, { gristConfig });

    writableGlobal.window = window as unknown as Window & typeof globalThis;
    pushGlobals(window as unknown as Window & typeof globalThis);
  }

  beforeEach(function() {
    oldWindow = writableGlobal.window;
  });

  afterEach(function() {
    writableGlobal.window = oldWindow;
    popGlobals();
  });

  it("keeps Grist's own wording outside IkaDoc", function() {
    withGristConfig({});

    assert.isUndefined(ikaDocSummaryGroupDescription(["Statut"]));
    assert.isUndefined(ikaDocDefaultWidgetTitle({ tableName: "Factures", groupDescription: "", widgetType: "" }));
  });

  it("describes the grouping without brackets in IkaDoc sessions", function() {
    withGristConfig({ ikadoc: { enabled: true } });

    const grouped = ikaDocSummaryGroupDescription(["Statut", "Client"]) ?? "";
    const totals = ikaDocSummaryGroupDescription([]) ?? "";

    assert.include(grouped, "Statut, Client");
    assert.notInclude(grouped, "[");
    assert.isNotEmpty(totals);
    assert.notInclude(totals, "[");
  });

  it("keeps the table name's case and separates the widget type", function() {
    withGristConfig({ ikadoc: { enabled: true } });

    const title = ikaDocDefaultWidgetTitle({
      tableName: "Factures",
      groupDescription: "par Statut",
      widgetType: "Graphique",
    });

    assert.equal(title, "Factures par Statut · Graphique");
  });

  it("leaves the separator out for plain tables", function() {
    withGristConfig({ ikadoc: { enabled: true } });

    assert.equal(ikaDocDefaultWidgetTitle({ tableName: "Factures", groupDescription: "", widgetType: "" }), "Factures");
  });
});
