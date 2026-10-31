import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

/** A request from the editor to IkaDoc. */
export type IkaDocRequest =
  | { method: "GET" } |
  { method: "POST"; body?: object };

/**
 * A call to IkaDoc that did not succeed: the HTTP status, and IkaDoc's own message when it sent
 * one (`{ "error": "…" }`). Callers turn it into their own translated message.
 */
export class IkaDocRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly ikadocMessage: string | undefined,
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
    throw new IkaDocRequestError(response.status, readIkaDocError(payload));
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
