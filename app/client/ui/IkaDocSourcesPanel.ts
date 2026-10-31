import { makeT } from "app/client/lib/localization";
import { canRefreshIkaDocRuntimeSource } from "app/client/ui/IkaDocRuntimeAccess";
import { cssSectionHeader, cssSectionHeaderText } from "app/client/ui/LeftPanelCommon";
import { textButton } from "app/client/ui2018/buttons";
import { theme, vars } from "app/client/ui2018/cssVars";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { IkaDocSessionSource, IkaDocSourceOrigin, parseIkaDocSessionSources } from "app/ikadoc/IkaDocSessionSources";
import { postOwarelinRuntimeEvent } from "app/ikadoc/OwarelinRuntimeEvents";

import { Disposable, dom, DomContents, makeTestId, Observable, styled } from "grainjs";

const t = makeT("IkaDocSourcesPanel");
const testId = makeTestId("test-ikadoc-sources-");

/**
 * GW-SRC-10 / GW-RFR-05: the left panel's list of IkaDoc sources, with the records that
 * changed since each snapshot. IkaDoc refreshes; this panel only asks the IkaDoc page to.
 */
export class IkaDocSourcesPanel extends Disposable {
  private readonly _sources: Observable<IkaDocSessionSource[]>;

  /** Records changed since the snapshot, per source id, as IkaDoc last reported. */
  private readonly _changedCounts = Observable.create<Record<string, number>>(this, {});

  constructor(private readonly _config: IkaDocRuntimeConfig) {
    super();

    this._sources = Observable.create(this, _config.sources ?? []);

    this._listen("owarelin:sourcesChanged", (detail) => {
      const sources = parseIkaDocSessionSources(detail.sources);
      if (sources === undefined || sources === "invalid") {
        return;
      }

      // A new snapshot replaces the counts IkaDoc reported for the previous one.
      this._sources.set(sources);
      this._changedCounts.set({});
    });

    this._listen("owarelin:sourceRecordsChanged", (detail) => {
      const { sourceId, changedCount } = detail;
      if (typeof sourceId !== "string" || !Number.isInteger(changedCount) || (changedCount as number) < 0) {
        return;
      }

      this._changedCounts.set({ ...this._changedCounts.get(), [sourceId]: changedCount as number });
    });
  }

  public buildDom(): DomContents {
    return dom.maybe(use => use(this._sources).length > 0, () => [
      cssSectionHeader(cssSectionHeaderText(t("SOURCES"))),

      dom.forEach(this._sources, source => this._buildSource(source)),
    ]);
  }

  private _buildSource(source: IkaDocSessionSource) {
    const locale = this._config.locale;

    const rows = t("{{formatted}} rows", { count: source.rowCount, formatted: formatCount(source.rowCount, locale) });
    const snapshot = t("snapshot {{time}}", { time: formatTime(source.snapshotAt, locale) });

    // The panel is narrow: lines are cut with an ellipsis and the full text shows on hover.
    const origin = `${originLabel(source.origin)} · ${source.scope}`;
    const details = `${rows} · ${snapshot}`;

    return cssSource(
      testId("source"),

      cssSourceLabel(source.label, { title: source.label }, testId("label")),
      cssSourceDetail(origin, { title: origin }),
      cssSourceDetail(details, { title: details }, testId("snapshot")),

      dom.domComputed(use => use(this._changedCounts)[source.sourceId] ?? 0, changed =>
        changed > 0 ? this._buildChangedNotice(source, changed) : null,
      ),
    );
  }

  private _buildChangedNotice(source: IkaDocSessionSource, changed: number) {
    const canRefresh = canRefreshIkaDocRuntimeSource(this._config);

    return cssChanged(
      { role: "status" },
      testId("changed"),

      t("{{count}} records changed since the snapshot", { count: changed }),

      canRefresh ? textButton(
        t("Refresh"),
        dom.on("click", () => postOwarelinRuntimeEvent(this._config, "owarelin:refreshRequested", {
          sourceId: source.sourceId,
        })),
        testId("refresh"),
      ) : null,
    );
  }

  /** Host events arrive as window events named after their type (OwarelinRuntimeEvents). */
  private _listen(type: string, onDetail: (detail: Record<string, unknown>) => void) {
    const listener = (event: Event) => {
      const runtimeEvent = (event as CustomEvent<{ detail?: Record<string, unknown> }>).detail;
      onDetail(runtimeEvent?.detail ?? {});
    };

    window.addEventListener(type, listener);
    this.onDispose(() => window.removeEventListener(type, listener));
  }
}

function originLabel(origin: IkaDocSourceOrigin): string {
  switch (origin) {
    case "saved-search": return t("Saved search");
    case "query": return t("Query");
    case "selection": return t("Selected records");
    case "document": return t("Document");
  }
}

function formatCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

function formatTime(isoTime: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(isoTime));
}

const cssSource = styled("div", `
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 8px 8px 16px;
  padding: 8px 12px;
  border-radius: 12px;
  background-color: ${theme.pageHoverBg};
`);

const cssSourceLabel = styled("div", `
  color: ${theme.text};
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`);

const cssSourceDetail = styled("div", `
  color: ${theme.lightText};
  font-size: ${vars.smallFontSize};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`);

const cssChanged = styled("div", `
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 4px;
  color: ${theme.text};
  font-size: ${vars.smallFontSize};
  font-weight: 600;
`);
