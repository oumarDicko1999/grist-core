import { ikaDocDateLocale } from "app/common/IkaDocDateLocale";
import { parseDate } from "app/common/parseDate";
import { createFormatter } from "app/common/ValueFormatter";

import { assert } from "chai";

/** 2026-10-21 00:00 UTC, as Grist stores dates (seconds). */
const OCTOBER_21 = Date.UTC(2026, 9, 21) / 1000;
const AUGUST_21 = Date.UTC(2026, 7, 21) / 1000;

/** GW-SHL-03: date cells name months in the document's language; numbers and parsing are untouched. */
describe("IkaDocDateLocale", function() {
  it("names months in French for a French document", function() {
    const formatter = createFormatter("Date", { dateFormat: "D MMM YYYY" }, { locale: "fr-FR" });

    assert.equal(formatter.formatAny(OCTOBER_21), "21 oct. 2026");
  });

  it("keeps Grist's English for other documents", function() {
    const formatter = createFormatter("Date", { dateFormat: "D MMM YYYY" }, { locale: "en-US" });

    assert.equal(formatter.formatAny(OCTOBER_21), "21 Oct 2026");
  });

  it("leaves numeric formats unchanged", function() {
    const formatter = createFormatter("Date", { dateFormat: "DD/MM/YYYY" }, { locale: "fr-FR" });

    assert.equal(formatter.formatAny(OCTOBER_21), "21/10/2026");
  });

  it("keeps parsing typed dates with Grist's English month names", function() {
    // August differs between English and French (« août »), unlike October.
    assert.equal(parseDate("21 Aug 2026", { dateFormat: "D MMM YYYY" }), AUGUST_21);
  });

  it("maps unsupported languages to English", function() {
    assert.equal(ikaDocDateLocale("de-DE"), "en");
    assert.equal(ikaDocDateLocale("fr_CA"), "fr");
  });
});
