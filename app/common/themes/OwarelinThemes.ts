import { ThemeTokens, tokens } from "app/common/ThemePrefs";
import { GristDark } from "app/common/themes/GristDark";
import { GristLight } from "app/common/themes/GristLight";
import { OWARELIN_COLOR_TOKENS, OwarelinColorTokens } from "app/common/themes/owarelinTokens";

/** `--ow-font-body` in the IkaDoc frontend; the theme bridge serves the font files. */
const OWARELIN_BODY_FONT = "'Owarelin Inter', Inter, Arial, sans-serif";

const OWARELIN_CONTROL_RADIUS = "8px";

/** GW-THM-05: chart colors shared with IkaDoc charts (3:1 contrast on their surface). */
export const OWARELIN_CHART_COLORWAY = {
  light: ["#1b513a", "#3d6f8e", "#c7663b", "#a3802c", "#6b8278", "#6e5390", "#2a7a74", "#9a4a5a"],
  dark: ["#86b99a", "#86b5d3", "#e59a73", "#d8bd6a", "#a8b8b0", "#b49ad0", "#6fc1b9", "#d38a99"],
} as const;

/** Seam for Grist's chart colors (ChartView). */
export function ikaDocChartColorway(themeName: string): readonly string[] | undefined {
  if (themeName === "OwarelinLight") {
    return OWARELIN_CHART_COLORWAY.light;
  }

  if (themeName === "OwarelinDark") {
    return OWARELIN_CHART_COLORWAY.dark;
  }

  return undefined;
}

/**
 * GW-THM-01: Grist's light/dark themes with IkaDoc's semantic tokens.
 * Grist's component tokens derive from the semantic ones, so every surface follows.
 */
export const OwarelinLight: ThemeTokens = owarelinTheme(
  GristLight,
  OWARELIN_COLOR_TOKENS.light,
  "light",
);

export const OwarelinDark: ThemeTokens = owarelinTheme(
  GristDark,
  OWARELIN_COLOR_TOKENS.dark,
  "dark",
);

function owarelinTheme(
  base: ThemeTokens,
  ow: OwarelinColorTokens,
  appearance: "light" | "dark",
): ThemeTokens {
  const tint = (amountOfSurface: number) => mixHex(ow.primary, ow.surface, amountOfSurface);
  const primaryAlpha = (alpha: number) => withAlpha(ow.primary, alpha);

  // Grist puts white text on primaryMuted/primaryDim and never uses them as text.
  // The dark primary is a light green, so dark mode needs darker greens behind white text.
  const isDark = appearance === "dark";

  const primaryMuted = isDark ? mixHex(ow.primary, "#000000", 0.45) : ow.primaryHover;
  const primaryDim = isDark ? mixHex(ow.primary, "#000000", 0.55) : ow.primaryHover;

  const whiteOnPrimaryComponents = isDark ?
    {
      sidePanelOpenerActiveBg: tokens.primaryDim,
      iconButtonPrimaryBg: tokens.primaryDim,
      importerActiveFileBg: tokens.primaryDim,
      activePageBg: tokens.primaryDim,
    } :
    {};

  return {
    ...base,

    fontFamily: OWARELIN_BODY_FONT,
    controlBorderRadius: OWARELIN_CONTROL_RADIUS,

    body: ow.ink,
    emphasis: ow.text,

    // Light text on emphasized backgrounds (active page, toasts).
    veryLight: isDark ? ow.ink : ow.surface,

    bg: ow.surface,
    bgSecondary: ow.canvas,
    bgTertiary: ow.surfaceSoft,
    bgEmphasis: isDark ? ow.borderSoft : ow.ink,

    decoration: ow.borderSoft,
    decorationSecondary: ow.tableHeader,
    decorationTertiary: ow.border,

    primary: ow.primary,
    primaryMuted,
    primaryDim,
    primaryEmphasis: tint(isDark ? 0.3 : 0.8),
    primaryTranslucent: primaryAlpha(0.5),

    secondary: ow.muted,
    secondaryMuted: ow.ink,

    cursor: tokens.primary,
    cursorInactive: tint(0.6),

    selection: primaryAlpha(0.12),
    selectionOpaque: tint(0.88),
    selectionDarkerOpaque: tint(0.82),
    selectionDarker: primaryAlpha(0.2),
    selectionDarkest: primaryAlpha(0.3),

    hover: ow.border,
    backdrop: isDark ? "rgb(0 0 0 / 60%)" : "rgb(16 40 59 / 60%)",

    components: {
      ...base.components,
      ...whiteOnPrimaryComponents,

      tableHeaderBorder: ow.borderSoft,
      tableFrozenColumnsBorder: ow.border,

      chartFg: ow.muted,
      chartXAxis: ow.muted,
      chartYAxis: ow.muted,
      chartLegendBg: ow.surfaceGlass,
    },
  };
}

/** Mixes two `#rrggbb` colors: 0 gives the first color, 1 the second. */
function mixHex(first: string, second: string, amountOfSecond: number): string {
  const from = hexChannels(first);
  const to = hexChannels(second);

  const mixed = from.map((channel, i) =>
    Math.round(channel + (to[i] - channel) * amountOfSecond),
  );

  return `#${mixed.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexChannels(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexChannels(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) {
    throw new Error(`Owarelin theme expects #rrggbb colors, got ${hex}`);
  }

  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}
