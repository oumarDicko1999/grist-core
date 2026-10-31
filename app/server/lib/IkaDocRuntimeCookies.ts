import { Request } from "express";

/** The IkaDoc session a browser opened (its session id). */
export const IKADOC_RUNTIME_SESSION_COOKIE = "IKADOC_GRIST_GATEWAY_SESSION";

/** Names this browser's own entry in a session several people share (GR-02); see the registry. */
export const IKADOC_RUNTIME_PARTICIPANT_COOKIE = "IKADOC_GRIST_PARTICIPANT";

/** Whether the browser says it belongs to an IkaDoc session, even one that has since ended. */
export function hasIkaDocRuntimeSessionCookie(req: Request): boolean {
  return ikaDocRuntimeSessionCookie(req) !== undefined || ikaDocRuntimeParticipantCookie(req) !== undefined;
}

export function ikaDocRuntimeSessionCookie(req: Request): string | undefined {
  return ikaDocCookie(req, IKADOC_RUNTIME_SESSION_COOKIE);
}

export function ikaDocRuntimeParticipantCookie(req: Request): string | undefined {
  return ikaDocCookie(req, IKADOC_RUNTIME_PARTICIPANT_COOKIE);
}

function ikaDocCookie(req: Request, cookieName: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (typeof cookieHeader !== "string" || cookieHeader.length === 0) {
    return undefined;
  }

  for (const rawCookie of cookieHeader.split(";")) {
    const separator = rawCookie.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const name = rawCookie.slice(0, separator).trim();
    if (name !== cookieName) {
      continue;
    }

    const value = rawCookie.slice(separator + 1).trim();

    return value.length > 0 ? value : undefined;
  }

  return undefined;
}
