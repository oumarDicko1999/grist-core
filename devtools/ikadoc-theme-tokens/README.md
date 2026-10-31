# IkaDoc theme tokens

Grist's IkaDoc themes use the colors the IkaDoc frontend actually renders, for
both visual styles (Owarelin, Material) in light and dark.

1. Open the IkaDoc frontend (tenant-ui) signed in, on a page with a record table.
2. Paste `extract.js` into the browser console. It switches the page between the
   four modes, resolves `--mat-sys-*` and `--ow-*` with the record table's own
   formulas, restores the page and prints JSON. Nothing is saved.
3. Replace `palette.json` with that JSON and set `extractedAt`.
4. Run `node devtools/ikadoc-theme-tokens/generate.mjs`. It writes
   `app/common/themes/ikadocPalette.ts`.
5. Run `GREP_TESTS='IkaDoc themes' yarn run test:common`: palette parity and
   WCAG AA contrast for the four themes.

The formulas in `extract.js` copy the frontend's
`record-table.component.ts` (flat table) and `records-workspace-cell.component.ts`
(pills). When those change, update `extract.js` first.
