import { ApiError } from "app/common/ApiError";
import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import fetch from "node-fetch";

const BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS = 5000;

/**
 * GW-SHL-03: refusal text in the language of the IkaDoc session (English without a session).
 * Most refusals happen where no request language is at hand, but the session carries one.
 */
const IKADOC_RUNTIME_DENIAL_MESSAGES = {
  fr: "Cette action n'est pas disponible dans cet éditeur de tableur.",
  en: "This action is disabled for this spreadsheet editor.",
} as const;

/** What a refused action was about, for IkaDoc's audit of the refusal. */
export interface IkaDocBlockedCapabilityContext {
  missingCapability?: keyof IkaDocCapabilities;
  actionName?: string;
  tableId?: string;
}

/** The 403 an IkaDoc session gets for [operation], in the session's language. */
export function deniedIkaDocRuntimeOperation(
  operation: string,
  session?: IkaDocRuntimeSession,
): ApiError {
  const isFrench = session?.config.locale.toLowerCase().startsWith("fr") ?? false;
  const language = isFrench ? "fr" : "en";

  return new ApiError(
    `This Grist session does not allow ${operation}.`,
    403,
    { userError: IKADOC_RUNTIME_DENIAL_MESSAGES[language] },
  );
}

/**
 * Tells IkaDoc that the session was refused [operation] (its blockedCapabilityUrl), so the refusal
 * is audited. Fire and forget: a failed report is logged and never changes the refusal.
 */
export function reportBlockedCapability(
  session: IkaDocRuntimeSession,
  operation: string,
  cookieHeader?: string,
  context: IkaDocBlockedCapabilityContext = {},
): void {
  const url = session.config.blockedCapabilityUrl;
  if (!url) {
    return;
  }

  const headers: Record<string, string> = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": "grist-runtime-denial",
  };
  if (cookieHeader && shouldForwardCookieToBlockedCapabilityUrl(url, session)) {
    headers.Cookie = cookieHeader;
  }

  const auditContext = {
    sessionId: session.sessionId,
    documentId: session.documentId,
    mode: session.config.mode,
    sourceType: session.config.sourceType,
    capability: operation,
    missingCapability: context.missingCapability,
    actionName: context.actionName,
    tableId: context.tableId,
  };

  fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...auditContext,
      reason: `Forked Grist runtime denied ${operation}.`,
      documentUrlId: session.documentUrlId,
    }),
    timeout: BLOCKED_CAPABILITY_AUDIT_TIMEOUT_MS,
  })
    .then((response) => {
      if (!response.ok) {
        log.warn("IkaDoc blocked capability audit callback failed", {
          ...auditContext,
          status: response.status,
          statusText: response.statusText,
        });
      }
    })
    .catch((error) => {
      log.warn("IkaDoc blocked capability audit callback could not reach backend", {
        ...auditContext,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

/** Cookies go only to IkaDoc itself: a relative URL, or the origin of the session's status URL. */
function shouldForwardCookieToBlockedCapabilityUrl(
  url: string,
  session: IkaDocRuntimeSession,
): boolean {
  if (url.startsWith("/")) {
    return true;
  }

  if (!session.config.statusUrl || session.config.statusUrl.startsWith("/")) {
    return false;
  }

  try {
    return new URL(url).origin === new URL(session.config.statusUrl).origin;
  } catch {
    return false;
  }
}
