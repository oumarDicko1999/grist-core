import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

/** A request from the editor to IkaDoc. */
export type IkaDocRequest =
  | { method: "GET" } |
  { method: "POST"; body?: object };

/**
 * A call to IkaDoc that did not succeed: the HTTP status, and IkaDoc's own message, error code and
 * first violation's parameters when it sent them (`{ "error", "code", "violations" }`). Callers
 * turn it into their own translated message.
 */
export class IkaDocRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly ikadocMessage: string | undefined,
    public readonly code: string | undefined = undefined,
    public readonly params: Readonly<Record<string, string>> = {},
  ) {
    super(ikadocMessage ?? `HTTP ${status}`);
  }
}

/**
 * Calls IkaDoc from the editor with the person's cookies and the session's collection, and
 * returns the JSON IkaDoc answered. Throws IkaDocRequestError when IkaDoc refuses.
 */
export async function requestIkaDocJson(
  config: IkaDocRuntimeConfig,
  url: string,
  request: IkaDocRequest,
): Promise<unknown> {
  const headers = new Headers({ "X-Collection": config.collectionCode });

  const body = request.method === "POST" && request.body !== undefined ?
    JSON.stringify(request.body) :
    undefined;
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await window.fetch(url, {
    method: request.method,
    credentials: "include",
    headers,
    body,
  });

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new IkaDocRequestError(
      response.status,
      readIkaDocError(payload),
      readIkaDocErrorCode(payload),
      readIkaDocViolationParams(payload),
    );
  }

  return payload;
}

function readIkaDocError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const error = (payload as Record<string, unknown>).error;

  return typeof error === "string" && error.length > 0 ? error : undefined;
}

function readIkaDocErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const code = (payload as Record<string, unknown>).code;

  return typeof code === "string" && code.length > 0 ? code : undefined;
}

/** The first violation's string parameters, such as how many rows a refresh would remove. */
function readIkaDocViolationParams(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const violations = (payload as Record<string, unknown>).violations;
  const first: unknown = Array.isArray(violations) ? violations[0] : undefined;
  const params: unknown = first && typeof first === "object" ? (first as Record<string, unknown>).params : undefined;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return {};
  }

  const entries = Object.entries(params as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");

  return Object.fromEntries(entries);
}
