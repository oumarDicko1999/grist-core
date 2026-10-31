import { parseIkaDocReferenceLookupResponse } from "app/ikadoc/IkaDocReferenceLookup";

import { assert } from "chai";

describe("IkaDocReferenceLookup", function() {
  it("parses backend-issued reference lookup options", function() {
    assert.deepEqual(
      parseIkaDocReferenceLookupResponse({
        items: [
          {
            id: "92f7c6cc-6af7-4ec7-a8df-5347257077d1",
            schemaType: "administrativeUnit",
            schemaCode: "administrativeUnit_default",
            label: "Finance",
            secondaryLabel: "FIN",
            contextLabel: "administrativeUnit ...077d1",
            canOpen: false,
          },
        ],
      }),
      [
        {
          id: "92f7c6cc-6af7-4ec7-a8df-5347257077d1",
          schemaType: "administrativeUnit",
          schemaCode: "administrativeUnit_default",
          label: "Finance",
          secondaryLabel: "FIN",
          contextLabel: "administrativeUnit ...077d1",
          canOpen: false,
        },
      ],
    );
  });

  it("rejects malformed reference lookup responses", function() {
    assert.throws(() => parseIkaDocReferenceLookupResponse({ items: "broken" }));
    assert.throws(() => parseIkaDocReferenceLookupResponse({ items: [{ id: "broken" }] }));
    assert.throws(() => parseIkaDocReferenceLookupResponse(undefined));
  });
});
