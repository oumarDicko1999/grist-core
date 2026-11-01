// Grid gestures shared by smoke.mjs and restart-check.mjs. Development only.

const GRID_TIMEOUT_MS = 60_000;
const EDITOR_TIMEOUT_MS = 5_000;

/** How long an accepted edit may take to show: 15 × 200ms. */
const CHANGE_ATTEMPTS = 15;
const CHANGE_POLL_MS = 200;

/** Waits until the grid shows rows. */
export async function waitForGrid(page) {
  await page.waitForFunction(
    () => document.querySelectorAll(".gridview_row .record").length > 2,
    undefined,
    { timeout: GRID_TIMEOUT_MS },
  );
}

/**
 * Types into a cell of the third row and confirms; true when the cell's value changed, in which
 * case the original value is written back. Grist opens a read-only editor on protected cells
 * and none at all for a viewer: either way the cell cannot change.
 */
export async function changesCell(page, column) {
  const cell = page.locator(".gridview_row").nth(2).locator(".record > .field").nth(column);
  const before = await cell.innerText();

  // A value the cell cannot already hold, so an accepted edit always shows.
  const typed = await editCell(page, column, `check-${Date.now()}`);
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
