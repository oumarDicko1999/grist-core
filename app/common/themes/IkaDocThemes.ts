import { ThemeTokens, tokens } from "app/common/ThemePrefs";
import { GristDark } from "app/common/themes/GristDark";
import { GristLight } from "app/common/themes/GristLight";
import { IKADOC_PALETTE, IkaDocPalette, IkaDocVisualStyleName } from "app/common/themes/ikadocPalette";

/** IkaDoc's font (variable Inter, 100–900) for Grist's interface and for cell data. */
const IKADOC_FONT = "'IkaDoc Inter', Inter, Arial, sans-serif";

/** IkaDoc buttons and segmented controls are pills in both visual styles. */
const IKADOC_CONTROL_RADIUS = "9999px";

/** Grist components that put text on the primary color; they take IkaDoc's on-primary color. */
const ON_PRIMARY_COMPONENTS = [
  "sidePanelOpenerActiveFg",
  "addNewCircleFg",
  "addNewCircleSmallFg",
  "controlPrimaryFg",
  "moveDocsSelectedFg",
  "filterBarButtonSavedFg",
  "iconButtonFg",
  "pageOptionsHoverFg",
  "autocompleteAddNewCircleFg",
  "siteSwitcherActiveFg",
  "breadcrumbsTagFg",
  "importerActiveFileFg",
  "datePickerSelectedFg",
] as const;

/** GW-THM-05: chart colors shared with IkaDoc charts (3:1 contrast on their surface). */
const OWARELIN_CHART_COLORWAY = {
  light: ["#1b513a", "#3d6f8e", "#c7663b", "#a3802c", "#6b8278", "#6e5390", "#2a7a74", "#9a4a5a"],
  dark: ["#86b99a", "#86b5d3", "#e59a73", "#d8bd6a", "#a8b8b0", "#b49ad0", "#6fc1b9", "#d38a99"],
} as const;

/** Paper charts: the paper inks (green, blue, clay, gold, plum, orange), 3:1 on their surface. */
const PAPER_CHART_COLORWAY = {
  light: ["#1b513a", "#2d4f6c", "#a24a22", "#7a5b12", "#5b2f6e", "#9a4d0e", "#5b5247", "#1d1a16"],
  dark: ["#8cc3a2", "#9fc1e3", "#eba07a", "#e6c68c", "#d0a8e2", "#f0aa6c", "#cfc3ad", "#efe6d4"],
} as const;

/**
 * GW-THM-01/07: Grist themes for IkaDoc's three visual styles, light and dark.
 * Colors come from the IkaDoc frontend (`ikadocPalette.ts`, generated);
 * Grist's component tokens derive from the semantic ones, so every surface follows.
 */
export const OwarelinLight = ikaDocTheme(GristLight, "owarelin", "light");
export const OwarelinDark = ikaDocTheme(GristDark, "owarelin", "dark");

export const IkaDocMaterialLight = ikaDocTheme(GristLight, "material", "light");
export const IkaDocMaterialDark = ikaDocTheme(GristDark, "material", "dark");

/** Paper: brown ink on cream paper, kraft for selection (IkaDoc « Papier » style). */
export const IkaDocPaperLight = ikaDocTheme(GristLight, "paper", "light");
export const IkaDocPaperDark = ikaDocTheme(GristDark, "paper", "dark");

/** Seam for Grist's chart colors (ChartView). Material charts keep Grist's default colors. */
export function ikaDocChartColorway(themeName: string): readonly string[] | undefined {
  if (themeName === "OwarelinLight") {
    return OWARELIN_CHART_COLORWAY.light;
  }

  if (themeName === "OwarelinDark") {
    return OWARELIN_CHART_COLORWAY.dark;
  }

  if (themeName === "IkaDocPaperLight") {
    return PAPER_CHART_COLORWAY.light;
  }

  if (themeName === "IkaDocPaperDark") {
    return PAPER_CHART_COLORWAY.dark;
  }

  return undefined;
}

