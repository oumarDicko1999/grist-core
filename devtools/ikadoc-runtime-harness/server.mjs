// Development-only stand-in for the IkaDoc backend calls the Grist runtime makes:
// editor admission, session validation, session status, save/discard/blocked callbacks.
// Never part of a runtime image (see test/common/IkaDocRuntimeHarness.ts).

import { createDemoDocument, documentExists } from "./demo-document.mjs";

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(HERE, "fixtures");
const STATE_FILE = join(HERE, ".state.json");

const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;

const port = Number(process.env.IKADOC_HARNESS_PORT ?? 18585);
const host = process.env.IKADOC_HARNESS_HOST ?? "127.0.0.1";
const harnessUrl = process.env.IKADOC_HARNESS_PUBLIC_URL ?? `http://127.0.0.1:${port}`;
const gristOrigin = process.env.IKADOC_HARNESS_GRIST_ORIGIN ?? "http://localhost:8484";

const fixtures = new Map(
  readdirSync(FIXTURE_DIR)
    .filter(file => file.endsWith(".json"))
    .map(file => [file.replace(/\.json$/, ""), readFileSync(join(FIXTURE_DIR, file), "utf8")]),
);

let documentIdPromise;

const server = createServer((request, response) => {
  handle(request, response).catch((error) => {
    log(`error ${request.method} ${request.url}: ${error.message}`);
    reply(response, 500, { error: "harness failure" });
  });
});

server.listen(port, host, () => {
  log(`listening on ${harnessUrl}; fixtures: ${[...fixtures.keys()].join(", ")}`);
  log(`open ${gristOrigin}/grist/editor/<fixture>?theme=owarelin&appearance=light`);
});

async function handle(request, response) {
  if (request.method === "OPTIONS") {
    return reply(response, 204);
  }

  const path = new URL(request.url, harnessUrl).pathname;
  const body = request.method === "POST" ? await readJson(request) : {};

  if (request.method === "POST" && path === "/admission") {
    return admit(response, body);
  }

  if (request.method === "POST" && path === "/session-validation") {
    const actionNames = (body.action?.names ?? []).join(",");
    log(`validate ${body.operation ?? "?"} ${actionNames}`.trim());

    return reply(response, 200, { kind: "accepted" });
  }

  if (request.method === "GET" && path.startsWith("/sessions/")) {
    return reply(response, 200, { status: "OPEN" });
  }

  if (request.method === "POST" && path.startsWith("/sessions/")) {
    log(`${path.split("/").pop()} ${JSON.stringify(body)}`);

    return reply(response, 200, { ok: true });
  }

  return reply(response, 404, { error: "unknown harness route" });
}

async function admit(response, body) {
  const fixture = fixtures.get(body.sessionId);
  if (!fixture) {
    log(`admission refused: unknown fixture ${body.sessionId}`);

    return reply(response, 404, {
      kind: "denied",
      code: "session-not-found",
      safeMessage: "Unknown harness fixture.",
    });
  }

  const values = {
    sessionId: body.sessionId,
    documentId: await harnessDocumentId(),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS).toISOString(),
    gristOrigin,
    harnessUrl,
    locale: body.locale ?? "fr-FR",
    theme: body.theme ?? "owarelin",
    appearance: body.appearance ?? "light",
  };

  log(`admit ${body.sessionId} (${values.theme}, ${values.appearance})`);

  return reply(response, 200, JSON.parse(fillPlaceholders(fixture, values)));
}

/** The demo document: created on first use, reused while it still exists. */
function harnessDocumentId() {
  documentIdPromise ??= loadOrCreateDocument();

  // A failed attempt must not stick: the next admission tries again.
  documentIdPromise.catch(() => {
    documentIdPromise = undefined;
  });

  return documentIdPromise;
}

async function loadOrCreateDocument() {
  const saved = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};

  const savedForThisGrist = saved.documentId && saved.gristOrigin === gristOrigin;
  if (savedForThisGrist && await documentExists(gristOrigin, saved.documentId)) {
    return saved.documentId;
  }

  const documentId = await createDemoDocument(gristOrigin);
  writeFileSync(STATE_FILE, JSON.stringify({ gristOrigin, documentId }, null, 2));

  log(`created demo document ${documentId}`);

  return documentId;
}

function fillPlaceholders(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (!(name in values)) {
      throw new Error(`fixture uses unknown placeholder ${match}`);
    }

    return String(values[name]);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", chunk => chunks.push(chunk));
    request.on("error", reject);

    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");

      try {
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-CSRF-Token",
  "X-Collection",
  "X-IkaDoc-Grist-Session",
].join(", ");

function reply(response, status, payload) {
  // The status and callback URLs are called from the editor page, on the Grist origin.
  response.setHeader("Access-Control-Allow-Origin", gristOrigin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.setHeader("Access-Control-Allow-Private-Network", "true");

  if (payload === undefined) {
    response.writeHead(status).end();
    return;
  }

  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function log(message) {
  process.stdout.write(`[ikadoc-harness] ${message}\n`);
}
