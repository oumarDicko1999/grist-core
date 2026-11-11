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

import { createHash } from "crypto";

import type { Client } from "app/server/lib/Client";
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

/**
 * The IkaDoc policy for one call. A person IkaDoc admitted is validated as themselves, with the
 * actions they apply recorded first (GR-03, GR-07). Without one, the document's session decides,
 * and a method that applies actions is refused: only an admitted person may change the document.
 */
export async function assertIkaDocActiveDocMethodAllowed(
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