function ikaDocTheme(
  base: ThemeTokens,
  style: IkaDocVisualStyleName,
  appearance: "light" | "dark",
): ThemeTokens {
  const palette: IkaDocPalette = IKADOC_PALETTE[style][appearance];
  const { colors, grid, chip } = palette;
  const isDark = appearance === "dark";

  // Material menus sit on a container surface; Owarelin menus on the plain surface.
  const menuBg = style === "material" ? colors.surfaceContainer : colors.surface;

  // Outlined buttons: Material 3 outlines with `outline`, Owarelin with its soft border, Paper in ink.
  const outlinedButtonBorder =
    style === "material" ? colors.outline : style === "paper" ? colors.ink : colors.outlineVariant;

  // IkaDoc darkens the primary on hover in light mode and lightens it in dark mode.
  const primaryHover = mixHex(colors.primary, isDark ? "#ffffff" : "#000000", 0.15);
  const primaryAlpha = (alpha: number) => withAlpha(colors.primary, alpha);
  const tint = (amountOfSurface: number) => mixHex(colors.primary, colors.surface, amountOfSurface);

  const onPrimaryComponents = Object.fromEntries(
    ON_PRIMARY_COMPONENTS.map(component => [component, colors.onPrimary]),
  );

  return {
    ...base,

    fontFamily: IKADOC_FONT,
    fontFamilyData: IKADOC_FONT,
    controlBorderRadius: IKADOC_CONTROL_RADIUS,

    body: colors.onSurface,
    emphasis: colors.ink,

    // Inverse surface: tooltips-like emphasized backgrounds.
    veryLight: colors.surface,
    bgEmphasis: colors.ink,

    bg: colors.surface,
    bgSecondary: colors.background,
    bgTertiary: colors.surfaceContainer,

    decoration: colors.outlineVariant,
    decorationSecondary: colors.surfaceContainerHigh,
    decorationTertiary: colors.outline,

    primary: colors.primary,
    primaryMuted: primaryHover,
    primaryDim: primaryHover,
    primaryEmphasis: primaryHover,
    primaryTranslucent: primaryAlpha(0.5),

    secondary: colors.onSurfaceVariant,
    secondaryMuted: colors.onSurface,

    error: colors.error,

    cursor: tokens.primary,
    cursorInactive: primaryAlpha(0.5),

    selection: primaryAlpha(0.12),
    selectionOpaque: tint(0.88),
    selectionDarkerOpaque: tint(0.82),
    selectionDarker: primaryAlpha(0.2),
    selectionDarkest: primaryAlpha(0.3),

    hover: colors.surfaceContainerHigh,
    backdrop: "rgba(0, 0, 0, 0.32)",

    components: {
      ...base.components,
      ...onPrimaryComponents,

      pageBg: colors.background,
      mainPanelBg: colors.surface,
      pagePanelsBorder: grid.headerBorderBottom,

      cellBg: colors.surface,
      cellFg: colors.onSurface,
      tableBodyBg: colors.surface,
      tableBodyBorder: grid.cellBorderBottom,
      tableHeaderBg: grid.headerBg,
      tableHeaderFg: grid.headerFg,
      tableHeaderBorder: grid.headerBorderBottom,
      tableFrozenColumnsBorder: grid.headerBorderBottom,

      choiceTokenBg: chip.bg,
      choiceTokenFg: chip.fg,

      // Selected page and menu items: IkaDoc's container fill, not a primary block.
      activePageBg: colors.secondaryContainer,
      activePageFg: colors.onSecondaryContainer,
      menuBg,
      menuItemSelectedBg: colors.surfaceContainerHigh,
      menuItemSelectedFg: colors.onSurface,
      menuItemIconSelectedFg: colors.onSurface,

      inputFocus: colors.primary,

      // Grist's light and dark themes hard-code these instead of deriving them from tokens.
      mediumText: colors.onSurfaceVariant,
      errorText: colors.error,
      errorTextHover: colors.error,
      lightHover: colors.surfaceContainer,
      controlPrimaryBg: colors.primary,
      controlPrimaryHoverBg: primaryHover,
      controlSecondaryHoverBg: colors.surfaceContainerHigh,
      controlBorder: `1px solid ${outlinedButtonBorder}`,

      // IkaDoc dialogs are flat surfaces, without Grist's drop shadow.
      modalInnerShadow: "transparent",
      modalOuterShadow: "transparent",
      buttonGroupBgHover: colors.surfaceContainerHigh,

      // IkaDoc's add button shows a plain "+", without Grist's darker circle.
      addNewCircleBg: "transparent",
      addNewCircleHoverBg: "transparent",

      tableHeaderSelectedBg: colors.secondaryContainer,
      tableHeaderSelectedFg: colors.onSecondaryContainer,
      selectionHeader: primaryAlpha(0.12),
      tableAddNewBg: colors.surfaceContainerLow,
      cardBlocksBg: colors.surfaceContainerLow,
      cardEditingLayoutBg: primaryAlpha(0.08),

      pageHoverBg: colors.surfaceContainer,
      pageInitialsBg: colors.secondaryContainer,
      pageInitialsFg: colors.onSecondaryContainer,

      rightPanelTabSelectedIcon: colors.primary,
      rightPanelTabButtonHoverBg: colors.surfaceContainerHigh,
      rightPanelFieldSettingsBg: colors.surfaceContainerHigh,
      rightPanelFieldSettingsButtonBg: colors.surfaceContainerHigh,

      choiceTokenInvalidBg: colors.errorContainer,
      searchPrevNextButtonBg: colors.surfaceContainerHigh,
      colorSelectFontOptionBgHover: colors.surfaceContainerHigh,
      attachmentsEditorButtonBg: colors.surfaceContainerHigh,
      markdownCellLightBg: colors.surfaceContainerLow,
      appHeaderBorderHover: colors.outlineVariant,

      importerActiveFileBg: colors.primary,
      importerInactiveFileBg: colors.outline,

      // IkaDoc marks today with an outline (IkaDocThemeBridge) and fills only the selected day.
      datePickerTodayBg: "transparent",
      datePickerTodayBgHover: colors.surfaceContainerHigh,
      datePickerTodayFg: colors.onSurface,
      datePickerSelectedBg: colors.primary,
      datePickerSelectedBgHover: primaryHover,
      datePickerRangeStartEndBg: colors.primary,
      datePickerRangeStartEndBgHover: primaryHover,
      datePickerRangeBg: primaryAlpha(0.12),
      datePickerRangeBgHover: primaryAlpha(0.2),

      chartFg: colors.onSurfaceVariant,
      chartXAxis: colors.onSurfaceVariant,
      chartYAxis: colors.onSurfaceVariant,
      chartLegendBg: colors.surface,
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
    throw new Error(`IkaDoc theme expects #rrggbb colors, got ${hex}`);
  }

  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}
