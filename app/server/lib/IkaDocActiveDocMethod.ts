import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { ikaDocRuntimeSessionFromAuthSession } from "app/server/lib/IkaDocRuntimeAuth";
import {
  assertIkaDocUserActionsAllowedForDocument,
  denyIkaDocRuntimeOperationForDocument,
  denyIkaDocRuntimeOperationForSession,
  IkaDocRuntimeSessionValidator,
  IkaDocValidatedAction,
  refuseIkaDocEditWithoutAdmission,
  requireIkaDocRuntimeCapabilityForDocument,
  requireIkaDocRuntimeCapabilityForSession,
  validateIkaDocRuntimeSession,
  validateIkaDocRuntimeSessionForDocument,
} from "app/server/lib/IkaDocRuntimePolicy";
import { assertIkaDocUserActionsAllowedForSession } from "app/server/lib/IkaDocUserActionPolicy";
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
      await assertIkaDocMethodAllowed(
        ikadocPolicy,
        client,
        activeDoc.docName,
        args,
        ikadocRuntimeSessionRegistry,
        ikadocRuntimeSessionValidator,
      );
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

/**
 * The IkaDoc policy for one call. A person IkaDoc admitted is validated as themselves, with the
 * actions they apply recorded first (GR-03, GR-07). Without one, the document's session decides,
 * and a method that applies actions is refused: only an admitted person may change the document.
 */
async function assertIkaDocMethodAllowed(
  policy: IkaDocActiveDocMethodPolicy,
  client: Client,
  docName: string,
  args: unknown[],
  registry: IkaDocRuntimeSessionRegistry | undefined,
  validator: IkaDocRuntimeSessionValidator | undefined,
): Promise<void> {
  const { operation } = policy;
  const requiredCapabilities = policy.capabilities ?? (policy.capability ? [policy.capability] : []);

  // A method with no capability to check and no actions to classify is never open to IkaDoc sessions.
  const refusedOutright = requiredCapabilities.length === 0 && !policy.classifyUserActions;

  const session = ikaDocRuntimeSessionFromAuthSession(client.authSession);
  if (session) {
    const recordedAction = policy.recordsActions ? validatedAction(args) : undefined;
    await validateIkaDocRuntimeSession(validator, session, docName, operation, recordedAction);

    for (const capability of requiredCapabilities) {
      requireIkaDocRuntimeCapabilityForSession(session, capability, operation);
    }

    if (refusedOutright) {
      denyIkaDocRuntimeOperationForSession(session, operation);
    }

    if (policy.classifyUserActions) {
      assertIkaDocUserActionsAllowedForSession(session, args[0]);
    }

    return;
  }

  if (policy.recordsActions || policy.classifyUserActions) {
    refuseIkaDocEditWithoutAdmission(operation);
  }

  if (policy.recordsActions) {
    denyIkaDocRuntimeOperationForDocument(registry, docName, operation);
  }

  await validateIkaDocRuntimeSessionForDocument(registry, validator, docName, operation);

  for (const capability of requiredCapabilities) {
    requireIkaDocRuntimeCapabilityForDocument(registry, docName, capability, operation);
  }

  if (refusedOutright) {
    denyIkaDocRuntimeOperationForDocument(registry, docName, operation);
  }

  if (policy.classifyUserActions) {
    assertIkaDocUserActionsAllowedForDocument(registry, docName, args[0]);
  }
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
