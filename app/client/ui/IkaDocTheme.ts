import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { Theme, ThemeAppearance, ThemeName } from "app/common/ThemePrefs";
import { getThemeTokens } from "app/common/Themes";
import { getGristConfig } from "app/common/urlUtils";
import { resolveIkaDocVisualStyle } from "app/ikadoc/IkaDocThemeState";

/** Copied from the IkaDoc frontend (`assets/logo/owarelin-records-icon.svg`). */
const OWARELIN_LOGO_URL = "img/ikadoc/owarelin-records-icon.svg";

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

/** Tenants on the Material style keep Grist's native themes (GW-D09). */
function themeFor(visualStyle: string | undefined, appearance: ThemeAppearance): Theme {
  const isOwarelin = resolveIkaDocVisualStyle(visualStyle) === "owarelin";
  const isDark = appearance === "dark";

  const owarelinName: ThemeName = isDark ? "OwarelinDark" : "OwarelinLight";
  const gristName: ThemeName = isDark ? "GristDark" : "GristLight";
  const name = isOwarelin ? owarelinName : gristName;

  return { appearance, name, colors: getThemeTokens(name) };
}

/**
 * Seam for Grist's header logo (AppHeader, GW-THM-01).
 * The Owarelin icon replaces Grist's logo under an Owarelin theme.
 */
export function ikaDocLogoUrl(): string | undefined {
  const theme = ikaDocRuntimeTheme();
  if (!theme?.name.startsWith("Owarelin")) {
    return undefined;
  }

  return OWARELIN_LOGO_URL;
}
