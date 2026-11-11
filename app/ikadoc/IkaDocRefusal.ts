/** GW-SHL-02: which explanation an IkaDoc refusal page gives. */
export type IkaDocRefusalKind =
  "page-unavailable" |
  "session-expired" |
  "access-changed" |
  "service-unavailable";

const SESSION_ENDED_CODES = new Set([
  "session-expired",
  "session-revoked",
  "session-not-found",
]);

const ACCESS_CHANGED_CODES = new Set([
  "permission-denied",
  "tenant-mismatch",
  "actor-mismatch",
]);

const SERVICE_UNAVAILABLE_CODES = new Set([
  "module-disabled",
  "runtime-not-configured",
  "backend-unavailable",
  "malformed-response",
]);

const EXPIRED_SESSION_MESSAGE = "use expired runtime session";

/**
 * Admission refusals carry IkaDoc's denial code.
 * Refusals of native Grist routes only carry the runtime's message.
 */
export function ikaDocRefusalKind(
  admissionCode: string | undefined,
  message: string | undefined,
): IkaDocRefusalKind {
  if (admissionCode && SESSION_ENDED_CODES.has(admissionCode)) {
    return "session-expired";
  }

  if (admissionCode && ACCESS_CHANGED_CODES.has(admissionCode)) {
    return "access-changed";
  }

  if (admissionCode && SERVICE_UNAVAILABLE_CODES.has(admissionCode)) {
    return "service-unavailable";
  }

  if (message?.includes(EXPIRED_SESSION_MESSAGE)) {
    return "session-expired";
  }

  return "page-unavailable";
}
