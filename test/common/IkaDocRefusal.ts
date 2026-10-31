import { ikaDocRefusalKind } from "app/ikadoc/IkaDocRefusal";

import { assert } from "chai";

/** GW-SHL-02: each refusal page explains what actually happened. */
describe("IkaDoc refusal page", function() {
  it("explains an ended session from IkaDoc's admission code", function() {
    assert.equal(ikaDocRefusalKind("session-expired", undefined), "session-expired");
    assert.equal(ikaDocRefusalKind("session-revoked", undefined), "session-expired");
    assert.equal(ikaDocRefusalKind("session-not-found", undefined), "session-expired");
  });

  it("explains changed access from IkaDoc's admission code", function() {
    assert.equal(ikaDocRefusalKind("permission-denied", undefined), "access-changed");
    assert.equal(ikaDocRefusalKind("actor-mismatch", undefined), "access-changed");
  });

  it("explains an unavailable service from IkaDoc's admission code", function() {
    assert.equal(ikaDocRefusalKind("backend-unavailable", undefined), "service-unavailable");
    assert.equal(ikaDocRefusalKind("module-disabled", undefined), "service-unavailable");
  });

  it("recognizes an expired session refused by the runtime itself", function() {
    const message = "This Grist session does not allow use expired runtime session.";

    assert.equal(ikaDocRefusalKind(undefined, message), "session-expired");
  });

  it("treats any other refusal as a page that is not available here", function() {
    const message = "This Grist session does not allow use Grist outside an IkaDoc session.";

    assert.equal(ikaDocRefusalKind(undefined, message), "page-unavailable");
    assert.equal(ikaDocRefusalKind(undefined, undefined), "page-unavailable");
  });
});
