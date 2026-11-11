// GW-SEC-05: restarts the Grist runtime in the middle of a session, against a Grist container and
// this harness. Development only; Playwright comes from the IkaDoc frontend checkout.
//
//   IKADOC_NG_DIR=../ikadoc-ng IKADOC_GRIST_CONTAINER=<container> \
//     node devtools/ikadoc-runtime-harness/restart-check.mjs
//
// After the restart, Grist has lost every session. Checks that:
// - the open session is not lost: its next edit revalidates with IkaDoc and applies;
// - nothing fails open: a browser naming a session IkaDoc does not know is refused.
//
// `docker restart` stops Grist gracefully: the page reopens the document against the stopping
// server, and Grist then shows « Erreur lors de l'accès au document » for that interrupted call,
// although the next one succeeds. That is stock Grist; the check reloads as a user would.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changesCell, waitForGrid } from "./grid-actions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const gristOrigin = process.env.IKADOC_HARNESS_GRIST_ORIGIN ?? "http://localhost:8585";
const container = process.env.IKADOC_GRIST_CONTAINER;
const ikadocNgDir = resolve(process.env.IKADOC_NG_DIR ?? join(HERE, "../../../ikadoc-ng"));

const { chromium } = createRequire(join(ikadocNgDir, "package.json"))("playwright");

const RESTART_TIMEOUT_MS = 90_000;
const STATUS_POLL_MS = 1_000;
const DIALOG_TIMEOUT_MS = 5_000;
const NOTE_COLUMN = 7;

if (!container) {
  console.error("Set IKADOC_GRIST_CONTAINER to the Grist container to restart.");
  process.exit(2);
}

const failures = [];

const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

  if (!ok) {
    failures.push(name);
  }
};

const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${gristOrigin}/login`);
  await page.goto(`${gristOrigin}/grist/editor/search-editor?theme=owarelin&appearance=light`);
  await waitForGrid(page);

  const documentId = await page.evaluate(() => window.gristConfig?.ikadoc?.documentId);

  execFileSync("docker", ["restart", container], { stdio: "ignore" });
  await waitForGrist();

  // The page reconnects on its own; its session is re-admitted through IkaDoc on the next request.
  await waitForGrid(page);
  await reloadAfterInterruptedCall(page);

  check("the open session survives the restart", await changesCell(page, NOTE_COLUMN));

  const stranger = await browser.newContext();
  await stranger.addCookies([
    { name: "IKADOC_GRIST_GATEWAY_SESSION", value: "unknown-session", url: gristOrigin },
    { name: "IKADOC_GRIST_PARTICIPANT", value: "forged-handle", url: gristOrigin },
  ]);

  const response = await stranger.request.get(`${gristOrigin}/api/docs/${documentId}/tables`);
  check("a session IkaDoc does not know is refused after the restart", [401, 403].includes(response.status()),
    `HTTP ${response.status()}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log("\nall checks passed");

/** Clicks « Recharger » on Grist's error dialog for the call the restart interrupted, if shown. */
async function reloadAfterInterruptedCall(page) {
  const dialog = page.locator(".test-modal-dialog");
  const shown = await dialog.waitFor({ timeout: DIALOG_TIMEOUT_MS }).then(() => true, () => false);
  if (!shown) {
    return;
  }

  console.log("note Grist reported the interrupted call; reloading as a user would");
  await dialog.locator("button").first().click();
  await waitForGrid(page);
}

async function waitForGrist() {
  const deadline = Date.now() + RESTART_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = await fetch(`${gristOrigin}/status`).then(r => r.status, () => 0);
    if (status === 200) {
      return;
    }

    await new Promise(r => setTimeout(r, STATUS_POLL_MS));
  }

  throw new Error(`Grist did not come back within ${RESTART_TIMEOUT_MS} ms`);
}
