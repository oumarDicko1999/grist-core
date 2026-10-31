import { parseIkaDocSessionSources } from "app/ikadoc/IkaDocSessionSources";

import { assert } from "chai";

const SOURCE = {
  sourceId: "source-factures",
  tableId: "Factures",
  label: "Factures",
  origin: "saved-search" as const,
  scope: "Recherche « Factures 2026 »",
  rowCount: 60,
  snapshotAt: "2026-10-31T11:24:00.000Z",
};

/** GW-SRC-10: the sources IkaDoc describes are read strictly, never half-trusted. */
describe("IkaDocSessionSources", function() {
  it("reads the sources IkaDoc describes", function() {
    assert.deepEqual(parseIkaDocSessionSources([SOURCE]), [SOURCE]);
  });

  it("treats a missing list as no sources", function() {
    assert.isUndefined(parseIkaDocSessionSources(undefined));
  });

  it("rejects the whole list when one source is malformed", function() {
    const malformed = [
      { ...SOURCE, origin: "spreadsheet" },
      { ...SOURCE, rowCount: -1 },
      { ...SOURCE, rowCount: 2.5 },
      { ...SOURCE, snapshotAt: "yesterday" },
      { ...SOURCE, label: "" },
    ];

    for (const source of malformed) {
      assert.equal(parseIkaDocSessionSources([SOURCE, source]), "invalid", JSON.stringify(source));
    }

    assert.equal(parseIkaDocSessionSources(SOURCE), "invalid");
  });
});
