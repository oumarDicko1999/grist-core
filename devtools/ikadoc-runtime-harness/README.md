# IkaDoc runtime harness

Development-only stand-in for the IkaDoc backend calls Grist makes in IkaDoc runtime mode
(editor admission, session validation, status, save/discard/blocked callbacks). It opens the
real `/grist/editor/:sessionId` entry — theme, shell and capability gates — without the IkaDoc
stack. It is never part of a runtime image: `.dockerignore` only admits whitelisted folders and
`test/common/IkaDocRuntimeHarness.ts` fails if `devtools` is ever admitted.

## Run

```bash
devtools/ikadoc-runtime-harness/start.sh
```

Then open `http://localhost:8484/login` once (signs in as the default development user) and a
fixture:

- `http://localhost:8484/grist/editor/search-editor?theme=owarelin&appearance=light`
- `http://localhost:8484/grist/editor/search-viewer?theme=owarelin&appearance=dark`
- `http://localhost:8484/grist/editor/document-file`

At startup the harness creates a demo invoice document as the default user (or on the first
admission if Grist is not up yet); its id is kept in `.state.json` and reused while the document
exists. Its columns are IkaDoc data (listed in the `search-*` fixtures' `lockedColumns`) except
« Note », the user's own column. Every call Grist makes to "IkaDoc" is logged
with the `[ikadoc-harness]` prefix.

Against a Grist container instead of `yarn start`, run `node server.mjs` with
`IKADOC_HARNESS_HOST=0.0.0.0`, `IKADOC_HARNESS_PUBLIC_URL=http://<host-ip>:18585` and
`IKADOC_HARNESS_GRIST_ORIGIN=http://localhost:<port>`, and start the container with
`IKADOC_EDITOR_ADMISSION_URL` / `IKADOC_EDITOR_VALIDATION_URL` pointing at it.

## Fixtures

`fixtures/*.json` are complete admission responses in the backend contract shape
(`GristEditorRuntimeConfigDto`), with placeholders `{{sessionId}}`, `{{documentId}}`,
`{{expiresAt}}`, `{{gristOrigin}}`, `{{harnessUrl}}`, `{{locale}}`, `{{theme}}`,
`{{appearance}}`. The file name is the session id to open. `test/common/IkaDocRuntimeHarness.ts`
checks that every fixture parses as an enabled runtime config.

## Smoke test (GW-DEV-04)

With Grist and the harness running, and the IkaDoc frontend checked out (Playwright comes from
there; Grist gets no dependency):

```bash
IKADOC_NG_DIR=../ikadoc-ng node devtools/ikadoc-runtime-harness/smoke.mjs
```

It checks the theme against IkaDoc in the four modes (`../ikadoc-theme-tokens/check-grist.js`),
the sources panel, the locks, that choices show IkaDoc's label (the « Statut » column stores
codes such as `PAID`), that IkaDoc cells cannot be changed while « Note » can, that a second
tab leaves the first working, that a viewer cannot edit, and the refusal page on a native Grist
page. Keep other browsers off the same session while it runs. Save and discard are buttons of
the IkaDoc page: the frontend's e2e covers them.

## Restart test (GW-SEC-05)

Restarts the Grist container in the middle of a session:

```bash
IKADOC_NG_DIR=../ikadoc-ng IKADOC_GRIST_CONTAINER=<container> \
  node devtools/ikadoc-runtime-harness/restart-check.mjs
```

The open session's next edit must revalidate with IkaDoc and apply, and a session IkaDoc does
not know must be refused. `grid-actions.mjs` holds the grid gestures both scripts use.
