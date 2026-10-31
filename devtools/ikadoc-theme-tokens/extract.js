// Run in the IkaDoc frontend (tenant-ui) page, signed in, from the browser console.
// Resolves IkaDoc's colors for both visual styles in light and dark, using the
// same formulas as the frontend's record table (record-table.component.ts) and
// cell pills (records-workspace-cell.component.ts). Copy the printed JSON into
// devtools/ikadoc-theme-tokens/palette.json, then run generate.mjs.
(() => {
  const html = document.documentElement;

  const saved = {
    style: html.dataset.tenantThemeStyle,
    dark: html.classList.contains("dark"),
  };

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.append(probe);

  const hex = channel => Math.round(channel).toString(16).padStart(2, "0");

  // Turns any CSS color (var(), light-dark(), color-mix()) into #rrggbb or rgba().
  // Chrome computes it as rgb()/rgba(), or as color(srgb r g b / a) after color-mix().
  const resolve = (cssColor) => {
    probe.style.color = "";
    probe.style.color = cssColor;
    const computed = getComputedStyle(probe).color;

    const numbers = computed.match(/[\d.]+/g).map(Number);
    const isSrgbFunction = computed.startsWith("color(");

    const [r, g, b] = isSrgbFunction ? numbers.slice(0, 3).map(c => c * 255) : numbers.slice(0, 3);
    const alpha = numbers[3] ?? 1;

    if (alpha === 1) {
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(alpha * 1000) / 1000})`;
  };

  const sys = name => `var(--mat-sys-${name})`;
  const ink = "var(--ow-color-ink, var(--mat-sys-outline))";

  const read = (isDark) => {
    const colors = {
      background: resolve("var(--ow-color-canvas, var(--mat-sys-surface))"),
      surface: resolve(sys("surface")),
      surfaceContainerLowest: resolve(sys("surface-container-lowest")),
      surfaceContainerLow: resolve(sys("surface-container-low")),
      surfaceContainer: resolve(sys("surface-container")),
      surfaceContainerHigh: resolve(sys("surface-container-high")),
      onSurface: resolve(sys("on-surface")),
      onSurfaceVariant: resolve(sys("on-surface-variant")),
      ink: resolve("var(--ow-color-ink, var(--mat-sys-on-surface))"),
      primary: resolve(sys("primary")),
      onPrimary: resolve(sys("on-primary")),
      primaryContainer: resolve(sys("primary-container")),
      onPrimaryContainer: resolve(sys("on-primary-container")),
      secondaryContainer: resolve(sys("secondary-container")),
      onSecondaryContainer: resolve(sys("on-secondary-container")),
      outline: resolve(sys("outline")),
      outlineVariant: resolve(sys("outline-variant")),
      error: resolve(sys("error")),
      errorContainer: resolve(sys("error-container")),
      onErrorContainer: resolve(sys("on-error-container")),
      shadow: resolve(sys("shadow")),
    };

    // record-table.component.ts, flat table: dark rules first, light overrides after.
    const grid = isDark ?
      {
        headerBg: resolve(sys("surface-container-low")),
        headerFg: resolve(sys("on-surface-variant")),
        headerBorderRight: resolve(`color-mix(in srgb, ${sys("outline-variant")} 10%, transparent)`),
        headerBorderBottom: resolve(`color-mix(in srgb, ${sys("outline-variant")} 18%, transparent)`),
        cellBorderRight: resolve(`color-mix(in srgb, ${sys("outline-variant")} 7%, transparent)`),
        cellBorderBottom: resolve(`color-mix(in srgb, ${sys("outline-variant")} 10%, transparent)`),
        rowEvenBg: resolve(sys("surface")),
        rowHoverBg: resolve(`color-mix(in srgb, ${sys("surface-container")} 62%, ${sys("surface")})`),
        rowSelectedBg: resolve(sys("secondary-container")),
      } :
      {
        headerBg: resolve(`color-mix(in srgb, ${sys("secondary-container")} 62%, white)`),
        headerFg: resolve("var(--ow-color-ink, var(--mat-sys-on-surface))"),
        headerBorderRight: resolve(`color-mix(in srgb, ${ink} 14%, transparent)`),
        headerBorderBottom: resolve(`color-mix(in srgb, ${ink} 20%, transparent)`),
        cellBorderRight: resolve(`color-mix(in srgb, ${ink} 10%, transparent)`),
        cellBorderBottom: resolve(`color-mix(in srgb, ${ink} 11%, transparent)`),
        rowEvenBg: resolve(`color-mix(in srgb, ${sys("secondary-container")} 22%, ${sys("surface")})`),
        rowHoverBg: resolve(`color-mix(in srgb, ${sys("secondary-container")} 36%, ${sys("surface")})`),
        rowSelectedBg: resolve(`color-mix(in srgb, ${sys("secondary-container")} 34%, ${sys("surface")})`),
      };

    // records-workspace-cell.component.ts: the default pill tone is tone-blue.
    const chip = {
      bg: resolve(sys("primary-container")),
      fg: resolve(sys("on-primary-container")),
    };

    return { colors, grid, chip };
  };

  const palette = {};

  for (const style of ["owarelin", "material"]) {
    palette[style] = {};

    for (const appearance of ["light", "dark"]) {
      html.dataset.tenantThemeStyle = style;
      html.classList.toggle("dark", appearance === "dark");
      palette[style][appearance] = read(appearance === "dark");
    }
  }

  html.dataset.tenantThemeStyle = saved.style;
  html.classList.toggle("dark", saved.dark);
  probe.remove();

  return JSON.stringify({ extractedFrom: location.origin, palette }, null, 2);
})();
