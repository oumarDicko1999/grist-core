import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import {
  assertIkaDocUserActionsAllowedForDocument,
  denyIkaDocRuntimeOperationForDocument,
  IkaDocRuntimeSessionValidator,
  requireIkaDocRuntimeCapabilityForDocument,
  validateIkaDocRuntimeSessionForDocument,
} from "app/server/lib/IkaDocRuntimePolicy";
import log from "app/server/lib/log";

import type { Client } from "app/server/lib/Client";
import type { DocSession } from "app/server/lib/DocSession";
import type { DocApiUsageTracker } from "app/server/lib/DocApiUsageTracker";
import type { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

export interface IkaDocActiveDocMethodPolicy {
  operation: string;
  capability?: keyof IkaDocCapabilities;
}

type ActiveDocMethod = (docSession: DocSession, ...args: unknown[]) => Promise<unknown> | unknown;

interface ActiveDocMethodHost {
  [methodName: string]: ActiveDocMethod;
}

/**
 * Translates calls from the browser client into calls of the form
 * `activeDoc.method(docSession, ...args)`.
 *
 * When a tracker is provided and the client authenticated via API key,
 * enforces the same parallel and daily usage limits as the REST API.
 */
export function activeDocMethod(
  tracker: DocApiUsageTracker | undefined,
  ikadocRuntimeSessionRegistry: IkaDocRuntimeSessionRegistry | undefined,
  ikadocRuntimeSessionValidator: IkaDocRuntimeSessionValidator | undefined,
  role: "viewers" | "editors" | "owners" | null,
  methodName: string,
  ikadocPolicy?: IkaDocActiveDocMethodPolicy,
) {
  return async (
    client: Client,
    docFD: number,
    ...args: unknown[]
  ): Promise<unknown> => {
    const docSession = client.getDocSession(docFD);
    const activeDoc = docSession.activeDoc;
    const method = (activeDoc as unknown as ActiveDocMethodHost)[methodName];
    if (role) {
      await docSession.authorizer.assertAccess(role);
    }
    if (ikadocPolicy) {
      await validateIkaDocRuntimeSessionForDocument(
        ikadocRuntimeSessionRegistry,
        ikadocRuntimeSessionValidator,
        activeDoc.docName,
        ikadocPolicy.operation,
      );
      if (ikadocPolicy.capability) {
        requireIkaDocRuntimeCapabilityForDocument(
          ikadocRuntimeSessionRegistry,
          activeDoc.docName,
          ikadocPolicy.capability,
          ikadocPolicy.operation,
        );
      } else {
        denyIkaDocRuntimeOperationForDocument(
          ikadocRuntimeSessionRegistry,
          activeDoc.docName,
          ikadocPolicy.operation,
        );
      }
      if (methodName === "applyUserActions") {
        assertIkaDocUserActionsAllowedForDocument(
          ikadocRuntimeSessionRegistry,
          activeDoc.docName,
          args[0],
        );
      }
    }
    // Include a basic log record for each ActiveDoc method call.
    log.rawDebug(
      "activeDocMethod",
      activeDoc.getLogMeta(docSession, methodName),
    );

    if (tracker && client.authSession.isApiKeyAuth) {
      let dailyMax: number | undefined;
      if (role) {
        // assertAccess was already called above, so getCachedAuth() is available.
        const cachedDoc = docSession.authorizer.getCachedAuth().cachedDoc;
        dailyMax =
          cachedDoc?.workspace?.org?.billingAccount?.getEffectiveFeatures()
            ?.baseMaxApiUnitsPerDocumentPerDay;
      }
      // acquire + method call are in the same try so release runs even if acquire throws
      // (acquire increments the parallel counter before checking limits).
      try {
        tracker.acquire(activeDoc.docName, dailyMax);
        return await method(docSession, ...args);
      } finally {
        tracker.release(activeDoc.docName);
      }
    }

    return method(docSession, ...args);
  };
}
