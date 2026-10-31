import { IkaDocRequestError, requestIkaDocJson } from "app/ikadoc/IkaDocRequest";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { assert } from "chai";

type WritableGlobal = typeof globalThis & { window?: Window & typeof globalThis };

const CONFIG = { collectionCode: "records" } as IkaDocRuntimeConfig;

/** The one way the editor calls IkaDoc: the person's cookies, the collection, JSON both ways. */
describe("IkaDocRequest", function() {
  const writableGlobal = globalThis as WritableGlobal;
  let oldWindow: WritableGlobal["window"];
  let sent: { url: string; init: RequestInit }[];

  function answer(status: number, payload: unknown) {
    sent = [];
    writableGlobal.window = {
      fetch: async (url: string, init: RequestInit) => {
        sent.push({ url, init });

        return new Response(JSON.stringify(payload), { status });
      },
    } as unknown as Window & typeof globalThis;
  }

  beforeEach(function() {
    oldWindow = writableGlobal.window;
  });

  afterEach(function() {
    writableGlobal.window = oldWindow;
  });

  it("sends JSON with the person's cookies and the session's collection", async function() {
    answer(200, { ok: true });

    const payload = await requestIkaDocJson(CONFIG, "/ikadoc/rows", { method: "POST", body: { tableId: "Factures" } });

    const { init } = sent[0];
    const headers = new Headers(init.headers);

    assert.deepEqual(payload, { ok: true });
    assert.equal(init.credentials, "include");
    assert.equal(headers.get("X-Collection"), "records");
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(init.body, JSON.stringify({ tableId: "Factures" }));
  });

  it("sends no body on a GET", async function() {
    answer(200, { status: "OPEN" });

    await requestIkaDocJson(CONFIG, "/ikadoc/status", { method: "GET" });

    assert.isUndefined(sent[0].init.body);
    assert.isNull(new Headers(sent[0].init.headers).get("Content-Type"));
  });

  it("reports IkaDoc's refusal with its status and message", async function() {
    answer(409, { error: "Le document a changé" });

    const error = await refusalOf(requestIkaDocJson(CONFIG, "/ikadoc/rows", { method: "POST" }));

    assert.equal(error.status, 409);
    assert.equal(error.ikadocMessage, "Le document a changé");
  });

  it("reports a refusal without a message as status only", async function() {
    answer(500, "not json");

    const error = await refusalOf(requestIkaDocJson(CONFIG, "/ikadoc/rows", { method: "POST" }));

    assert.equal(error.status, 500);
    assert.isUndefined(error.ikadocMessage);
  });
});

/** The IkaDocRequestError a request ended with; fails the test when it succeeded or failed otherwise. */
async function refusalOf(request: Promise<unknown>): Promise<IkaDocRequestError> {
  const outcome = await request.then(() => undefined, (error: unknown) => error);
  assert.instanceOf(outcome, IkaDocRequestError);

  return outcome as IkaDocRequestError;
}
