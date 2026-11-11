# IkaDoc Runtime Fonts

These font files are bundled for the IkaDoc/Owarelin runtime theme bridge. They
are loaded from `app/client/ui/IkaDocThemeBridge.ts` so the embedded Grist
runtime matches the tenant UI without depending on external font hosts.

Asset inventory:

- `inter-latin.woff2`: IkaDoc Material-mode body font.
- `manrope-latin.woff2`: IkaDoc Material-mode heading font.
- `owarelin-inter-400.woff2`: Owarelin body font.
- `owarelin-fraunces-500.woff2`: Owarelin heading font.
- `material-symbols-outlined.woff2`: Material Symbols icon font.

Refresh rules:

- Keep subsets local to this directory and reference them through
  `IkaDocThemeBridge.ts`.
- Preserve upstream source and license provenance when replacing the files.
- Do not add remote font loading to the Grist runtime shell; that would make
  editor rendering depend on third-party availability and tenant egress policy.
