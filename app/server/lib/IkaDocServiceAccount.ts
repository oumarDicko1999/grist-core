import { readIkaDocServiceSecret } from "app/server/lib/IkaDocAdmissionConfig";
import { hasIkaDocRuntimeSessionCookie } from "app/server/lib/IkaDocRuntimeCookies";
import { deniedIkaDocRuntimeOperation } from "app/server/lib/IkaDocRuntimeDenial";
import { IkaDocRuntimeSession, IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";

import { createHmac, timingSafeEqual } from "crypto";

import { Request } from "express";

/** GW-SRC-06: the header in which IkaDoc's service account presents the session's service token. */
export const IKADOC_SESSION_TOKEN_HEADER = "x-ikadoc-session-token";

/**
 * GW-SRC-06: the session's service token. IkaDoc derives the same value from the secret both sides
 * hold, so the token is never sent to a browser nor stored anywhere.
 */
export function ikaDocSessionServiceToken(secret: string, sessionId: string): string {
  return createHmac("sha256", secret).update(`grist-session-service:${sessionId}`).digest("base64url");
}

/** Actions IkaDoc's service account may apply to a session's user tables (add, refresh, remove a source). */
const SERVICE_ACTIONS = new Set([
  "AddTable",
  "RemoveTable",
  "AddRecord",
  "BulkAddRecord",
  "UpdateRecord",
  "BulkUpdateRecord",
  "RemoveRecord",
  "BulkRemoveRecord",
]);

/**
 * The one metadata table the service may touch: removing a page's fields hides IkaDoc's identity
 * columns on an added source's page (GW-COL-01); the data and every other metadata stay untouched.
 */
const PAGE_FIELDS_TABLE = "_grist_Views_section_field";
const PAGE_FIELD_REMOVALS = new Set(["RemoveRecord", "BulkRemoveRecord"]);

/**
 * GW-SRC-06: a request from IkaDoc's service account for a session document.
 * It carries an API key and the session's service token, and no browser session cookie.
 * Undefined for every other request, which goes through the user policy; a wrong token is refused.
 */
export function ikaDocServiceSessionForRequest(
  registry: IkaDocRuntimeSessionRegistry | undefined,
  req: Request,
): IkaDocRuntimeSession | undefined {
  const token = req.get(IKADOC_SESSION_TOKEN_HEADER);
  const docId = req.params?.docId;
  const secret = readIkaDocServiceSecret();

  if (!registry || !secret || !token || !req.headers.authorization || hasIkaDocRuntimeSessionCookie(req)) {
    return undefined;
  }

  if (typeof docId !== "string" || docId.length === 0) {
    return undefined;
  }

  const resolution = registry.resolveByDocumentId(docId);
  if (resolution.kind !== "active") {
    return undefined;
  }

  const expected = ikaDocSessionServiceToken(secret, resolution.session.config.sessionId);
  if (!constantTimeEqual(token, expected)) {
    throw deniedIkaDocRuntimeOperation("use an invalid session token", resolution.session);
  }

  return resolution.session;
}

/** The service account only materializes and refreshes data in user tables. */
export function assertIkaDocServiceActionsAllowed(session: IkaDocRuntimeSession, actions: unknown): void {
  if (!Array.isArray(actions)) {
    throw deniedIkaDocRuntimeOperation("apply malformed document edits", session);
  }

  for (const action of actions) {
    const actionName = Array.isArray(action) ? action[0] : undefined;
    const tableId = Array.isArray(action) ? action[1] : undefined;

    const isDataAction = typeof actionName === "string" && SERVICE_ACTIONS.has(actionName);
    const isUserTable = typeof tableId === "string" && !tableId.startsWith("_grist_");
    const hidesPageFields = tableId === PAGE_FIELDS_TABLE && PAGE_FIELD_REMOVALS.has(String(actionName));

    if (!(isDataAction && isUserTable) && !hidesPageFields) {
      throw deniedIkaDocRuntimeOperation(`apply ${String(actionName)} as the IkaDoc service`, session);
    }
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
