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

// The first load of a document starts Grist's data engine, which can take a while.
const GRID_TIMEOUT_MS = 60_000;

const REFUSAL_TIMEOUT_MS = 10_000;

const EDITOR_TIMEOUT_MS = 5_000;

/** How long an accepted edit may take to show: 15 × 200ms. */
const CHANGE_ATTEMPTS = 15;
const CHANGE_POLL_MS = 200;

/** Column positions in the demo document (demo-document.mjs). */
const CLIENT_COLUMN = 3;
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
    await page.waitForFunction(
      () => document.querySelectorAll(".gridview_row .record").length > 2,
      undefined,
      { timeout: GRID_TIMEOUT_MS },
    );
  } catch (error) {
    // Grist's refusal page carries the reason in its page config.
    const refusal = await page.evaluate(() => JSON.stringify(window.gristConfig?.errDetails ?? null));
    throw new Error(`${fixture} (${theme} ${appearance}) did not open: ${refusal}`, { cause: error });
  }
}

/**
 * Types into a cell of the third row and confirms; true when the cell's value changed, in which
 * case the original value is written back. Grist opens a read-only editor on protected cells
 * and none at all for a viewer: either way the cell cannot change.
 */
async function changesCell(page, column) {
  const cell = page.locator(".gridview_row").nth(2).locator(".record > .field").nth(column);
  const before = await cell.innerText();

  // A value the cell cannot already hold, so an accepted edit always shows.
  const typed = await editCell(page, column, `smoke-${Date.now()}`);
  if (!typed) {
    return false;
  }

  for (let attempt = 0; attempt < CHANGE_ATTEMPTS; attempt++) {
    if (await cell.innerText() !== before) {
      await editCell(page, column, before);
      return true;
    }

    await page.waitForTimeout(CHANGE_POLL_MS);
  }

  return false;
}

/**
 * Moves the cursor to a cell of the third row by keyboard (the right panel can cover the last
 * columns), opens the editor, then types [value] and confirms. False when no editor opens.
 * The editor is opened first because keys typed while it opens are lost.
 */
async function editCell(page, column, value) {
  const row = page.locator(".gridview_row").nth(2);

  await row.locator(".record > .field").first().click();
  for (let step = 0; step < column; step++) {
    await page.keyboard.press("ArrowRight");
  }

  await page.keyboard.press("Enter");

  const editorOpened = await page.locator(".cell_editor")
    .waitFor({ timeout: EDITOR_TIMEOUT_MS })
    .then(() => true, () => false);
  if (!editorOpened) {
    return false;
  }

  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(value);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");

  return true;
}
