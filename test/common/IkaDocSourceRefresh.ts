import { IkaDocRequestError } from "app/ikadoc/IkaDocRequest";
import {
  IKADOC_REMOVAL_UNDECIDED_CODE,
  IkaDocRefreshBody,
  IkaDocRemovedRowsDecision,
  ikaDocUndecidedRemovedRows,
  refreshWithRemovalDecision,
} from "app/ikadoc/IkaDocSourceRefresh";

import { assert } from "chai";

const UNDECIDED = new IkaDocRequestError(400, "undecided", IKADOC_REMOVAL_UNDECIDED_CODE, { removedRows: "3" });

/** GW-RFR-01: rows whose records are gone leave the table only once the person agrees. */
describe("IkaDocSourceRefresh", function() {
  /** A refresh endpoint that wants a decision while rows would go, and records every body sent. */
  function endpoint() {
    const sent: IkaDocRefreshBody[] = [];
    const send = async (body: IkaDocRefreshBody) => {
      sent.push(body);
      if (!body.removedRows) {
        throw UNDECIDED;
      }
    };

    return { sent, send };
  }

  it("refreshes at once when nothing would be removed", async function() {
    const sent: IkaDocRefreshBody[] = [];
    let asked = false;

    const outcome = await refreshWithRemovalDecision(
      async (body) => { sent.push(body); },
      async () => { asked = true; return "remove"; },
    );

    assert.equal(outcome, "refreshed");
    assert.deepEqual(sent, [{}]);
    assert.isFalse(asked);
  });

  for (const decision of ["remove", "keep"] as IkaDocRemovedRowsDecision[]) {
    it(`asks with the number of rows, then refreshes again to ${decision} them`, async function() {
      const { sent, send } = endpoint();
      let askedFor: number | undefined;

      const outcome = await refreshWithRemovalDecision(send, async (count) => {
        askedFor = count;
        return decision;
      });

      assert.equal(outcome, "refreshed");
      assert.equal(askedFor, 3);
      assert.deepEqual(sent, [{}, { removedRows: decision }]);
    });
  }

  it("changes nothing when the person cancels the warning", async function() {
    const { sent, send } = endpoint();

    const outcome = await refreshWithRemovalDecision(send, async () => undefined);

    assert.equal(outcome, "cancelled");
    assert.deepEqual(sent, [{}]);
  });

  it("passes any other refusal on without asking", async function() {
    const denied = new IkaDocRequestError(403, "Access denied", "PERMISSION_DENIED");
    let asked = false;

    const outcome = await refreshWithRemovalDecision(
      async () => { throw denied; },
      async () => { asked = true; return "remove"; },
    ).then(() => undefined, (error: unknown) => error);

    assert.strictEqual(outcome, denied);
    assert.isFalse(asked);
  });

  it("reads the count only from IkaDoc's undecided-removal answer", function() {
    assert.equal(ikaDocUndecidedRemovedRows(UNDECIDED), 3);
    const otherCode = new IkaDocRequestError(400, "other", "OTHER", { removedRows: "3" });
    const noCount = new IkaDocRequestError(400, "bad", IKADOC_REMOVAL_UNDECIDED_CODE, {});

    assert.isUndefined(ikaDocUndecidedRemovedRows(otherCode));
    assert.isUndefined(ikaDocUndecidedRemovedRows(noCount));
    assert.isUndefined(ikaDocUndecidedRemovedRows(new Error("network")));
  });
});
