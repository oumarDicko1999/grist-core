import { readIkaDocServiceSecret } from "app/server/lib/IkaDocAdmissionConfig";
import { hasIkaDocRuntimeSessionCookie } from "app/server/lib/IkaDocRuntimeCookies";
import { deniedIkaDocRuntimeOperation } from "app/server/lib/IkaDocRuntimeDenial";

import { createHmac, timingSafeEqual } from "crypto";

import { Request } from "express";

/** GW-SRC-06: the header in which IkaDoc's service account presents a document's service token. */
export const IKADOC_SERVICE_TOKEN_HEADER = "x-ikadoc-service-token";

/**
 * GW-SRC-06: the service token for one document. IkaDoc derives the same value from the secret
 * both sides hold, so the token is never sent to a browser nor stored anywhere, and it proves the
 * request comes from IkaDoc without any session being registered in this process (GR-03).
 */
export function ikaDocDocumentServiceToken(secret: string, documentId: string): string {
  return createHmac("sha256", secret).update(`grist-document-service:${documentId}`).digest("base64url");
}

/** Actions IkaDoc's service account may apply to a document's user tables (fill, add, refresh, remove a source). */
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
 * GW-SRC-06: whether [req] comes from IkaDoc's service account for [documentId]: an API key, the
 * document's service token, and no browser session cookie. False when it carries no token, so it
 * goes through the user policy; a token that does not match [documentId] is refused.
 */
export function isIkaDocServiceRequest(req: Request, documentId: string | undefined): boolean {
  const token = req.get(IKADOC_SERVICE_TOKEN_HEADER);
  const secret = readIkaDocServiceSecret();

  if (!secret || !token || !req.headers.authorization || hasIkaDocRuntimeSessionCookie(req)) {
    return false;
  }

  const expected = documentId ? ikaDocDocumentServiceToken(secret, documentId) : undefined;
  if (!expected || !constantTimeEqual(token, expected)) {
    throw deniedIkaDocRuntimeOperation("use an invalid service token");
  }

  return true;
}

/** The service account only fills and refreshes data in user tables. */
export function assertIkaDocServiceActionsAllowed(actions: unknown): void {
  if (!Array.isArray(actions)) {
    throw deniedIkaDocRuntimeOperation("apply malformed document edits");
  }

  for (const action of actions) {
    const actionName = Array.isArray(action) ? action[0] : undefined;
    const tableId = Array.isArray(action) ? action[1] : undefined;

    const isDataAction = typeof actionName === "string" && SERVICE_ACTIONS.has(actionName);
    const isUserTable = typeof tableId === "string" && !tableId.startsWith("_grist_");
    const hidesPageFields = tableId === PAGE_FIELDS_TABLE && PAGE_FIELD_REMOVALS.has(String(actionName));

    if (!(isDataAction && isUserTable) && !hidesPageFields) {
      throw deniedIkaDocRuntimeOperation(`apply ${String(actionName)} as the IkaDoc service`);
    }
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
