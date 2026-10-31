import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { ikaDocRuntimeSessionFromAuthSession } from "app/server/lib/IkaDocRuntimeAuth";
import {
  assertIkaDocUserActionsAllowedForDocument,
  assertIkaDocUserActionsAllowedForSession,
  denyIkaDocRuntimeOperationForDocument,
  denyIkaDocRuntimeOperationForSession,
  IkaDocRuntimeSessionValidator,
  IkaDocValidatedAction,
  requireIkaDocRuntimeCapabilityForDocument,
  requireIkaDocRuntimeCapabilityForSession,
  validateIkaDocRuntimeSession,
  validateIkaDocRuntimeSessionForDocument,
} from "app/server/lib/IkaDocRuntimePolicy";
import log from "app/server/lib/log";

import { createHash } from "crypto";

import type { Client } from "app/server/lib/Client";
import type { DocApiUsageTracker } from "app/server/lib/DocApiUsageTracker";
import type { DocSession } from "app/server/lib/DocSession";
import type { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

export interface IkaDocActiveDocMethodPolicy {
  operation: string;
  capability?: keyof IkaDocCapabilities;
  capabilities?: (keyof IkaDocCapabilities)[];
  classifyUserActions?: boolean;
  /** GR-07: the method applies user actions; IkaDoc records them as the person's evidence first. */
  recordsActions?: boolean;
}

const MAX_RECORDED_ACTION_NAMES = 200;

type ActiveDocMethod = (docSession: DocSession, ...args: unknown[]) => unknown;

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
      const runtimeSession = ikaDocRuntimeSessionFromAuthSession(
        client.authSession,
      );
      if (runtimeSession) {
        await validateIkaDocRuntimeSession(
          ikadocRuntimeSessionValidator,
          runtimeSession,
          activeDoc.docName,
          ikadocPolicy.operation,
          ikadocPolicy.recordsActions ? validatedAction(args) : undefined,
        );
        const requiredCapabilities =
          ikadocPolicy.capabilities ??
          (ikadocPolicy.capability ? [ikadocPolicy.capability] : []);
        if (requiredCapabilities.length > 0) {
          for (const capability of requiredCapabilities) {
            requireIkaDocRuntimeCapabilityForSession(
              runtimeSession,
              capability,
              ikadocPolicy.operation,
            );
          }
        } else if (!ikadocPolicy.classifyUserActions) {
          denyIkaDocRuntimeOperationForSession(
            runtimeSession,
            ikadocPolicy.operation,
          );
        }
        if (ikadocPolicy.classifyUserActions) {
          assertIkaDocUserActionsAllowedForSession(runtimeSession, args[0]);
        }
      } else {
        // Only a person IkaDoc admitted may change the document: their actions are their evidence.
        if (ikadocPolicy.recordsActions) {
          denyIkaDocRuntimeOperationForDocument(
            ikadocRuntimeSessionRegistry,
            activeDoc.docName,
            ikadocPolicy.operation,
          );
        }
        await validateIkaDocRuntimeSessionForDocument(
          ikadocRuntimeSessionRegistry,
          ikadocRuntimeSessionValidator,
          activeDoc.docName,
          ikadocPolicy.operation,
        );
        const requiredCapabilities =
          ikadocPolicy.capabilities ??
          (ikadocPolicy.capability ? [ikadocPolicy.capability] : []);
        if (requiredCapabilities.length > 0) {
          for (const capability of requiredCapabilities) {
            requireIkaDocRuntimeCapabilityForDocument(
              ikadocRuntimeSessionRegistry,
              activeDoc.docName,
              capability,
              ikadocPolicy.operation,
            );
          }
        } else if (!ikadocPolicy.classifyUserActions) {
          denyIkaDocRuntimeOperationForDocument(
            ikadocRuntimeSessionRegistry,
            activeDoc.docName,
            ikadocPolicy.operation,
          );
        }
        if (ikadocPolicy.classifyUserActions) {
          assertIkaDocUserActionsAllowedForDocument(
            ikadocRuntimeSessionRegistry,
            activeDoc.docName,
            args[0],
          );
        }
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
        return await method.call(activeDoc, docSession, ...args);
      } finally {
        tracker.release(activeDoc.docName);
      }
    }

    return method.call(activeDoc, docSession, ...args);
  };
}

/** The applied actions' digest and names; never their content (GR-07). */
function validatedAction(args: unknown[]): IkaDocValidatedAction {
  const serialized = JSON.stringify(args) ?? "";
  const actions = Array.isArray(args[0]) ? args[0] : [];
  const names = actions
    .map(action => (Array.isArray(action) && typeof action[0] === "string" ? action[0] : "?"))
    .slice(0, MAX_RECORDED_ACTION_NAMES);

  return {
    digest: createHash("sha256").update(serialized).digest("hex"),
    names,
  };
}
