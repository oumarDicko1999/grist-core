import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { Theme, ThemeAppearance, ThemeName } from "app/common/ThemePrefs";
import { getThemeTokens } from "app/common/Themes";
import { getGristConfig } from "app/common/urlUtils";
import { IkaDocVisualStyle, resolveIkaDocVisualStyle } from "app/ikadoc/IkaDocThemeState";

/**
 * Copied from the IkaDoc frontend (`assets/logo/owarelin-records-icon.svg`).
 * The dark file swaps its ink and green for Owarelin's dark ink and green; the frontend
 * ships no real dark variant.
 */
const OWARELIN_LOGO_URLS = {
  light: "img/ikadoc/owarelin-records-icon.svg",
  dark: "img/ikadoc/owarelin-records-icon-dark.svg",
} as const;

/**
 * Seam for Grist's theme selection (ui2018/theme.ts, GW-THM-03).
 * IkaDoc chooses the theme, never Grist's own preferences:
 * - in an IkaDoc session, from the user's visual style and appearance;
 * - on pages served without a session, from the deployment's style and the browser's preference.
 * Undefined outside IkaDoc.
 */
export function ikaDocRuntimeTheme(): Theme | undefined {
  const config = getGristConfig();

  const runtime = parseIkaDocRuntimeConfigFromLoadConfig(config);
  if (runtime.kind === "enabled") {
    return themeFor(runtime.config.theme, runtime.config.appearance);
  }

  if (config.ikadocDeployment) {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

    return themeFor(config.ikadocDeployment.theme, prefersDark ? "dark" : "light");
  }

  return undefined;
}

/** Each IkaDoc visual style has its own Grist theme pair (GW-THM-07). */
const THEME_NAMES: Record<IkaDocVisualStyle, Record<ThemeAppearance, ThemeName>> = {
  owarelin: { light: "OwarelinLight", dark: "OwarelinDark" },
  material: { light: "IkaDocMaterialLight", dark: "IkaDocMaterialDark" },
};

function themeFor(visualStyle: string | undefined, appearance: ThemeAppearance): Theme {
  const name = THEME_NAMES[resolveIkaDocVisualStyle(visualStyle)][appearance];

  return { appearance, name, colors: getThemeTokens(name) };
}

/**
 * Seam for Grist's header logo (AppHeader, GW-THM-01).
 * The IkaDoc product icon replaces Grist's logo in both visual styles, as in the IkaDoc frontend.
 */
export function ikaDocLogoUrl(): string | undefined {
  const theme = ikaDocRuntimeTheme();

  return theme ? OWARELIN_LOGO_URLS[theme.appearance] : undefined;
}
