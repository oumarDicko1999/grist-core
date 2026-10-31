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

The first admission creates a demo invoice document as the default user; its id is kept in
`.state.json` and reused while the document exists. Every call Grist makes to "IkaDoc" is logged
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
