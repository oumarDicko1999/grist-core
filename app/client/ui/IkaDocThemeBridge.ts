import { getOrCreateStyleElement } from "app/client/lib/getOrCreateStyleElement";
import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";
import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { getGristConfig } from "app/common/urlUtils";

const IKA_DOC_THEME_BRIDGE_STYLE_ID = "ikadoc-theme-bridge";

export function attachIkaDocThemeBridge(): void {
  const runtimeConfig = parseIkaDocRuntimeConfigFromLoadConfig(getGristConfig());
  if (runtimeConfig.kind !== "enabled") {
    return;
  }

  applyIkaDocThemeBridgeState({
    appearance: runtimeConfig.config.appearance,
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
@layer grist-custom {
  html[data-ikadoc-runtime='true'] {
    --ik-radius-xs: 0.25rem;
    --ik-radius-sm: 0.5rem;
    --ik-radius-md: 0.875rem;
    --ik-radius-lg: 1.25rem;
    --ik-radius-xl: 1.75rem;
    --ik-font-headline: 'Manrope', system-ui, sans-serif;
    --ik-font-body: 'Inter', system-ui, sans-serif;
    --ik-ease-standard: cubic-bezier(0.2, 0, 0, 1);
    --ik-dur-fast: 140ms;

    --mat-sys-background: #fafbf9;
    --mat-sys-surface: #ffffff;
    --mat-sys-surface-container-lowest: #ffffff;
    --mat-sys-surface-container-low: #fbfcfa;
    --mat-sys-surface-container: #f7f9f8;
    --mat-sys-surface-container-high: #eef3f1;
    --mat-sys-surface-container-highest: #e7edeb;
    --mat-sys-on-surface: #0c0a0a;
    --mat-sys-on-surface-variant: rgb(16 40 59 / 78%);
    --mat-sys-outline: #6f7d78;
    --mat-sys-outline-variant: #c7d0cb;
    --mat-sys-primary: #1b513a;
    --mat-sys-on-primary: #ffffff;
    --mat-sys-primary-container: rgb(27 81 58 / 11%);
    --mat-sys-on-primary-container: #10283b;
    --mat-sys-secondary: #10283b;
    --mat-sys-secondary-container: #e8edf0;
    --mat-sys-on-secondary-container: #10283b;
    --mat-sys-tertiary: #c7663b;
    --mat-sys-tertiary-container: rgb(199 102 59 / 12%);
    --mat-sys-error: #c7663b;

    --grist-theme-font-family: var(--ik-font-body);
    --grist-theme-font-family-data: var(--ik-font-body);
    --grist-theme-font-family-mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
    --grist-theme-control-border-radius: var(--ik-radius-lg);
    --grist-theme-control-primary-bg: var(--mat-sys-primary);
    --grist-theme-control-primary-fg: var(--mat-sys-on-primary);
    --grist-theme-control-primary-hover-bg: #10283b;
    --grist-theme-control-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-control-fg: var(--mat-sys-on-surface);
    --grist-theme-control-hover-fg: var(--mat-sys-primary);
    --grist-theme-control-border: 0.0625rem solid rgb(16 40 59 / 16%);
    --grist-theme-input-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-input-fg: var(--mat-sys-on-surface);
    --grist-theme-input-border: rgb(16 40 59 / 18%);
    --grist-theme-input-border-focus: var(--mat-sys-primary);
    --grist-theme-input-placeholder-fg: rgb(16 40 59 / 60%);
    --grist-theme-bg: var(--mat-sys-background);
    --grist-theme-bg-default: var(--mat-sys-background);
    --grist-theme-bg-secondary: var(--mat-sys-surface-container);
    --grist-theme-bg-tertiary: var(--mat-sys-surface-container-high);
    --grist-theme-page-bg: var(--mat-sys-background);
    --grist-theme-main-panel-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-menu-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-menu-border: rgb(16 40 59 / 14%);
    --grist-theme-menu-item-fg: var(--mat-sys-on-surface);
    --grist-theme-menu-item-selected-bg: var(--mat-sys-secondary-container);
    --grist-theme-menu-item-selected-fg: var(--mat-sys-on-secondary-container);
    --grist-theme-text: var(--mat-sys-on-surface);
    --grist-theme-light-text: var(--mat-sys-on-surface-variant);
    --grist-theme-dark-text: #10283b;
    --grist-theme-disabled-text: rgb(16 40 59 / 42%);
    --grist-theme-page-panels-main-panel-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-page-panels-left-panel-bg: var(--mat-sys-surface-container);
    --grist-theme-page-panels-right-panel-bg: var(--mat-sys-surface-container);
    --grist-theme-page-panels-top-header-bg: var(--mat-sys-surface-container-low);
    --grist-theme-page-panels-border: var(--mat-sys-outline-variant);
    --grist-theme-table-header-bg: #eef2ef;
    --grist-theme-table-header-fg: #10283b;
    --grist-theme-table-header-border: rgb(16 40 59 / 16%);
    --grist-theme-table-header-selected-bg: #dfece4;
    --grist-theme-table-header-selected-fg: #10283b;
    --grist-theme-table-body-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-table-body-border: rgb(16 40 59 / 10%);
    --grist-theme-table-add-new-bg: var(--mat-sys-surface-container);
    --grist-theme-cell-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-cell-fg: var(--mat-sys-on-surface);
    --grist-theme-cell-zebra-bg: var(--mat-sys-surface-container-low);
    --grist-theme-cell-editor-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-cell-editor-fg: var(--mat-sys-on-surface);
    --grist-theme-cell-editor-placeholder-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-add-new-circle-fg: var(--mat-sys-on-primary);
    --grist-theme-add-new-circle-bg: var(--mat-sys-primary);
    --grist-theme-add-new-circle-hover-bg: #10283b;
    --grist-theme-add-new-circle-small-fg: var(--mat-sys-on-primary);
    --grist-theme-add-new-circle-small-bg: var(--mat-sys-primary);
    --grist-theme-add-new-circle-small-hover-bg: #10283b;
    --grist-theme-left-panel-page-hover-bg: rgb(27 81 58 / 8%);
    --grist-theme-left-panel-active-page-fg: var(--mat-sys-on-secondary-container);
    --grist-theme-left-panel-active-page-bg: var(--mat-sys-secondary-container);
    --grist-theme-left-panel-disabled-page-fg: rgb(16 40 59 / 42%);
    --grist-theme-right-panel-tab-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-right-panel-tab-bg: var(--mat-sys-surface-container);
    --grist-theme-right-panel-tab-border: var(--mat-sys-outline-variant);
    --grist-theme-right-panel-tab-hover-bg: rgb(27 81 58 / 8%);
    --grist-theme-right-panel-tab-selected-fg: var(--mat-sys-primary);
    --grist-theme-right-panel-tab-selected-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-right-panel-field-settings-bg: var(--mat-sys-surface-container);
    --grist-theme-right-panel-field-settings-button-bg: var(--mat-sys-surface-container-high);
    --grist-theme-input-disabled-fg: rgb(16 40 59 / 36%);
    --grist-theme-input-disabled-bg: rgb(16 40 59 / 6%);
    --grist-theme-input-readonly-bg: var(--mat-sys-surface-container);
    --grist-theme-button-group-bg: var(--mat-sys-surface-container-lowest);
    --grist-theme-button-group-fg: var(--mat-sys-on-surface-variant);
    --grist-theme-button-group-border: var(--mat-sys-outline-variant);
    --grist-theme-button-group-selected-bg: var(--mat-sys-primary-container);
    --grist-theme-button-group-selected-fg: var(--mat-sys-primary);
    --grist-theme-button-group-selected-border: var(--mat-sys-primary);
    --grist-theme-control-disabled-fg: rgb(16 40 59 / 36%);
    --grist-theme-control-disabled-bg: rgb(16 40 59 / 7%);
    --grist-theme-hover: rgb(27 81 58 / 8%);
    --grist-theme-selection: rgb(27 81 58 / 16%);
    --grist-theme-selection-opaque: #dfece4;
    --grist-theme-selection-header: rgb(27 81 58 / 20%);
    --grist-theme-cursor: var(--mat-sys-primary);
    --grist-theme-error: var(--mat-sys-error);
    --grist-theme-warning: #c7663b;
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
    --ow-font-heading: 'Owarelin Fraunces', Fraunces, Georgia, serif;
    --ow-font-body: 'Owarelin Inter', Inter, Arial, sans-serif;
    --ow-radius-pill: 999rem;
    --ow-radius-control: 1.35rem;

    --ik-font-headline: var(--ow-font-heading);
    --ik-font-body: var(--ow-font-body);
    --ik-radius-lg: var(--ow-radius-control);
    --mat-sys-background: var(--ow-color-background);
    --mat-sys-surface: var(--ow-color-surface);
    --mat-sys-surface-container: var(--ow-color-surface-muted);
    --mat-sys-surface-container-high: #eef3f1;
    --mat-sys-on-surface: var(--ow-color-text);
    --mat-sys-on-surface-variant: var(--ow-color-muted);
    --mat-sys-primary: var(--ow-color-primary);
    --mat-sys-primary-container: rgb(27 81 58 / 11%);
    --mat-sys-secondary: var(--ow-color-ink);
    --mat-sys-secondary-container: var(--ow-color-ink-container);
    --mat-sys-tertiary: var(--ow-color-accent);
    --mat-sys-error: var(--ow-color-error);

    --grist-theme-font-family: var(--ow-font-body);
    --grist-theme-font-family-data: var(--ow-font-body);
    --grist-theme-control-border-radius: var(--ow-radius-pill);
    --grist-theme-control-primary-bg: var(--ow-color-primary);
    --grist-theme-control-primary-hover-bg: var(--ow-color-primary-hover);
    --grist-theme-control-border: 0.0625rem solid var(--ow-color-border);
    --grist-theme-table-header-bg: var(--ow-color-table-header);
    --grist-theme-table-body-border: rgb(16 40 59 / 10%);
    --grist-theme-hover: rgb(27 81 58 / 8%);
	    --grist-theme-selection: rgb(27 81 58 / 16%);
	  }

	  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] {
	    --mat-sys-background: #101417;
	    --mat-sys-surface: #13181b;
	    --mat-sys-surface-container-lowest: #0c1012;
	    --mat-sys-surface-container-low: #151a1d;
	    --mat-sys-surface-container: #1a2023;
	    --mat-sys-surface-container-high: #22292d;
	    --mat-sys-surface-container-highest: #2c3438;
	    --mat-sys-on-surface: #e9efed;
	    --mat-sys-on-surface-variant: rgb(216 226 222 / 78%);
	    --mat-sys-outline: #8d9a96;
	    --mat-sys-outline-variant: #394541;
	    --mat-sys-primary: #8fd8b4;
	    --mat-sys-on-primary: #0b2b1d;
	    --mat-sys-primary-container: rgb(143 216 180 / 14%);
	    --mat-sys-on-primary-container: #d8f5e5;
	    --mat-sys-secondary: #b7c8d6;
	    --mat-sys-secondary-container: #24313a;
	    --mat-sys-on-secondary-container: #e0edf5;
	    --mat-sys-tertiary: #f0a47c;
	    --mat-sys-tertiary-container: rgb(240 164 124 / 16%);
	    --mat-sys-error: #ffb59f;

	    --grist-theme-control-primary-hover-bg: #b7c8d6;
	    --grist-theme-control-bg: var(--mat-sys-surface-container);
	    --grist-theme-control-border: 0.0625rem solid rgb(216 226 222 / 18%);
	    --grist-theme-control-disabled-fg: rgb(216 226 222 / 36%);
	    --grist-theme-control-disabled-bg: rgb(216 226 222 / 7%);
	    --grist-theme-input-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-input-border: rgb(216 226 222 / 20%);
	    --grist-theme-input-disabled-fg: rgb(216 226 222 / 34%);
	    --grist-theme-input-disabled-bg: rgb(216 226 222 / 6%);
	    --grist-theme-input-placeholder-fg: rgb(216 226 222 / 56%);
	    --grist-theme-input-readonly-bg: var(--mat-sys-surface-container);
	    --grist-theme-menu-border: rgb(216 226 222 / 14%);
	    --grist-theme-dark-text: var(--mat-sys-on-surface);
	    --grist-theme-disabled-text: rgb(216 226 222 / 42%);
	    --grist-theme-page-panels-main-panel-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-page-panels-left-panel-bg: var(--mat-sys-surface-container);
	    --grist-theme-page-panels-right-panel-bg: var(--mat-sys-surface-container);
	    --grist-theme-page-panels-top-header-bg: var(--mat-sys-surface-container-low);
	    --grist-theme-page-panels-border: var(--mat-sys-outline-variant);
	    --grist-theme-table-header-bg: #1e272b;
	    --grist-theme-table-header-fg: #e0edf5;
	    --grist-theme-table-header-border: rgb(216 226 222 / 16%);
	    --grist-theme-table-header-selected-bg: #263833;
	    --grist-theme-table-header-selected-fg: #e9efed;
	    --grist-theme-table-body-border: rgb(216 226 222 / 10%);
	    --grist-theme-table-add-new-bg: var(--mat-sys-surface-container);
	    --grist-theme-cell-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-cell-fg: var(--mat-sys-on-surface);
	    --grist-theme-cell-zebra-bg: var(--mat-sys-surface-container-low);
	    --grist-theme-cell-editor-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-cell-editor-fg: var(--mat-sys-on-surface);
	    --grist-theme-cell-editor-placeholder-fg: var(--mat-sys-on-surface-variant);
	    --grist-theme-add-new-circle-fg: var(--mat-sys-on-primary);
	    --grist-theme-add-new-circle-bg: var(--mat-sys-primary);
	    --grist-theme-add-new-circle-hover-bg: #b7c8d6;
	    --grist-theme-add-new-circle-small-fg: var(--mat-sys-on-primary);
	    --grist-theme-add-new-circle-small-bg: var(--mat-sys-primary);
	    --grist-theme-add-new-circle-small-hover-bg: #b7c8d6;
	    --grist-theme-left-panel-page-hover-bg: rgb(143 216 180 / 10%);
	    --grist-theme-left-panel-active-page-fg: #d8f5e5;
	    --grist-theme-left-panel-active-page-bg: rgb(143 216 180 / 14%);
	    --grist-theme-left-panel-disabled-page-fg: rgb(216 226 222 / 36%);
	    --grist-theme-right-panel-tab-fg: var(--mat-sys-on-surface-variant);
	    --grist-theme-right-panel-tab-bg: var(--mat-sys-surface-container);
	    --grist-theme-right-panel-tab-border: var(--mat-sys-outline-variant);
	    --grist-theme-right-panel-tab-hover-bg: rgb(143 216 180 / 10%);
	    --grist-theme-right-panel-tab-selected-fg: var(--mat-sys-primary);
	    --grist-theme-right-panel-tab-selected-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-right-panel-field-settings-bg: var(--mat-sys-surface-container);
	    --grist-theme-right-panel-field-settings-button-bg: var(--mat-sys-surface-container-high);
	    --grist-theme-button-group-bg: var(--mat-sys-surface-container-lowest);
	    --grist-theme-button-group-fg: var(--mat-sys-on-surface-variant);
	    --grist-theme-button-group-border: var(--mat-sys-outline-variant);
	    --grist-theme-button-group-selected-bg: var(--mat-sys-primary-container);
	    --grist-theme-button-group-selected-fg: var(--mat-sys-primary);
	    --grist-theme-button-group-selected-border: var(--mat-sys-primary);
	    --grist-theme-hover: rgb(143 216 180 / 10%);
	    --grist-theme-selection: rgb(143 216 180 / 18%);
	    --grist-theme-selection-opaque: #243d32;
	    --grist-theme-selection-header: rgb(143 216 180 / 22%);
	    --grist-theme-warning: #f0a47c;
	  }

	  html[data-ikadoc-visual-style='owarelin'][data-grist-appearance='dark'] {
	    --ow-color-background: #101417;
	    --ow-color-surface: #13181b;
	    --ow-color-surface-soft: #1b2326;
	    --ow-color-surface-warm: #211b17;
	    --ow-color-surface-muted: #1a2023;
	    --ow-color-ink-container: #24313a;
	    --ow-color-canvas: #101417;
	    --ow-color-panel: #13181b;
	    --ow-color-boundary: rgb(216 226 222 / 16%);
	    --ow-color-boundary-strong: rgb(216 226 222 / 24%);
	    --ow-color-table-header: #1e272b;
	    --ow-color-row-hover: #19211d;
	    --ow-color-ink: #e0edf5;
	    --ow-color-text: #e9efed;
	    --ow-color-muted: rgb(216 226 222 / 78%);
	    --ow-color-subtle: rgb(216 226 222 / 60%);
	    --ow-color-primary: #8fd8b4;
	    --ow-color-primary-hover: #b7c8d6;
	    --ow-color-accent: #f0a47c;
	    --ow-color-error: #ffb59f;
	    --ow-color-border: #52615c;
	    --ow-color-border-soft: #394541;

	    --grist-theme-control-primary-bg: var(--ow-color-primary);
	    --grist-theme-control-primary-hover-bg: var(--ow-color-primary-hover);
	    --grist-theme-table-header-bg: var(--ow-color-table-header);
	    --grist-theme-table-body-border: rgb(216 226 222 / 10%);
	    --grist-theme-hover: rgb(143 216 180 / 10%);
	    --grist-theme-selection: rgb(143 216 180 / 18%);
	  }

  html[data-ikadoc-runtime='true'] body {
    background: var(--mat-sys-background);
    color: var(--mat-sys-on-surface);
    font-family: var(--ik-font-body);
  }

  html[data-ikadoc-runtime='true'] button {
    letter-spacing: 0;
  }

  html[data-ikadoc-runtime='true'] [data-test-id='test-dp-add-new'] {
    color: var(--mat-sys-on-primary);
    background-color: var(--mat-sys-primary);
    border-radius: var(--ik-radius-sm);
    transition:
      background-color var(--ik-dur-fast) var(--ik-ease-standard),
      color var(--ik-dur-fast) var(--ik-ease-standard);
  }

  html[data-ikadoc-runtime='true'] [data-test-id='test-dp-add-new']:hover,
  html[data-ikadoc-runtime='true'] [data-test-id='test-dp-add-new'].weasel-popup-open {
    background-color: var(--grist-theme-control-primary-hover-bg);
  }

  html[data-ikadoc-runtime='true'] [data-test-id='test-dp-add-new'] * {
    color: inherit;
  }

  html[data-ikadoc-runtime='true'] .record {
    color: var(--grist-theme-cell-fg);
  }

  html[data-ikadoc-runtime='true'] .field_clip {
    color: var(--grist-actual-cell-color, var(--grist-theme-cell-fg));
  }

  html[data-ikadoc-runtime='true'] .field,
  html[data-ikadoc-runtime='true'] .column_name,
  html[data-ikadoc-runtime='true'] .gridview_data_row_num,
  html[data-ikadoc-runtime='true'] .celleditor_text_editor,
  html[data-ikadoc-runtime='true'] .celleditor_content_measure {
    color: var(--grist-theme-cell-fg);
  }

  html[data-ikadoc-runtime='true'] .record,
  html[data-ikadoc-runtime='true'] .gridview_data_pane,
  html[data-ikadoc-runtime='true'] .gridview_row {
    background-color: var(--grist-theme-cell-bg);
  }

  html[data-ikadoc-runtime='true'] .record.record-zebra.record-even {
    background-color: var(--grist-theme-cell-zebra-bg);
  }

  html[data-ikadoc-runtime='true'] .test-importer-dialog,
  html[data-ikadoc-runtime='true'] .test-importer-dialog .modal-body,
  html[data-ikadoc-runtime='true'] .test-importer-dialog .gridview_data_pane,
  html[data-ikadoc-runtime='true'] .test-importer-dialog .record {
    color: var(--grist-theme-cell-fg);
    background-color: var(--mat-sys-surface-container-lowest);
  }

  html[data-ikadoc-runtime='true'] .test-importer-dialog .field_clip,
  html[data-ikadoc-runtime='true'] .test-importer-dialog .column_name,
  html[data-ikadoc-runtime='true'] .test-importer-dialog .gridview_data_row_num {
    color: var(--grist-theme-cell-fg) !important;
  }

  html[data-ikadoc-runtime='true'] .menu_item:hover,
  html[data-ikadoc-runtime='true'] .menu_item.weasel-popup-open,
  html[data-ikadoc-runtime='true'] [role='menuitem']:hover {
    color: var(--grist-theme-menu-item-selected-fg) !important;
    background-color: var(--grist-theme-menu-item-selected-bg) !important;
  }

  html[data-ikadoc-runtime='true'] .test-page-entry-selected,
  html[data-ikadoc-runtime='true'] .test-page-entry-selected:hover,
  html[data-ikadoc-runtime='true'] .test-page-entry-selected.weasel-popup-open,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry'].test-page-entry-selected,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry'].test-page-entry-selected:hover,
  html[data-ikadoc-runtime='true'] [data-test-id='test-page-entry'].test-page-entry-selected.weasel-popup-open {
    color: var(--grist-theme-left-panel-active-page-fg) !important;
    background-color: var(--grist-theme-left-panel-active-page-bg) !important;
    --icon-color: var(--grist-theme-left-panel-active-page-fg) !important;
  }

  html[data-ikadoc-runtime='true'] .fieldbuilder_settings {
    color: var(--mat-sys-on-surface);
    border-top: 1px solid var(--mat-sys-outline-variant);
  }

  html[data-ikadoc-runtime='true'] .fieldbuilder_settings_button {
    color: var(--mat-sys-on-surface);
    border: 1px solid var(--mat-sys-outline-variant);
    border-radius: var(--ik-radius-sm);
  }

  html[data-ikadoc-runtime='true'] input:disabled,
  html[data-ikadoc-runtime='true'] select:disabled,
  html[data-ikadoc-runtime='true'] textarea:disabled,
  html[data-ikadoc-runtime='true'] button:disabled {
    opacity: 1;
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] input:disabled,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] select:disabled,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] textarea:disabled {
    color: var(--grist-theme-input-disabled-fg) !important;
    background-color: var(--grist-theme-input-disabled-bg) !important;
    border-color: var(--mat-sys-outline-variant) !important;
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] button:disabled {
    color: var(--grist-theme-control-disabled-fg) !important;
    background-color: var(--grist-theme-control-disabled-bg) !important;
    border-color: var(--mat-sys-outline-variant) !important;
    --icon-color: var(--grist-theme-control-disabled-fg) !important;
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .fieldbuilder_settings {
    background-color: var(--mat-sys-surface-container-low);
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .record,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .field_clip,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .gridview_data_row_num,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .field.column_name {
    color: var(--grist-theme-cell-fg);
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .fieldbuilder_settings_button {
    color: var(--mat-sys-on-surface);
    background-color: var(--mat-sys-surface-container-high);
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .test-config-container-disabled {
    opacity: 0.58;
  }

  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .test-config-container-disabled,
  html[data-ikadoc-runtime='true'][data-grist-appearance='dark'] .test-config-container-disabled * {
    color: var(--grist-theme-disabled-text) !important;
    --icon-color: var(--grist-theme-disabled-text) !important;
  }
}`;
