# IkaDoc Fork Sync Rules

This fork must keep IkaDoc/Owarelin changes easy to find, review, and rebase when upstream Grist moves.

## Change Ownership

IkaDoc-owned code should live in one of these locations whenever possible:

- `app/ikadoc/**`
- `app/server/lib/IkaDoc*.ts`
- `app/client/ui/IkaDoc*.ts`
- `test/**/IkaDoc*.ts`
- `documentation/ikadoc-*.md`
- `documentation/owarelin-*.md`

These files may be formatted and refactored normally because they are owned by the fork.

## Upstream Seam Patches

Upstream Grist files may be patched only when they are stable entry points into IkaDoc-owned code. Every patched upstream file must be listed in `documentation/ikadoc-integration-seams.md` with:

- the exact seam being patched,
- why the seam exists,
- the regression test that protects it,
- whether live validation is still required.

Keep upstream seam patches small. Do not reformat unrelated imports, whitespace, JSON ordering, or nearby upstream code just because a formatter can touch it. Rebase conflicts should point to a small IkaDoc decision, not thousands of upstream formatting lines.

## Search Anchors

Every upstream seam patch must include at least one findable anchor:

- an import from `app/ikadoc/**`,
- an import from `app/server/lib/IkaDoc*.ts`,
- an identifier containing `IkaDoc`, `ikadoc`, `Owarelin`, or `owarelin`,
- or a short comment naming the IkaDoc runtime seam when the code would otherwise be ambiguous.

Use this audit command before syncing upstream:

```bash
git diff --name-only upstream/main...HEAD | while read -r file; do
  case "$file" in
    app/ikadoc/*|app/server/lib/IkaDoc*.ts|app/client/ui/IkaDoc*.ts|test/*/IkaDoc*.ts|documentation/ikadoc-*.md|documentation/owarelin-*.md) ;;
    *) rg -n "IkaDoc|ikadoc|Owarelin|owarelin" "$file" >/dev/null || echo "Missing IkaDoc anchor: $file" ;;
  esac
done
```

## Rebase Checklist

1. Rebase upstream Grist first, before changing IkaDoc behavior.
2. Reconcile `documentation/ikadoc-integration-seams.md` against every upstream file conflict.
3. Prefer reapplying small seam hunks over carrying large formatted upstream files.
4. Run `yarn run build`.
5. Run the focused IkaDoc seam tests listed in the integration seam ledger.
6. Build the custom Docker image and run one live editor smoke test through Traefik.

## Branch Evolution Strategy

Upstream release tags are immutable source references. Do not commit directly on
an upstream tag and do not move, rewrite, or repurpose upstream release tags.

Maintain one Owarelin release branch per upstream Grist release:

```text
upstream v1.7.16 tag
        |
release/ikadoc-v1.7.16
        |
Owarelin/IkaDoc commits
```

For a new upstream release, create a new release branch from the upstream tag and
replay or rebase the Owarelin patch stack onto it:

```text
upstream v1.7.17 tag
        |
release/ikadoc-v1.7.17
        |
replayed Owarelin/IkaDoc commits
```

Rules:

1. Keep upstream tags untouched.
2. Keep Owarelin release work on `release/ikadoc-vX.Y.Z`.
3. Use short-lived feature branches only when a change needs review or isolation
   before landing on the active Owarelin release branch.
4. Keep Owarelin commits small enough to replay during upstream sync.
5. Before upgrading, compare the current fork line against its upstream tag:

   ```bash
   git diff vX.Y.Z..release/ikadoc-vX.Y.Z
   ```

6. After replaying onto the new release branch, reconcile the seam ledger,
   rerun focused IkaDoc tests, run `yarn run build`, build the custom runtime
   image, and run a live editor smoke test through Traefik.

## Security Rule

If a rebase conflict touches auth, document ACL, websocket identity, forward-auth, worker routing, export/download, sharing, plugins, external egress, or user actions, resolve it as a security change. Keep IkaDoc as the authority. Do not temporarily fall back to native Grist auth or anonymous behavior to make the merge pass.
