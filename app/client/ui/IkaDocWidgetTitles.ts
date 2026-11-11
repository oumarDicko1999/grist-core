import { makeT } from "app/client/lib/localization";
import { getGristConfig } from "app/common/urlUtils";

const t = makeT("IkaDocWidgetTitles");

/**
 * Seam for summary and chart titles (TableRec.groupDesc, GW-SHL-06).
 * In an IkaDoc session the grouping reads "par Statut" or "totaux" in the session's
 * language, instead of Grist's untranslated "[by Statut]" and "[Totals]".
 * Undefined outside IkaDoc, where Grist keeps its own wording.
 */
export function ikaDocSummaryGroupDescription(groupByColumnLabels: string[]): string | undefined {
  if (!getGristConfig().ikadoc) {
    return undefined;
  }

  if (groupByColumnLabels.length === 0) {
    return t("totals");
  }

  return t("by {{columns}}", { columns: groupByColumnLabels.join(", ") });
}

/**
 * Seam for default widget titles (ViewSectionRec.defaultWidgetTitle, GW-SHL-06).
 * IkaDoc writes "Factures par Statut · Graphique" where Grist writes "FACTURES [by Statut] CHART".
 * Undefined outside IkaDoc.
 */
export function ikaDocDefaultWidgetTitle(parts: {
  tableName: string | undefined;
  groupDescription: string;
  widgetType: string;
}): string | undefined {
  if (!getGristConfig().ikadoc) {
    return undefined;
  }

  const name = [parts.tableName, parts.groupDescription]
    .filter(part => Boolean(part?.trim()))
    .join(" ");

  return parts.widgetType ? `${name} · ${parts.widgetType}` : name;
}
