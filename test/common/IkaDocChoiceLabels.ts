import { ikaDocChoiceLabel } from "app/common/IkaDocChoiceLabels";
import { createFormatter } from "app/common/ValueFormatter";

import { assert } from "chai";

const LABELS = {
  choices: ["PAID", "LATE"],
  ikadocChoiceLabels: {
    PAID: { fr: "Payée", en: "Paid" },
    LATE: { en: "Late" },
  },
};

const FRENCH = { locale: "fr-FR" };
const ENGLISH = { locale: "en-US" };

/** GW-COL-04: IkaDoc choices store the code and show the label in the document's language. */
describe("IkaDocChoiceLabels", function() {
  it("shows the label in the document's language", function() {
    assert.equal(createFormatter("Choice", LABELS, FRENCH).formatAny("PAID"), "Payée");
    assert.equal(createFormatter("Choice", LABELS, ENGLISH).formatAny("PAID"), "Paid");
  });

  it("falls back to English, then shows the code when IkaDoc gave no label", function() {
    assert.equal(createFormatter("Choice", LABELS, FRENCH).formatAny("LATE"), "Late");
    assert.equal(createFormatter("Choice", LABELS, FRENCH).formatAny("UNKNOWN"), "UNKNOWN");
  });

  it("shows each label of a choice list", function() {
    const formatter = createFormatter("ChoiceList", LABELS, FRENCH);

    assert.equal(formatter.formatAny(["L", "PAID", "LATE"]), "Payée, Late");
  });

  it("leaves Grist's own choice columns unchanged", function() {
    const plain = { choices: ["Payée", "En retard"] };

    const choice = createFormatter("Choice", plain, FRENCH);
    const choiceList = createFormatter("ChoiceList", plain, FRENCH);

    assert.equal(choice.formatAny("Payée"), "Payée");
    assert.equal(choice.formatAny(null), "");
    assert.equal(choiceList.formatAny(["L", "Payée", "En retard"]), "Payée, En retard");
  });

  it("ignores labels for values that are not text", function() {
    assert.isUndefined(ikaDocChoiceLabel(LABELS, 3, "fr"));
    assert.isUndefined(ikaDocChoiceLabel({ ikadocChoiceLabels: "broken" }, "PAID", "fr"));
  });
});
