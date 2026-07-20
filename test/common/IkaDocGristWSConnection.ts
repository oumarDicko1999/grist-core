import { GristClientSocket } from "app/client/components/GristClientSocket";
import { GristWSConnection, GristWSSettings } from "app/client/components/GristWSConnection";
import { setGlobals } from "app/client/lib/browserGlobals";
import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";

import { assert } from "chai";

const IKA_DOC_WORKER_URL = "https://records.owarelin.localhost/ikadoc/sessions/session-1/worker";

describe("IkaDoc GristWSConnection", function() {
  it("uses the explicit IkaDoc worker URL without adding an org path", async function() {
    const capturedUrls: string[] = [];
    const windowGlobal = {
      location: {
        href: "https://records.owarelin.localhost/grist/editor/session-1",
      },
      gristConfig: {
        getWorker: { "doc-1": IKA_DOC_WORKER_URL },
        timestampMs: Date.now(),
        assignmentId: "doc-1",
        ikadoc: {
          enabled: true,
          sessionId: "session-1",
          collectionCode: "records",
          user: {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            email: "alice@example.test",
          },
          sourceType: "document-file",
          mode: "editor",
          expiresAt: "2099-01-01T00:00:00.000Z",
          documentId: "doc-1",
          documentUrlId: "doc-url-1",
          workerUrl: IKA_DOC_WORKER_URL,
          statusUrl: "/ikadoc/sessions/session-1/status",
          validationUrl: "/ikadoc/editor/session-validation",
          discardUrl: "/ikadoc/sessions/session-1/discard",
          capabilities: DENIED_IKADOC_CAPABILITIES,
          locale: "en",
        },
      },
    } as unknown as Window & typeof globalThis;
    const writableGlobal = globalThis as typeof globalThis & {
      window?: Window & typeof globalThis;
    };
    const oldWindow = writableGlobal.window;
    const oldGlobals = setGlobals({
      window: windowGlobal,
    });
    writableGlobal.window = windowGlobal;

    try {
      const connection = GristWSConnection.create(null, makeSettings(capturedUrls));
      connection.initialize("doc-1");

      await waitForCondition(() => capturedUrls.length === 1);

      const websocketUrl = new URL(capturedUrls[0]);
      const workerUrl = new URL(IKA_DOC_WORKER_URL);
      assert.equal(websocketUrl.protocol, "wss:");
      assert.equal(websocketUrl.host, workerUrl.host);
      assert.equal(websocketUrl.pathname, workerUrl.pathname);
      assert.notInclude(websocketUrl.pathname, "/o/");
      connection.dispose();
    } finally {
      setGlobals(oldGlobals);
      writableGlobal.window = oldWindow;
    }
  });
});

function makeSettings(capturedUrls: string[]): GristWSSettings {
  return {
    makeWebSocket(url: string): GristClientSocket {
      capturedUrls.push(url);
      return new FakeGristClientSocket() as unknown as GristClientSocket;
    },
    async getTimezone() {
      return "UTC";
    },
    getPageUrl() {
      return "https://records.owarelin.localhost/grist/editor/session-1";
    },
    async getDocWorkerUrl() {
      return IKA_DOC_WORKER_URL;
    },
    getClientId() {
      return null;
    },
    getUserSelector() {
      return "";
    },
    updateClientId() {},
    advanceCounter() {
      return "0";
    },
    log() {},
    warn() {},
  };
}

class FakeGristClientSocket {
  public onmessage: null | ((data: string) => void) = null;
  public onopen: null | (() => void) = null;
  public onerror: null | ((err: Error) => void) = null;
  public onclose: null | (() => void) = null;

  public close() {}
  public send() {}
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let index = 0; index < 50; index++) {
    if (condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Condition not met");
}
