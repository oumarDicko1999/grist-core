import { getOrCreateStyleElement } from "app/client/lib/getOrCreateStyleElement";
import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { getGristConfig } from "app/common/urlUtils";
import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";

const IKA_DOC_THEME_BRIDGE_STYLE_ID = "ikadoc-theme-bridge";

export function attachIkaDocThemeBridge(): void {
  const runtimeConfig = parseIkaDocRuntimeConfigFromLoadConfig(getGristConfig());
  if (runtimeConfig.kind !== "enabled") {
    return;
  }

  applyIkaDocThemeBridgeState({
    appearance: runtimeConfig.config.appearance,
    mode: runtimeConfig.config.mode,
    theme: runtimeConfig.config.theme,
  });
  attachIkaDocThemeBridgeStyles();
}

function attachIkaDocThemeBridgeStyles(): void {
  getOrCreateStyleElement(IKA_DOC_THEME_BRIDGE_STYLE_ID, {
    position: "beforeend",
    element: document.head,
  }).textContent = IKA_DOC_THEME_BRIDGE_CSS;
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

  /* IkaDoc M3 runtime skin: mirrors tenant-ui Material 3 tokens inside the Grist iframe. */
  html[data-ikadoc-runtime='true'] {
    color-scheme: light;
    --ik-font-body: 'IkaDoc Inter', Inter, system-ui, sans-serif;
    --ik-font-heading: 'IkaDoc Manrope', Manrope, system-ui, sans-serif;
    --ik-font-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    --ik-radius-sm: 0.5rem;
    --ik-radius-md: 0.875rem;
    --ik-radius-lg: 1.25rem;
    --ik-radius-xl: 1.75rem;
    --ik-radius-pill: 999rem;
    --ik-app-border: var(--ow-color-boundary);
    --ik-app-border-strong: var(--ow-color-boundary-strong);
    --ik-grid-header-height: 2.625rem;
    --ik-grid-row-height: 2.875rem;
    --ik-grid-border: color-mix(in srgb, var(--mat-sys-outline-variant) 34%, transparent);
    --ik-grid-border-strong: color-mix(in srgb, var(--mat-sys-outline-variant) 52%, transparent);
    --ik-menu-bg: var(--mat-sys-surface-container);
    --ik-table-row-hover: var(--mat-sys-surface-container-low);
    --ik-state-hover: color-mix(
      in srgb,
      var(--mat-sys-on-surface) calc(var(--mat-sys-hover-state-layer-opacity) * 100%),
      transparent
    );
    --ik-state-focus: color-mix(
      in srgb,
      var(--mat-sys-on-surface) calc(var(--mat-sys-focus-state-layer-opacity) * 100%),
      transparent
    );
    --ik-state-pressed: color-mix(
      in srgb,
      var(--mat-sys-on-surface) calc(var(--mat-sys-pressed-state-layer-opacity) * 100%),
      transparent
    );
    --ik-state-selected: color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
    --ik-state-selected-strong: color-mix(in srgb, var(--mat-sys-primary) 20%, transparent);
    --ik-state-selected-opaque: color-mix(
      in srgb,
      var(--mat-sys-primary-container) 62%,
      var(--mat-sys-surface-container-lowest)
    );
    --ik-menu-shadow: 0 0.25rem 0.75rem rgb(16 24 32 / 10%), 0 0.75rem 1.5rem rgb(16 24 32 / 10%);
    --ik-focus-ring: 0 0 0 0.125rem color-mix(in srgb, var(--mat-sys-primary) 24%, transparent);
    --ik-icon-muted: var(--mat-sys-on-surface-variant);
    --ik-icon-active: var(--mat-sys-primary);
    --ik-icon-button-size: 2rem;
    --ik-icon-size: 1.125rem;
    --ik-grid-icon-button-size: 1.625rem;
    --ik-grid-icon-size: 1rem;
    --ik-menu-container-shape: var(--mat-sys-corner-large);
    --ik-menu-item-shape: var(--mat-sys-corner-small);
    --ik-compact-field-height: 2.375rem;
    --ik-compact-field-border: color-mix(in srgb, var(--mat-sys-outline-variant) 58%, transparent);
    --ik-compact-field-shadow: none;
    --ik-compact-field-focus-shadow:
      inset 0 0 0 0.0625rem var(--mat-sys-primary),
      0 0 0 0.1875rem color-mix(in srgb, var(--mat-sys-primary) 12%, transparent);
    --icon-GristLogo: url("icons/owarelin-records-icon.svg");
    --icon-GristWideLogo: url("icons/owarelin-records-icon.svg");
    --grist-logo-bg: var(--mat-sys-surface-container-lowest);
    --grist-logo-size: 1.75rem;

    --mat-sys-background: #f8fafc;
    --mat-sys-surface: #ffffff;
    --mat-sys-surface-container-lowest: #ffffff;
    --mat-sys-surface-container-low: #f3f6f8;
    --mat-sys-surface-container: #eef3f6;
    --mat-sys-surface-container-high: #e7edf2;
    --mat-sys-on-surface: #101820;
    --mat-sys-on-surface-variant: rgb(39 73 108 / 78%);
    --mat-sys-outline: #6f7f8c;
    --mat-sys-outline-variant: #c8d3dc;
    --mat-sys-primary: #27496c;
    --mat-sys-on-primary: #ffffff;
    --mat-sys-primary-container: #d9e7f4;
    --mat-sys-on-primary-container: #10283b;
    --mat-sys-secondary-container: #e8eef3;
    --mat-sys-on-secondary-container: #10283b;
    --mat-sys-tertiary: #693c00;
    --mat-sys-tertiary-container: rgb(105 60 0 / 12%);
    --mat-sys-on-tertiary-container: #2b1700;
    --mat-sys-error: #ba1a1a;
    --mat-sys-hover-state-layer-opacity: 0.08;
    --mat-sys-focus-state-layer-opacity: 0.12;
    --mat-sys-pressed-state-layer-opacity: 0.12;
    --mat-sys-dragged-state-layer-opacity: 0.16;
    --mat-sys-corner-extra-small: 0.25rem;
    --mat-sys-corner-small: 0.5rem;
    --mat-sys-corner-medium: 0.75rem;
    --mat-sys-corner-large: 1rem;
    --mat-sys-corner-extra-large: 1.75rem;
    --mat-sys-corner-full: var(--ik-radius-pill);
    --mat-sys-level0: none;
    --mat-sys-level1: 0 0.0625rem 0.125rem rgb(16 24 32 / 12%);
    --mat-sys-level2: 0 0.125rem 0.375rem rgb(16 24 32 / 16%);
    --mat-sys-level3: 0 0.25rem 0.75rem rgb(16 24 32 / 18%);
    --mat-sys-body-medium: 400 0.875rem/1.25rem var(--ik-font-body);
    --mat-sys-body-small: 400 0.75rem/1rem var(--ik-font-body);
    --mat-sys-label-large: 600 0.875rem/1.25rem var(--ik-font-body);
    --mat-sys-label-medium: 600 0.75rem/1rem var(--ik-font-body);
    --mat-sys-title-small: 700 0.875rem/1.25rem var(--ik-font-heading);
    --ow-color-canvas: var(--mat-sys-surface-container-lowest);
    --ow-color-panel: var(--mat-sys-surface-container-lowest);
    --ow-color-boundary: color-mix(in srgb, var(--mat-sys-outline-variant) 42%, transparent);
    --ow-color-boundary-strong: color-mix(in srgb, var(--mat-sys-outline-variant) 62%, transparent);
    --ow-color-row-hover: var(--mat-sys-surface-container);
    --ow-color-border: var(--mat-sys-outline-variant);
    --ow-color-border-soft: color-mix(in srgb, var(--mat-sys-outline-variant) 72%, transparent);
    --ow-color-focus-ring: color-mix(in srgb, var(--mat-sys-primary) 24%, transparent);

    --grist-theme-font-family: var(--ik-font-body);
    --grist-theme-font-family-data: var(--ik-font-body);
    --grist-font-family-data: var(--ik-font-body);
    --grist-font-family-monospace: var(--ik-font-mono);
    --grist-small-font-size: 0.8125rem;
    --grist-x-small-font-size: 0.75rem;
    --grist-medium-font-size: 0.875rem;
    --grist-big-text-weight: 650;
    --grist-theme-control-border-radius: var(--ik-radius-lg);
    --grist-theme-control-primary-bg: var(--mat-sys-primary);
    --grist-theme-control-primary-fg: var(--mat-sys-on-primary);
    --grist-theme-control-primary-hover-bg: var(--mat-sys-on-primary-container);
    --grist-theme-control-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-control-fg: var(--mat-sys-on-surface);
    --grist-theme-control-hover-fg: var(--mat-sys-primary);
    --grist-theme-control-border: 0.0625rem solid var(--ik-app-border);
    --grist-theme-control-disabled-fg: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
    --grist-theme-control-disabled-bg: color-mix(in srgb, var(--mat-sys-on-surface) 7%, transparent);
    --grist-theme-control-secondary-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-control-secondary-disabled-fg: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
    --grist-theme-input-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-input-fg: var(--mat-sys-on-surface);
    --grist-theme-input-border: var(--ik-app-border);
    --grist-theme-input-border-focus: var(--mat-sys-primary);
    --grist-theme-input-placeholder-fg: color-mix(in srgb, var(--mat-sys-on-surface-variant) 78%, transparent);
    --grist-theme-input-disabled-fg: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
    --grist-theme-input-disabled-bg: color-mix(in srgb, var(--mat-sys-on-surface) 6%, transparent);
    --grist-theme-input-readonly-bg: var(--mat-sys-surface-container);
    --grist-theme-bg: var(--mat-sys-background);
    --grist-theme-bg-color: var(--mat-sys-background);
    --grist-theme-bg-default: var(--mat-sys-background);
    --grist-theme-bg-secondary: var(--mat-sys-surface-container);
    --grist-theme-bg-tertiary: var(--mat-sys-surface-container-high);
    --grist-theme-page-bg: var(--mat-sys-background);
    --grist-theme-main-panel-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-menu-bg: var(--ik-menu-bg);
    --grist-theme-menu-border: var(--ik-app-border);
    --grist-theme-menu-item-fg: var(--mat-sys-on-surface);
    --grist-theme-menu-item-selected-bg: var(--mat-sys-secondary-container);
    --grist-theme-menu-item-selected-fg: var(--mat-sys-on-secondary-container);
    --grist-theme-menu-shadow: rgb(16 24 32 / 20%);
    --grist-theme-popup-bg: var(--ik-menu-bg);
    --grist-theme-text: var(--mat-sys-on-surface);
    --grist-theme-light-text: var(--mat-sys-on-surface-variant);
    --grist-theme-text-light: var(--mat-sys-on-surface-variant);
    --grist-theme-dark-text: #10283b;
    --grist-theme-disabled-text: rgb(39 73 108 / 42%);
    --grist-theme-icon-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-icon-hover: var(--mat-sys-primary);
    --grist-theme-icon-disabled: color-mix(in srgb, var(--mat-sys-on-surface) 32%, transparent);
    --grist-theme-link: var(--mat-sys-primary);
    --grist-theme-primary-emphasis: var(--mat-sys-primary);
    --grist-theme-accent-icon: var(--mat-sys-tertiary);
    --grist-theme-page-panels-main-panel-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-page-panels-left-panel-bg: var(--mat-sys-surface-container-low);
    --grist-theme-page-panels-right-panel-bg: var(--mat-sys-surface-container-low);
    --grist-theme-page-panels-top-header-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-page-panels-border: var(--mat-sys-outline-variant);
    --grist-theme-left-panel-page-hover-bg: var(--ik-state-hover);
    --grist-theme-left-panel-active-page-fg: var(--mat-sys-on-secondary-container);
    --grist-theme-left-panel-active-page-bg: var(--mat-sys-secondary-container);
    --grist-theme-left-panel-disabled-page-fg: var(--grist-theme-disabled-text);
    --grist-theme-right-panel-tab-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-right-panel-tab-bg: var(--mat-sys-surface-container);
    --grist-theme-right-panel-tab-border: var(--mat-sys-outline-variant);
    --grist-theme-right-panel-tab-hover-bg: var(--ik-state-hover);
    --grist-theme-right-panel-tab-selected-fg: var(--mat-sys-primary);
    --grist-theme-right-panel-tab-selected-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-right-panel-field-settings-bg: var(--mat-sys-surface-container);
    --grist-theme-right-panel-field-settings-button-bg: var(--mat-sys-surface-container-high);
    --grist-theme-table-header-bg: var(--mat-sys-surface-container-high);
    --grist-theme-table-header-fg: var(--mat-sys-on-surface);
    --grist-theme-table-header-border: var(--ik-grid-border-strong);
    --grist-theme-table-header-selected-bg: var(--ik-state-selected-opaque);
    --grist-theme-table-header-selected-fg: var(--mat-sys-on-primary-container);
    --grist-theme-table-body-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-table-body-border: var(--ik-grid-border);
    --grist-theme-table-add-new-bg: var(--mat-sys-surface-container);
    --grist-theme-table-scroll-shadow: color-mix(in srgb, var(--mat-sys-on-surface) 18%, transparent);
    --grist-theme-table-frozen-columns-border: var(--mat-sys-primary);
    --grist-theme-table-drag-drop-indicator: var(--mat-sys-primary);
    --grist-theme-table-drag-drop-shadow: var(--ik-state-selected-opaque);
    --grist-theme-cell-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-cell-fg: var(--mat-sys-on-surface);
    --grist-theme-cell-zebra-bg: var(--mat-sys-surface-container-low);
    --grist-theme-cell-editor-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-cell-editor-fg: var(--mat-sys-on-surface);
    --grist-theme-cell-editor-placeholder-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-hover: var(--ik-state-hover);
    --grist-theme-selection: var(--ik-state-selected);
    --grist-theme-selection-darker: color-mix(in srgb, var(--mat-sys-primary) 24%, transparent);
    --grist-theme-selection-darkest: color-mix(in srgb, var(--mat-sys-primary) 34%, transparent);
    --grist-theme-selection-opaque: var(--ik-state-selected-opaque);
    --grist-theme-selection-opaque-bg: var(--ik-state-selected-opaque);
    --grist-theme-selection-header: var(--ik-state-selected-strong);
    --grist-theme-cursor: var(--mat-sys-primary);
    --grist-theme-cursor-inactive: color-mix(in srgb, var(--mat-sys-primary) 42%, transparent);
    --grist-theme-cursor-readonly: color-mix(in srgb, var(--mat-sys-on-surface) 42%, transparent);
    --grist-theme-error: var(--mat-sys-error);
    --grist-theme-warning: var(--mat-sys-tertiary);
    --grist-theme-widget-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-widget-border: var(--ik-app-border);
    --grist-theme-widget-active-border: var(--mat-sys-primary);
    --grist-theme-widget-active-non-focused-border: color-mix(in srgb, var(--mat-sys-primary) 48%, transparent);
    --grist-theme-menu-toggle-bg: transparent;
    --grist-theme-menu-toggle-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-menu-toggle-border: color-mix(in srgb, var(--mat-sys-outline-variant) 58%, transparent);
    --grist-theme-menu-toggle-hover-fg: var(--mat-sys-primary);
    --grist-theme-menu-toggle-active-fg: var(--mat-sys-primary);
    --grist-theme-checkbox-border: color-mix(in srgb, var(--mat-sys-outline) 76%, transparent);
    --grist-theme-checkbox-border-hover: var(--mat-sys-primary);
    --grist-theme-checkbox-bg: transparent;
    --grist-theme-toggle-checkbox-fg: var(--mat-sys-primary);
    --grist-theme-switch-active-slider: var(--mat-sys-primary);
    --grist-theme-formula-icon: var(--mat-sys-tertiary);
    --grist-theme-ace-editor-bg: var(--mat-sys-surface-container-lowest);
  }

  html[data-ikadoc-visual-style='owarelin'] {
    --ow-color-background: #fafbf9;
    --ow-color-surface: #ffffff;
    --ow-color-surface-soft: #f0f4f2;
    --ow-color-surface-warm: #faf8f3;
    --ow-color-surface-muted: #f7f9f8;
    --ow-color-ink-container: #e8edf0;
    --ow-color-canvas: #f7f9f8;
    --ow-color-panel: #ffffff;
    --ow-color-boundary: rgb(16 40 59 / 16%);
    --ow-color-boundary-strong: rgb(16 40 59 / 24%);
    --ow-color-table-header: #eef2ef;
    --ow-color-row-hover: #f4f7f5;
    --ow-color-surface-glass: rgb(255 255 255 / 86%);
    --ow-color-ink: #10283b;
    --ow-color-text: #0c0a0a;
    --ow-color-muted: rgb(16 40 59 / 78%);
    --ow-color-subtle: rgb(16 40 59 / 60%);
    --ow-color-primary: #1b513a;
    --ow-color-primary-hover: #10283b;
    --ow-color-accent: #c7663b;
    --ow-color-error: #c7663b;
    --ow-color-border: #c2ccc7;
    --ow-color-border-soft: #d9e0dc;
    --ow-color-focus-ring: rgb(16 40 59 / 16%);
    --ow-shadow-control-focus: 0 0.875rem 2rem rgb(27 81 58 / 10%);
    --ow-shadow-overlay: 0 1.25rem 3.75rem rgb(16 40 59 / 16%);
    --ow-radius-pill: 999rem;
    --ow-radius-control: 1.35rem;
    --ow-radius-card: 1.75rem;
    --ik-font-body: 'Owarelin Inter', Inter, Roboto, Arial, sans-serif;
    --ik-font-heading: 'Owarelin Fraunces', Fraunces, Georgia, serif;
    --ik-menu-bg: var(--ow-color-panel);
    --ik-table-row-hover: var(--ow-color-row-hover);
    --mat-sys-background: #fafbf9;
    --mat-sys-surface: #ffffff;
    --mat-sys-surface-container-lowest: #ffffff;
    --mat-sys-surface-container-low: #f7f9f8;
    --mat-sys-surface-container: #f0f4f2;
    --mat-sys-surface-container-high: #e8edf0;
    --mat-sys-on-surface: #0c0a0a;
    --mat-sys-on-surface-variant: rgb(16 40 59 / 78%);
    --mat-sys-outline: #6f7d78;
    --mat-sys-outline-variant: #c7d0cb;
    --mat-sys-primary: var(--ow-color-primary);
    --mat-sys-primary-container: rgb(27 81 58 / 11%);
    --mat-sys-on-primary-container: var(--ow-color-ink);
    --mat-sys-secondary-container: #e8edf0;
    --mat-sys-on-secondary-container: #10283b;
    --mat-sys-tertiary: var(--ow-color-accent);
    --mat-sys-tertiary-container: rgb(199 102 59 / 13%);
    --mat-sys-on-tertiary-container: #7c321b;
    --mat-sys-error: var(--ow-color-error);
    --grist-theme-control-primary-hover-bg: var(--ow-color-primary-hover);
    --grist-theme-table-header-bg: var(--ow-color-table-header);
    --grist-theme-table-body-border: color-mix(in srgb, var(--ow-color-boundary) 62%, transparent);
    --grist-theme-hover: var(--ik-state-hover);
    --grist-theme-selection: var(--ik-state-selected);
    --grist-theme-cursor: var(--ow-color-primary);
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] {
    color-scheme: dark;
    --ik-menu-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 36%), 0 1rem 2rem rgb(0 0 0 / 30%);
    --ik-menu-bg: var(--mat-sys-surface-container);
    --ik-table-row-hover: var(--mat-sys-surface-container-low);
    --mat-sys-background: #101417;
    --mat-sys-surface: #13181b;
    --mat-sys-surface-container-lowest: #0c1012;
    --mat-sys-surface-container-low: #151a1d;
    --mat-sys-surface-container: #1a2023;
    --mat-sys-surface-container-high: #22292d;
    --mat-sys-on-surface: #e9efed;
    --mat-sys-on-surface-variant: rgb(216 226 222 / 78%);
    --mat-sys-outline: #8d9a96;
    --mat-sys-outline-variant: #394541;
    --mat-sys-primary: #a7c8e8;
    --mat-sys-on-primary: #10283b;
    --mat-sys-secondary-container: #24313a;
    --mat-sys-on-secondary-container: #e0edf5;
    --mat-sys-tertiary: #ffc982;
    --mat-sys-tertiary-container: rgb(255 201 130 / 16%);
    --mat-sys-on-tertiary-container: #ffd9a4;
    --mat-sys-error: #ffb4ab;
    --ik-focus-ring: 0 0 0 0.125rem color-mix(in srgb, var(--mat-sys-primary) 32%, transparent);
    --icon-GristLogo: url("icons/owarelin-records-icon-dark.svg");
    --icon-GristWideLogo: url("icons/owarelin-records-icon-dark.svg");
    --grist-theme-control-primary-hover-bg: #d8ebff;
    --grist-theme-control-border: 0.0625rem solid var(--ik-app-border);
    --grist-theme-input-border: var(--ik-app-border);
    --grist-theme-menu-border: rgb(216 226 222 / 14%);
    --grist-theme-dark-text: var(--mat-sys-on-surface);
    --grist-theme-disabled-text: rgb(216 226 222 / 42%);
    --grist-theme-table-header-bg: #1e272b;
    --grist-theme-table-header-fg: #e0edf5;
    --grist-theme-table-header-border: rgb(216 226 222 / 16%);
    --grist-theme-table-header-selected-bg: #263833;
    --grist-theme-table-header-selected-fg: #e9efed;
    --grist-theme-table-body-border: rgb(216 226 222 / 10%);
    --grist-theme-hover: var(--ik-state-hover);
    --grist-theme-selection: var(--ik-state-selected);
    --grist-theme-selection-opaque: var(--ik-state-selected-opaque);
    --grist-theme-selection-opaque-bg: var(--ik-state-selected-opaque);
    --grist-theme-selection-header: var(--ik-state-selected-strong);
  }

  html[data-ikadoc-visual-style='owarelin'][data-grist-appearance='dark'] {
    --ow-color-background: #101113;
    --ow-color-surface: #191b1e;
    --ow-color-surface-soft: #24272b;
    --ow-color-surface-warm: #1d1f22;
    --ow-color-surface-muted: #202327;
    --ow-color-ink-container: #282b30;
    --ow-color-canvas: #121416;
    --ow-color-panel: #191b1e;
    --ow-color-boundary: rgb(245 243 238 / 18%);
    --ow-color-boundary-strong: rgb(245 243 238 / 28%);
    --ow-color-table-header: #24272b;
    --ow-color-row-hover: #202327;
    --ow-color-surface-glass: rgb(25 27 30 / 90%);
    --ow-color-ink: #f5f3ee;
    --ow-color-text: #f5f3ee;
    --ow-color-muted: rgb(245 243 238 / 82%);
    --ow-color-subtle: rgb(245 243 238 / 68%);
    --ow-color-primary: #86b99a;
    --ow-color-primary-hover: #9fcdb2;
    --ow-color-accent: #d98961;
    --ow-color-error: #f0a07a;
    --ow-color-border: #53585d;
    --ow-color-border-soft: #3c4146;
    --ow-color-focus-ring: rgb(159 205 178 / 24%);
    --ow-shadow-control-focus: 0 0.875rem 2rem rgb(134 185 154 / 14%);
    --ow-shadow-overlay: 0 1.875rem 5.625rem rgb(0 0 0 / 42%);
    --ik-menu-bg: var(--ow-color-panel);
    --ik-table-row-hover: var(--ow-color-row-hover);
    --mat-sys-background: var(--ow-color-background);
    --mat-sys-surface: var(--ow-color-surface);
    --mat-sys-surface-container-lowest: #191b1e;
    --mat-sys-surface-container-low: #1a1c1f;
    --mat-sys-surface-container: #202327;
    --mat-sys-surface-container-high: #2a2e33;
    --mat-sys-on-surface: var(--ow-color-text);
    --mat-sys-on-surface-variant: var(--ow-color-muted);
    --mat-sys-outline: #8a9095;
    --mat-sys-outline-variant: #5d6369;
    --mat-sys-primary: var(--ow-color-primary);
    --mat-sys-on-primary: #0f1012;
    --mat-sys-primary-container: rgb(67 104 81 / 72%);
    --mat-sys-on-primary-container: #e4f4e9;
    --mat-sys-secondary-container: #282b30;
    --mat-sys-on-secondary-container: #f5f3ee;
    --mat-sys-tertiary: var(--ow-color-accent);
    --mat-sys-tertiary-container: rgb(99 58 37 / 70%);
    --mat-sys-on-tertiary-container: #ffd9c6;
    --mat-sys-error: var(--ow-color-error);
    --grist-theme-control-primary-hover-bg: var(--ow-color-primary-hover);
    --grist-theme-table-header-bg: var(--ow-color-table-header);
    --grist-theme-hover: var(--ik-state-hover);
    --grist-theme-selection: var(--ik-state-selected);
    --grist-theme-cursor: var(--ow-color-primary);
  }

  html[data-ikadoc-runtime='true'] body,
  html[data-ikadoc-runtime='true'] input,
  html[data-ikadoc-runtime='true'] select,
  html[data-ikadoc-runtime='true'] textarea,
  html[data-ikadoc-runtime='true'] button {
    font-family: var(--ik-font-body);
    letter-spacing: 0;
  }

  html[data-ikadoc-runtime='true'] body {
    font: var(--mat-sys-body-medium);
    text-rendering: geometricPrecision;
    -webkit-font-smoothing: antialiased;
  }

  html[data-ikadoc-runtime='true'] [style*='mask-image'] {
    background-color: var(--ik-icon-muted);
    --icon-color: var(--ik-icon-muted);
    width: var(--ik-icon-size);
    height: var(--ik-icon-size);
  }

  html[data-ikadoc-runtime='true'] button:has(> [style*='mask-image']) {
    min-width: var(--ik-icon-button-size);
    min-height: var(--ik-icon-button-size);
    padding: 0.25rem;
    border-radius: var(--ik-radius-pill);
    color: var(--mat-sys-on-surface-variant);
    transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
  }

  html[data-ikadoc-runtime='true'] button:has(> [style*='mask-image']):hover {
    background: var(--ik-state-hover);
    color: var(--mat-sys-primary);
    --icon-color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] button:disabled:has(> [style*='mask-image']),
  html[data-ikadoc-runtime='true'] button:disabled:has(> [style*='mask-image']):hover,
  html[data-ikadoc-runtime='true'] .test-undo[aria-disabled='true'],
  html[data-ikadoc-runtime='true'] .test-redo[aria-disabled='true'] {
    color: color-mix(in srgb, var(--mat-sys-on-surface) 32%, transparent);
    background: transparent;
    --icon-color: color-mix(in srgb, var(--mat-sys-on-surface) 32%, transparent);
  }

  html[data-ikadoc-runtime='true'] button:has(> [style*='mask-image']):active {
    background: var(--ik-state-pressed);
  }

  html[data-ikadoc-runtime='true'] button:focus-visible,
  html[data-ikadoc-runtime='true'] input:focus-visible,
  html[data-ikadoc-runtime='true'] [role='menuitem']:focus-visible {
    outline: none;
    box-shadow: var(--ik-focus-ring);
  }

  html[data-ikadoc-runtime='true'] body,
  html[data-ikadoc-runtime='true'] .test-main-pane,
  html[data-ikadoc-runtime='true'] .test-main-content,
  html[data-ikadoc-runtime='true'] .test-gristdoc {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-background);
  }

  html[data-ikadoc-runtime='true'] .test-left-panel {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-low);
    border-color: var(--ik-app-border);
    box-shadow: inset -0.0625rem 0 0 var(--ik-app-border);
  }

  html[data-ikadoc-runtime='true'] .test-top-header {
    color: var(--mat-sys-on-surface);
    background: color-mix(in srgb, var(--mat-sys-surface-container-lowest) 92%, transparent);
    border-color: var(--ik-app-border);
    min-height: 3rem;
    box-shadow: inset 0 -0.0625rem 0 var(--ik-app-border);
    backdrop-filter: blur(12px);
  }

  html[data-ikadoc-runtime='true'] .test-top-header > button:has(> .test-left-opener) {
    position: static;
    width: 2.25rem;
    min-width: 2.25rem;
    height: 2.25rem;
    min-height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    margin: 0 0.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--ik-radius-pill);
    color: var(--mat-sys-on-surface-variant);
    background: transparent;
    transform: none;
  }

  html[data-ikadoc-runtime='true'] .test-dm-logo {
    border-radius: var(--ik-radius-md);
    background-color: var(--mat-sys-surface-container-lowest);
    box-shadow: inset 0 0 0 0.0625rem var(--ik-app-border);
  }

  html[data-ikadoc-runtime='true'] .test-docpage-link,
  html[data-ikadoc-runtime='true'] .test-tools-log {
    min-height: 2.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--mat-sys-on-surface-variant);
    border-radius: var(--ik-radius-md);
    font: var(--mat-sys-label-large);
    transition: background-color 160ms ease, color 160ms ease;
  }

  html[data-ikadoc-runtime='true'] .test-docpage-link:hover,
  html[data-ikadoc-runtime='true'] .test-tools-log:hover {
    color: var(--mat-sys-on-surface);
    background: var(--ik-state-hover);
  }

  html[data-ikadoc-runtime='true'] .test-treeview-itemHeader.selected .test-docpage-link {
    color: var(--mat-sys-on-secondary-container);
    background: var(--mat-sys-secondary-container);
  }

  html[data-ikadoc-runtime='true'] .test-docpage-initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.375rem;
    height: 1.375rem;
    flex: 0 0 1.375rem;
    background: var(--mat-sys-primary-container);
    color: var(--mat-sys-on-primary-container);
    font: var(--mat-sys-label-medium);
    border-radius: var(--ik-radius-sm);
  }

  html[data-ikadoc-runtime='true'] #grist-tools-heading {
    color: var(--mat-sys-on-surface-variant);
    font: var(--mat-sys-label-medium);
    letter-spacing: 0;
    text-transform: uppercase;
  }

  html[data-ikadoc-runtime='true'] .test-bc-workspace,
  html[data-ikadoc-runtime='true'] .test-bc-doc,
  html[data-ikadoc-runtime='true'] .test-bc-page,
  html[data-ikadoc-runtime='true'] .test-bc-separator,
  html[data-ikadoc-runtime='true'] .test-ikadoc-editor-status {
    color: var(--mat-sys-on-surface-variant);
    font: var(--mat-sys-label-large);
  }

  html[data-ikadoc-runtime='true'] .test-ikadoc-editor-status {
    width: 2rem;
    min-width: 2rem;
    max-width: 2rem;
    height: 2rem;
    min-height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 2rem;
    padding: 0;
    border: 0.0625rem solid color-mix(in srgb, var(--mat-sys-primary) 22%, transparent);
    border-radius: var(--ik-radius-pill);
    background: color-mix(in srgb, var(--mat-sys-primary) 10%, var(--mat-sys-surface-container-lowest));
    color: var(--mat-sys-primary);
    font-size: 0;
    overflow: hidden;
    --icon-color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .test-ikadoc-editor-status::before {
    content: 'data_object';
    color: currentColor;
    font-family: 'Material Symbols Outlined';
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html[data-ikadoc-runtime='true'] .test-page-entry,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry'],
  html[data-ikadoc-runtime='true'] .test-tools-list-item {
    color: var(--mat-sys-on-surface-variant);
    min-height: 2.25rem;
    border-radius: var(--ik-radius-md);
  }

  html[data-ikadoc-runtime='true'] .test-page-entry:hover,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry']:hover,
  html[data-ikadoc-runtime='true'] .test-tools-list-item:hover {
    background: var(--ik-state-hover);
  }

  html[data-ikadoc-runtime='true'] .test-page-entry-selected,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry'].test-page-entry-selected {
    color: var(--mat-sys-on-secondary-container);
    background: var(--ik-state-selected);
  }

  html[data-ikadoc-runtime='true'] .test-dm-org {
    min-height: 2.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    padding: 0 0.75rem;
    border: 0.0625rem solid var(--ik-compact-field-border);
    border-radius: var(--ik-radius-sm);
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-lowest);
  }

  html[data-ikadoc-runtime='true'] .test-dm-orgname {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font: var(--mat-sys-label-large);
  }

  html[data-ikadoc-runtime='true'] .test-tools-log > [style*='mask-image'] {
    flex: 0 0 var(--ik-icon-size);
  }

  html[data-ikadoc-runtime='true'] .test-left-opener,
  html[data-ikadoc-runtime='true'] .test-tools-menu-trigger {
    color: var(--mat-sys-on-surface-variant);
    border-radius: var(--ik-radius-pill);
    background-color: transparent;
    --icon-color: var(--mat-sys-on-surface-variant);
  }

  html[data-ikadoc-runtime='true'] .test-left-opener {
    position: static;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    min-width: 2.25rem;
    height: 2.25rem;
    min-height: 2.25rem;
    padding: 0;
    color: transparent;
    background: none;
    transform: none;
    transition: color 160ms ease, background-color 160ms ease;
    -webkit-mask-image: none !important;
    mask-image: none !important;
    -webkit-mask-size: auto;
    mask-size: auto;
  }

  html[data-ikadoc-runtime='true'] .test-left-opener::before {
    content: 'left_panel_open';
    color: var(--mat-sys-on-surface-variant);
    font-family: 'Material Symbols Outlined';
    font-size: 1.5rem;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html[data-ikadoc-runtime='true'] .test-left-opener[class*='-open']::before {
    content: 'left_panel_close';
  }

  html[data-ikadoc-runtime='true'] .test-left-opener:hover,
  html[data-ikadoc-runtime='true'] .test-tools-menu-trigger:hover {
    color: var(--mat-sys-primary);
    background-color: var(--ik-state-hover);
    --icon-color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .test-top-header > button:has(> .test-left-opener):hover .test-left-opener::before {
    color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .grist-floating-menu,
  html[data-ikadoc-runtime='true'] .weasel-popup,
  html[data-ikadoc-runtime='true'] .test-autocomplete {
    color: var(--mat-sys-on-surface);
    background: var(--ik-menu-bg);
    border: 0.0625rem solid color-mix(in srgb, var(--mat-sys-outline-variant) 42%, transparent);
    border-radius: var(--ik-menu-container-shape);
    box-shadow: var(--ik-menu-shadow);
    padding: 0.25rem;
    overflow: hidden;
  }

  html[data-ikadoc-runtime='true'] .menu_item,
  html[data-ikadoc-runtime='true'] [role='menuitem'] {
    min-height: 2.25rem;
    padding: 0 0.75rem;
    color: var(--mat-sys-on-surface);
    font: var(--mat-sys-label-medium);
    border-radius: var(--ik-menu-item-shape);
    margin: 0;
  }

  html[data-ikadoc-runtime='true'] .menu_item:hover,
  html[data-ikadoc-runtime='true'] .menu_item.weasel-popup-open,
  html[data-ikadoc-runtime='true'] [role='menuitem']:hover {
    color: var(--mat-sys-on-surface);
    background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    --icon-color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .menu_item-disabled,
  html[data-ikadoc-runtime='true'] .menu_item.disabled,
  html[data-ikadoc-runtime='true'] .menu_item.disabled:hover,
  html[data-ikadoc-runtime='true'] [aria-disabled='true'] {
    color: color-mix(in srgb, var(--mat-sys-on-surface) 48%, transparent);
    background: transparent;
    --icon-color: color-mix(in srgb, var(--mat-sys-on-surface) 48%, transparent);
  }

  html[data-ikadoc-runtime='true'] .menu_divider,
  html[data-ikadoc-runtime='true'] .weasel-popup .menu_divider {
    border-color: var(--ik-app-border);
  }

  html[data-ikadoc-runtime='true'] .gridview_data_pane {
    --gridview-header-height: var(--ik-grid-header-height);
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-lowest);
    border-radius: 0;
  }

  html[data-ikadoc-runtime='true'] .gridview_data_scroll {
    border-color: transparent;
  }

  html[data-ikadoc-runtime='true'] .gridview_stick-top,
  html[data-ikadoc-runtime='true'] .gridview_data_header,
  html[data-ikadoc-runtime='true'] .gridview_header_backdrop_top,
  html[data-ikadoc-runtime='true'] .gridview_header_backdrop_left,
  html[data-ikadoc-runtime='true'] .gridview_data_corner_overlay {
    background: var(--mat-sys-surface-container);
    border-color: var(--ik-app-border);
  }

  html[data-ikadoc-runtime='true'] .column_names.record,
  html[data-ikadoc-runtime='true'] .field.column_name,
  html[data-ikadoc-runtime='true'] .gridview_data_row_num {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container);
    border-color: var(--ik-grid-border-strong);
    font-family: var(--ik-font-body);
    font-size: 0.8125rem;
    font-weight: 700;
  }

  html[data-ikadoc-runtime='true'] .field.column_name {
    height: var(--ik-grid-header-height);
    line-height: var(--ik-grid-header-height);
    padding: 0 2rem 0 0.5rem;
    color: var(--mat-sys-on-surface);
  }

  html[data-ikadoc-runtime='true'] .field.column_name .g-column-label {
    min-width: 0;
    padding-right: 0;
  }

  html[data-ikadoc-runtime='true'] .field.column_name.selected,
  html[data-ikadoc-runtime='true'] .gridview_data_row_num.selected {
    color: var(--mat-sys-on-primary-container);
    background: var(--ik-state-selected-opaque);
  }

  html[data-ikadoc-runtime='true'] .gridview_row .record-even {
    background: var(--mat-sys-surface-container-lowest);
  }

  html[data-ikadoc-runtime='true'] .gridview_row:hover .record,
  html[data-ikadoc-runtime='true'] .gridview_row:hover .field,
  html[data-ikadoc-runtime='true'] .gridview_row:hover .gridview_data_row_num {
    background: var(--ik-table-row-hover);
  }

  html[data-ikadoc-runtime='true'] .gridview_row .field {
    color: var(--mat-sys-on-surface);
    border-color: var(--ik-grid-border);
    background-color: var(--field-background-color, inherit);
    min-height: var(--ik-grid-row-height);
  }

  html[data-ikadoc-runtime='true'] .gridview_row .field.selected {
    background-color: var(--ik-state-selected-opaque);
  }

  html[data-ikadoc-runtime='true'] .gridview_row .field.selected > .selection {
    background-color: color-mix(in srgb, var(--mat-sys-primary) 10%, transparent);
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .active_cursor {
    outline: 0.125rem solid var(--mat-sys-primary);
    outline-offset: -0.125rem;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .field_clip {
    padding: 0.375rem 0.625rem;
    color: var(--mat-sys-on-surface);
    font-family: var(--ik-font-body);
    font-size: 0.875rem;
    line-height: 1.375rem;
  }

  html[data-ikadoc-runtime='true'] .searchbar-box.grist-navbar-pfx.part-toolbar-group__item {
    min-height: var(--ik-compact-field-height);
    border-radius: var(--ik-radius-pill);
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
  }

  html[data-ikadoc-runtime='true'] .searchbar-box.grist-navbar-pfx.part-toolbar-group__item:focus-within {
    border-color: transparent;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .grist-doc-search-bar,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper {
    height: 2.25rem;
    min-height: 2.25rem;
    max-height: 2.25rem;
    display: inline-flex;
    align-items: center;
    align-self: center;
    border-radius: var(--ik-radius-pill);
    background: var(--mat-sys-surface-container-lowest);
    border: 0.0625rem solid var(--ik-compact-field-border);
    box-shadow: var(--ik-compact-field-shadow);
    overflow: hidden;
  }

  html[data-ikadoc-runtime='true'] .grist-doc-search-bar:focus-within,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper:focus-within {
    border-color: var(--mat-sys-primary);
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .grist-doc-search-bar-collapsed.test-tb-search-wrapper {
    padding: 0;
    border-color: transparent;
    background: transparent;
    overflow: visible;
  }

  html[data-ikadoc-runtime='true'] .grist-doc-search-bar:not(.grist-doc-search-bar-collapsed) {
    padding: 0 0.25rem;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper > button {
    width: 2rem;
    min-width: 2rem;
    height: 2rem;
    min-height: 2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 2rem;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--ik-radius-pill);
    background: transparent;
    color: var(--mat-sys-on-surface-variant);
    --icon-color: var(--mat-sys-on-surface-variant);
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-input {
    color: var(--mat-sys-on-surface);
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    align-self: stretch;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  html[data-ikadoc-runtime='true'] .grist-doc-search-bar-expanded .test-tb-search-input,
  html[data-ikadoc-runtime='true'] .grist-doc-search-bar:not(.grist-doc-search-bar-collapsed) .test-tb-search-input {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-input:focus-within {
    border-color: transparent;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-input input {
    height: 100%;
    flex: 1 1 auto;
    min-width: 12rem;
    color: var(--mat-sys-on-surface);
    background: transparent;
    font: var(--mat-sys-body-medium);
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-input input::placeholder {
    color: var(--grist-theme-input-placeholder-fg);
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper button,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper span,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper label,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper div,
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper [class*='search'],
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper [class*='result'],
  html[data-ikadoc-runtime='true'] .test-tb-search-wrapper [class*='close'] {
    border-left-color: transparent;
    border-right-color: transparent;
    border-color: transparent;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-icon,
  html[data-ikadoc-runtime='true'] .test-tb-search-close > [style*='mask-image'] {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    color: var(--mat-sys-on-surface-variant);
    background: none;
    -webkit-mask-image: none !important;
    mask-image: none !important;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-icon::before,
  html[data-ikadoc-runtime='true'] .test-tb-search-close > [style*='mask-image']::before {
    color: currentColor;
    font-family: 'Material Symbols Outlined';
    font-size: 1.25rem;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-icon::before {
    content: 'search';
  }

  html[data-ikadoc-runtime='true'] .test-tb-search-close > [style*='mask-image']::before {
    content: 'close';
  }

  html[data-ikadoc-runtime='true'] .celleditor_text_editor {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-lowest);
    border-color: var(--mat-sys-primary);
    border-radius: var(--ik-radius-md);
    font-family: var(--ik-font-body);
    box-shadow: var(--ik-compact-field-focus-shadow);
  }

  html[data-ikadoc-runtime='true'] .viewsection_content {
    background: var(--mat-sys-surface-container-lowest);
    border-color: transparent;
    margin: 0;
  }

  html[data-ikadoc-runtime='true'] .viewsection_title {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-lowest);
    border-color: transparent;
    font-family: var(--ik-font-body);
    max-width: 100%;
    overflow: hidden;
    margin-bottom: 0.375rem;
    margin-left: 0;
    padding: 0 0.25rem;
  }

  html[data-ikadoc-runtime='true'] .viewsection_title > div,
  html[data-ikadoc-runtime='true'] .test-widget-title-text {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--ik-font-body);
    letter-spacing: 0;
  }

  html[data-ikadoc-runtime='true'] .view_data_pane_container {
    border: 0;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .active_section > .view_data_pane_container,
  html[data-ikadoc-runtime='true'] .active_section--no-focus > .view_data_pane_container,
  html[data-ikadoc-runtime='true'] .active_section > .view_data_pane_container.viewsection_type_detail {
    border: 0;
    box-shadow: none;
  }

  html[data-ikadoc-runtime='true'] .view_leaf {
    background: var(--mat-sys-surface-container-lowest);
  }

  html[data-ikadoc-runtime='true'] .menu_toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--ik-radius-pill);
    width: var(--ik-grid-icon-button-size);
    min-width: var(--ik-grid-icon-button-size);
    height: var(--ik-grid-icon-button-size);
    min-height: var(--ik-grid-icon-button-size);
    padding: 0;
    transition: background-color 160ms ease, border-color 160ms ease;
  }

  html[data-ikadoc-runtime='true'] .menu_toggle > [style*='mask-image'],
  html[data-ikadoc-runtime='true'] .menu_toggle_icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ik-grid-icon-size);
    height: var(--ik-grid-icon-size);
    margin: 0;
    flex: 0 0 auto;
    color: var(--mat-sys-on-surface-variant);
    background: none;
    -webkit-mask-image: none !important;
    mask-image: none !important;
  }

  html[data-ikadoc-runtime='true'] .menu_toggle_icon::before {
    content: 'keyboard_arrow_down';
    color: currentColor;
    font-family: 'Material Symbols Outlined';
    font-size: 1.125rem;
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
    direction: ltr;
    font-feature-settings: 'liga';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  html[data-ikadoc-runtime='true'] .column_name .g-column-menu-btn,
  html[data-ikadoc-runtime='true'] .column_name.hover-column .menu_toggle {
    visibility: visible;
  }

  html[data-ikadoc-runtime='true'] .column_name .g-column-main-menu,
  html[data-ikadoc-runtime='true'] .column_name .test-column-menu-trigger {
    position: absolute;
    top: 50%;
    right: 0.25rem;
    transform: translateY(-50%);
    z-index: 2;
    opacity: 0.72;
  }

  html[data-ikadoc-runtime='true'] .column_name:hover .g-column-main-menu,
  html[data-ikadoc-runtime='true'] .column_name .g-column-main-menu.weasel-popup-open,
  html[data-ikadoc-runtime='true'] .column_name:hover .test-column-menu-trigger,
  html[data-ikadoc-runtime='true'] .column_name .test-column-menu-trigger.weasel-popup-open {
    opacity: 1;
  }

  html[data-ikadoc-runtime='true'] .gridview_data_row_num {
    padding: 0 1.5rem 0 0.25rem;
    line-height: var(--ik-grid-row-height);
  }

  html[data-ikadoc-runtime='true'] .gridview_data_row_num .test-row-menu-trigger {
    visibility: hidden;
    position: absolute;
    top: 50%;
    right: 0.25rem;
    transform: translateY(-50%);
    z-index: 2;
    opacity: 0;
  }

  html[data-ikadoc-runtime='true'] .gridview_data_row_num:hover .test-row-menu-trigger,
  html[data-ikadoc-runtime='true'] .gridview_data_row_num .test-row-menu-trigger.weasel-popup-open {
    visibility: visible;
    opacity: 1;
  }

  html[data-ikadoc-runtime='true'] .menu_toggle:hover,
  html[data-ikadoc-runtime='true'] .menu_toggle.weasel-popup-open {
    background: var(--ik-state-hover);
    border-color: var(--mat-sys-primary);
    --icon-color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .menu_toggle:hover .menu_toggle_icon,
  html[data-ikadoc-runtime='true'] .menu_toggle.weasel-popup-open .menu_toggle_icon {
    color: var(--mat-sys-primary);
  }

  html[data-ikadoc-runtime='true'] .test-selection-summary-count,
  html[data-ikadoc-runtime='true'] .test-selection-summary-dimensions {
    color: var(--mat-sys-on-surface-variant);
    background: var(--mat-sys-surface-container);
    border-radius: var(--ik-radius-sm);
    font: var(--mat-sys-label-medium);
  }

  html[data-ikadoc-runtime='true'] .test-importer-dialog,
  html[data-ikadoc-runtime='true'] .modal-dialog,
  html[data-ikadoc-runtime='true'] .modal-content {
    color: var(--mat-sys-on-surface);
    background: var(--mat-sys-surface-container-lowest);
    border-color: var(--mat-sys-outline-variant);
  }

  html[data-ikadoc-runtime='true'] input:disabled,
  html[data-ikadoc-runtime='true'] select:disabled,
  html[data-ikadoc-runtime='true'] textarea:disabled,
  html[data-ikadoc-runtime='true'] button:disabled {
    opacity: 1;
  }
`;
