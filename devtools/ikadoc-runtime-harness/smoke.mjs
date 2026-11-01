// GW-DEV-04: browser smoke test of the IkaDoc editor entry, against a running Grist image and
// this harness. Development only; Playwright comes from the IkaDoc frontend checkout, so Grist
// gains no dependency.
//
//   IKADOC_NG_DIR=../ikadoc-ng node devtools/ikadoc-runtime-harness/smoke.mjs
//
// Checks, for each visual style and appearance: the theme matches IkaDoc (check-grist.js).
// Then: the sources panel lists the source, IkaDoc-owned cells cannot be changed (with an
// editable control), a second tab leaves the first one working, the viewer cannot edit, and a
// native Grist page shows the IkaDoc refusal.
// Save and discard are buttons of the IkaDoc page, outside Grist: the frontend's e2e covers them.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { changesCell, waitForGrid } from "./grid-actions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME_TOOLS = join(HERE, "../ikadoc-theme-tokens");

const gristOrigin = process.env.IKADOC_HARNESS_GRIST_ORIGIN ?? "http://localhost:8585";
const ikadocNgDir = resolve(process.env.IKADOC_NG_DIR ?? join(HERE, "../../../ikadoc-ng"));

const { chromium } = createRequire(join(ikadocNgDir, "package.json"))("playwright");

const checkGristSource = readFileSync(join(THEME_TOOLS, "check-grist.js"), "utf8");
const palette = JSON.parse(readFileSync(join(THEME_TOOLS, "palette.json"), "utf8"));

const MODES = [
  { theme: "owarelin", appearance: "light" },
  { theme: "owarelin", appearance: "dark" },
  { theme: "material", appearance: "light" },
  { theme: "material", appearance: "dark" },
];


const REFUSAL_TIMEOUT_MS = 10_000;



/** Column positions in the demo document (demo-document.mjs). */
const CLIENT_COLUMN = 3;
const STATUS_COLUMN = 4;
const NOTE_COLUMN = 7;

const failures = [];

const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);

  if (!ok) {
    failures.push(name);
  }
};

const browser = await chromium.launch();

try {
  // One context is one browser: its tabs share cookies, like a person's tabs do.
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await context.newPage();

  // Grist's minimal login signs in its default development user.
  await page.goto(`${gristOrigin}/login`);

  for (const mode of MODES) {
    await openEditor(page, "search-editor", mode);

    const gaps = await page.evaluate(([source, data]) => {
      (0, eval)(source);

      return window.ikadocCheckGrist(data);
    }, [checkGristSource, palette]);

    check(`theme ${mode.theme} ${mode.appearance} matches IkaDoc`, gaps.length === 0, gaps.join("; "));
  }

  await openEditor(page, "search-editor", MODES[0]);

  check("sources panel lists the source", await page.locator(".test-ikadoc-sources-source").count() > 0);
  check("IkaDoc columns carry a lock", await page.locator(".column_name [aria-label]").count() > 0);

  // GW-COL-04: the status column stores IkaDoc codes (PAID...) and shows their French labels.
  const statusText = await page.locator(".gridview_row").nth(2).locator(".record > .field").nth(STATUS_COLUMN).innerText();
  check("choices show IkaDoc's label, not its code", ["Brouillon", "Envoyée", "Payée", "En retard"].includes(statusText.trim()),
    statusText);
  check("an IkaDoc-owned cell cannot be edited", !(await changesCell(page, CLIENT_COLUMN)));

  // Control: the same gesture changes the user's own column, so the checks on protected
  // cells are not passing by accident. changesCell puts the value back.
  check("control: the user's own column can be changed", await changesCell(page, NOTE_COLUMN));

  // A second tab of the same browser on the same session must not disconnect the first.
  const secondTab = await context.newPage();
  await openEditor(secondTab, "search-editor", MODES[0]);
  await page.bringToFront();
  check("a second tab leaves the first one working", await changesCell(page, NOTE_COLUMN));
  await secondTab.close();

  await openEditor(page, "search-viewer", MODES[0]);
  check("a viewer cannot edit", !(await changesCell(page, NOTE_COLUMN)));

  await page.goto(`${gristOrigin}/`);

  // The refusal page is drawn by the client once the page has loaded.
  const refusal = page.locator("[class*=test-ikadoc-refusal-]").first();
  const showsRefusal = await refusal.waitFor({ timeout: REFUSAL_TIMEOUT_MS }).then(() => true, () => false);
  check("a native Grist page shows the IkaDoc refusal", showsRefusal);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exit(1);
}

console.log("\nall checks passed");

async function openEditor(page, fixture, { theme, appearance }) {
  await page.goto(`${gristOrigin}/grist/editor/${fixture}?theme=${theme}&appearance=${appearance}`);

  try {
    await waitForGrid(page);
  } catch (error) {
    // Grist's refusal page carries the reason in its page config.
    const refusal = await page.evaluate(() => JSON.stringify(window.gristConfig?.errDetails ?? null));
    throw new Error(`${fixture} (${theme} ${appearance}) did not open: ${refusal}`, { cause: error });
  }
}
