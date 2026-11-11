import { parseIkaDocProposalIssues } from "app/ikadoc/IkaDocProposalIssues";

import { assert } from "chai";

/** GW-COL-05: the cells IkaDoc refused when applying a proposal become grid markers. */
describe("IkaDocProposalIssues", function() {
  it("marks each refused cell by table, row and column", function() {
    const result = parseIkaDocProposalIssues({
      issues: [{ tableId: "Factures", rowId: 4, columnId: "montant", message: "Montant négatif" }],
    });

    assert.deepEqual(result.errors, [
      { schemaType: "", tableId: "Factures", gristRowId: 4, metadataCode: "montant", message: "Montant négatif" },
    ]);
    assert.isEmpty(result.warnings);
  });

  it("drops entries that do not name a cell", function() {
    const result = parseIkaDocProposalIssues({
      issues: [
        { tableId: "Factures", rowId: 4, message: "no column" },
        { tableId: "Factures", rowId: "4", columnId: "montant", message: "row as text" },
        "not an issue",
      ],
    });

    assert.isEmpty(result.errors);
  });

  it("clears the markers when the host sends no issues", function() {
    assert.isEmpty(parseIkaDocProposalIssues({}).errors);
  });
});
