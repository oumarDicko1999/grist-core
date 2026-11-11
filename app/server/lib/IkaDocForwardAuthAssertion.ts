import { ApiError } from "app/common/ApiError";

import { createHmac, timingSafeEqual } from "crypto";

import type { Request } from "express";
import type { IncomingMessage } from "http";

export const IKADOC_FORWARD_AUTH_SESSION_HEADER = "x-ikadoc-grist-session";
export const IKADOC_FORWARD_AUTH_USER_HEADER = "x-ikadoc-grist-user";
export const IKADOC_FORWARD_AUTH_PATH_HEADER = "x-ikadoc-grist-path";
export const IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER = "x-ikadoc-grist-timestamp";
export const IKADOC_FORWARD_AUTH_SIGNATURE_HEADER = "x-ikadoc-grist-signature";

const FORWARD_AUTH_ASSERTION_MAX_AGE_MS = 60_000;
const HMAC_ALGORITHM = "sha256";
const HEX_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

/** IkaDoc vouches that this person, signed in to IkaDoc, may use this session for this path. */
export interface IkaDocForwardAuthAssertion {
  sessionId: string;
  userId: string;
  path: string;
  timestampMillis: number;
}

export function ikaDocForwardAuthAssertionForRequest(
  req: Request | IncomingMessage,
  secret: string | undefined,
  nowMillis = Date.now(),
): IkaDocForwardAuthAssertion | undefined {
  if (!secret) {
    return undefined;
  }

  const sessionId = singleHeader(req, IKADOC_FORWARD_AUTH_SESSION_HEADER);
  const userId = singleHeader(req, IKADOC_FORWARD_AUTH_USER_HEADER);
  const path = singleHeader(req, IKADOC_FORWARD_AUTH_PATH_HEADER);
  const timestamp = singleHeader(req, IKADOC_FORWARD_AUTH_TIMESTAMP_HEADER);
  const signature = singleHeader(req, IKADOC_FORWARD_AUTH_SIGNATURE_HEADER);
  if (!sessionId && !userId && !path && !timestamp && !signature) {
    return undefined;
  }
  if (!sessionId || !userId || !path || !timestamp || !signature) {
    throw new ApiError("Invalid IkaDoc forward-auth assertion", 403);
  }

  const timestampMillis = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMillis) ||
    Math.abs(nowMillis - timestampMillis) > FORWARD_AUTH_ASSERTION_MAX_AGE_MS
  ) {
    throw new ApiError("Expired IkaDoc forward-auth assertion", 403);
  }
  if (path !== requestPath(req)) {
    throw new ApiError("Invalid IkaDoc forward-auth assertion path", 403);
  }

  const expectedSignature = ikaDocForwardAuthSignature(
    secret,
    sessionId,
    userId,
    path,
    timestampMillis,
  );
  if (!constantTimeHexEqual(signature, expectedSignature)) {
    throw new ApiError("Invalid IkaDoc forward-auth assertion signature", 403);
  }

  return { sessionId, userId, path, timestampMillis };
}

export function ikaDocForwardAuthSignature(
  secret: string,
  sessionId: string,
  userId: string,
  path: string,
  timestampMillis: number,
): string {
  return createHmac(HMAC_ALGORITHM, secret)
    .update(`${sessionId}\n${userId}\n${path}\n${timestampMillis}`)
    .digest("hex");
}

function singleHeader(
  req: Request | IncomingMessage,
  name: string,
): string | undefined {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : undefined;
  }
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requestPath(req: Request | IncomingMessage): string {
  const originalUrl =
    "originalUrl" in req && typeof req.originalUrl === "string" ?
      req.originalUrl :
      undefined;
  return new URL(originalUrl || req.url || "/", "http://ikadoc.local").pathname;
}

function constantTimeHexEqual(actual: string, expected: string): boolean {
  if (
    !HEX_SIGNATURE_PATTERN.test(actual) ||
    !HEX_SIGNATURE_PATTERN.test(expected)
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
