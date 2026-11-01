/**
 * GW-COL-04: IkaDoc choice columns store IkaDoc's code and show its label in the document's
 * language. IkaDoc writes the labels into the column's widget options when it materializes:
 *
 *   ikadocChoiceLabels: { "PAID": { "fr": "Payée", "en": "Paid" } }
 *
 * Formulas, sorting, filters' values and storage keep the code; only what is shown changes.
 * Choice columns without these labels show their values as Grist always does.
 */
export const IKADOC_CHOICE_LABELS_OPTION = "ikadocChoiceLabels";

/** The label of [code] in [locale]'s language, else English, else any; undefined without a label. */
export function ikaDocChoiceLabel(widgetOpts: object, code: unknown, locale: string): string | undefined {
  const labels = (widgetOpts as Record<string, unknown>)[IKADOC_CHOICE_LABELS_OPTION];
  if (typeof code !== "string" || !isRecord(labels)) {
    return undefined;
  }

  const byLanguage = labels[code];
  if (!isRecord(byLanguage)) {
    return undefined;
  }

  const language = locale.split(/[-_]/)[0].toLowerCase();
  const label = byLanguage[language] ?? byLanguage.en ?? Object.values(byLanguage)[0];

  return typeof label === "string" && label.length > 0 ? label : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
