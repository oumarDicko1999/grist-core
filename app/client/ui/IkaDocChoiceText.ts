import { ViewFieldRec } from "app/client/models/entities/ViewFieldRec";
import { IKADOC_CHOICE_LABELS_OPTION, ikaDocChoiceLabel } from "app/common/IkaDocChoiceLabels";

/** How the choice editors show an IkaDoc choice column: labels shown, codes stored (GW-COL-04). */
export interface IkaDocChoiceText {
  /** True when IkaDoc owns the column's values: the editor offers them only, never a new one. */
  ikadocOwned: boolean;

  /** The label shown for [code]; undefined when the column has no IkaDoc labels. */
  label(code: string): string | undefined;

  /** The code whose label is [text], so a label typed by hand saves the code. */
  codeOf(text: string): string | undefined;
}

/** Seam for ChoiceEditor and ChoiceListEditor: the field's labels in the document's language. */
export function ikaDocChoiceText(field: ViewFieldRec): IkaDocChoiceText {
  const formatter = field.formatter.peek();
  const widgetOptions = field.widgetOptionsJson.peek();
  const choices: string[] = widgetOptions.choices || [];

  const label = (code: string) => ikaDocChoiceLabel(formatter.widgetOpts, code, formatter.docSettings.locale);

  return {
    ikadocOwned: Boolean(widgetOptions[IKADOC_CHOICE_LABELS_OPTION]),
    label,
    codeOf: text => choices.find(code => label(code) === text),
  };
}
