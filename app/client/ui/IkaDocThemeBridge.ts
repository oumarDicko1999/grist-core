import { getOrCreateStyleElement } from "app/client/lib/getOrCreateStyleElement";
import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { getGristConfig } from "app/common/urlUtils";
import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";

const IKA_DOC_THEME_BRIDGE_STYLE_ID = "ikadoc-theme-bridge";

/**
 * GW-THM-04: colors, surfaces and radius come from the native Owarelin themes.
 * This bridge only serves the IkaDoc fonts and marks the page for IkaDoc runtime styling.
 */
export function attachIkaDocThemeBridge(): void {
  const config = getGristConfig();

  const runtimeConfig = parseIkaDocRuntimeConfigFromLoadConfig(config);
  if (runtimeConfig.kind === "enabled") {
    applyIkaDocThemeBridgeState({
      appearance: runtimeConfig.config.appearance,
      mode: runtimeConfig.config.mode,
      theme: runtimeConfig.config.theme,
    });
  }

  if (runtimeConfig.kind === "enabled" || config.ikadocDeployment) {
    attachIkaDocThemeBridgeStyles();
  }
}

function attachIkaDocThemeBridgeStyles(): void {
  const styleElement = getOrCreateStyleElement(IKA_DOC_THEME_BRIDGE_STYLE_ID, {
    position: "beforeend",
    element: document.head,
  });

  styleElement.textContent = IKA_DOC_THEME_BRIDGE_CSS;
}

const IKA_DOC_THEME_BRIDGE_CSS = `
  @font-face {
    font-family: 'IkaDoc Inter';
    src: url("fonts/ikadoc/inter-latin.woff2") format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'IkaDoc Manrope';
    src: url("fonts/ikadoc/manrope-latin.woff2") format("woff2");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Owarelin Inter';
    src: url("fonts/ikadoc/owarelin-inter-400.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Owarelin Fraunces';
    src: url("fonts/ikadoc/owarelin-fraunces-500.woff2") format("woff2");
    font-weight: 500;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: 'Material Symbols Outlined';
    src: url("fonts/ikadoc/material-symbols-outlined.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: block;
  }

  html[data-grist-appearance='dark'] {
    color-scheme: dark;
  }
`;
