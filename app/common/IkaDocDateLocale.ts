/**
 * GW-SHL-03: date cells name months in the document's language (« 21 oct. 2026 ») instead of
 * Grist's English. Only the display changes: editors and parsing keep Grist's English formats.
 */
import moment from "moment-timezone";
import "moment/locale/fr";

// Registering a moment locale also makes it the global one; Grist's parsing relies on English.
moment.locale("en");

/** Languages IkaDoc writes documents in, besides moment's default English. */
const IKADOC_DATE_LANGUAGES: ReadonlySet<string> = new Set(["fr"]);

/** The moment locale for [documentLocale] (e.g. "fr-FR" -> "fr"); English for anything else. */
export function ikaDocDateLocale(documentLocale: string): string {
  const language = documentLocale.split(/[-_]/)[0].toLowerCase();

  return IKADOC_DATE_LANGUAGES.has(language) ? language : "en";
}
