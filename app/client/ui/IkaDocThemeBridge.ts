import { getOrCreateStyleElement } from "app/client/lib/getOrCreateStyleElement";
import { parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { IKADOC_PALETTE, IkaDocVisualStyleName } from "app/common/themes/ikadocPalette";
import { getGristConfig } from "app/common/urlUtils";
import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";

const IKA_DOC_THEME_BRIDGE_STYLE_ID = "ikadoc-theme-bridge";

/**
 * Shapes that differ between IkaDoc's visual styles, as measured in the IkaDoc frontend.
 * Owarelin: pill fields, rounded menus. Material: Material 3 defaults.
 * In px: IkaDoc's 1.35rem is 21.6px at its 16px root, and Grist's root font is 13px.
 */
const STYLE_SHAPES: Record<IkaDocVisualStyleName, Record<string, string>> = {
  owarelin: {
    "field-radius": "21.6px",
    "menu-radius": "21.6px",
    "menu-shadow": "0 20px 60px rgba(16, 40, 59, 0.16)",
    "control-weight": "700",
  },
  material: {
    "field-radius": "4px",
    "menu-radius": "4px",
    "menu-shadow": "0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px rgba(0, 0, 0, 0.14), 0 1px 5px rgba(0, 0, 0, 0.12)",
    "control-weight": "500",
  },
};

/**
 * GW-THM-04: colors come from the native IkaDoc themes (IkaDocThemes.ts).
 * This bridge serves the IkaDoc fonts and the shapes and density Grist's theme tokens
 * cannot express: grid rows, headers, row stripes and hover, chips, fields, menus, dialogs.
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

  styleElement.textContent = [
    IKA_DOC_FONT_FACES,
    styleVariables("owarelin"),
    styleVariables("material"),
    IKA_DOC_SHAPES,
  ].join("\n");
}

/** The style's shapes, and grid colors from the IkaDoc table, as CSS variables. */
function styleVariables(style: IkaDocVisualStyleName): string {
  const { light, dark } = IKADOC_PALETTE[style];
  const selector = `html[data-ikadoc-visual-style='${style}']`;

  const gridVariables = (grid: typeof light.grid | typeof dark.grid) => `
    --ikadoc-row-even-bg: ${grid.rowEvenBg};
    --ikadoc-row-hover-bg: ${grid.rowHoverBg};
    --ikadoc-cell-border-right: ${grid.cellBorderRight};
    --ikadoc-header-border-right: ${grid.headerBorderRight};
    --ikadoc-header-border-bottom: ${grid.headerBorderBottom};
  `;

  const shapes = Object.entries(STYLE_SHAPES[style])
    .map(([name, value]) => `--ikadoc-${name}: ${value};`)
    .join("\n    ");

  return `
  ${selector} {
    ${shapes}
    ${gridVariables(light.grid)}
  }

  ${selector}[data-grist-appearance='dark'] {
    ${gridVariables(dark.grid)}
  }
  `;
}

const IKA_DOC_FONT_FACES = `
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

/**
 * Sizes from the IkaDoc record table (record-table.component.ts): 42px headers in 12px bold,
 * 46px rows in 13px with 16px side padding, row stripes and hover.
 * Rows use a 24px line so a 24px chip fits: 11 + 24 + 10 + 1px border = 46px.
 * Grist measures row heights from the DOM, so taller rows scroll correctly.
 */
const IKA_DOC_SHAPES = `
  html[data-ikadoc-visual-style] .gridview_data_pane {
    --gridview-header-height: 42px;
  }

  /* Grist's own header color rule is invalid CSS (a fallback list ending in "unset"),
     so the header inherits the cell color; restate it with a valid fallback. */
  html[data-ikadoc-visual-style] .field.column_name {
    padding: 0 16px;
    font-size: 12px;
    font-weight: 700;
    text-align: left;
    color: var(--grist-header-color, var(--grist-theme-table-header-fg));
    border-right-color: var(--ikadoc-header-border-right);
  }

  html[data-ikadoc-visual-style] .field.column_name .g-column-label {
    justify-content: flex-start;
  }

  html[data-ikadoc-visual-style] .column_names.record {
    border-bottom: 1px solid var(--ikadoc-header-border-bottom);
  }

  html[data-ikadoc-visual-style] .field_clip,
  html[data-ikadoc-visual-style] .celleditor_cursor_editor {
    padding: 11px 16px 10px;
    line-height: 24px;
  }

  html[data-ikadoc-visual-style] .gridview_data_row_num {
    padding-top: 11px;
    line-height: 24px;
  }

  html[data-ikadoc-visual-style] .record-vlines > .field {
    border-right-color: var(--ikadoc-cell-border-right);
  }

  /* Stripes and hover give way to Grist's diff colors and conditional row styles. */
  html[data-ikadoc-visual-style] .record.record-even:not(.record-add) {
    background-color: var(--grist-diff-background-color,
                      var(--grist-row-rule-background-color,
                      var(--ikadoc-row-even-bg)));
  }

  html[data-ikadoc-visual-style] .gridview_row:hover > .record:not(.record-add) {
    background-color: var(--grist-diff-background-color,
                      var(--grist-row-rule-background-color,
                      var(--ikadoc-row-hover-bg)));
  }

  html[data-ikadoc-visual-style] .test-choice-token {
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;

    /* Grist's 2px vertical margin would make rows with a chip 4px taller. */
    margin-top: 0;
    margin-bottom: 0;
  }

  /* The add button sets its own radius instead of Grist's control radius. */
  html[data-ikadoc-visual-style] .test-dp-add-new {
    border-radius: 9999px;
  }

  html[data-ikadoc-visual-style] .test-treeview-itemHeader {
    border-radius: 9999px;
  }

  html[data-ikadoc-visual-style] .test-right-panel input:not([type='checkbox']):not([type='radio']),
  html[data-ikadoc-visual-style] .test-right-panel .test-select-open,
  html[data-ikadoc-visual-style] .test-modal-dialog input:not([type='checkbox']):not([type='radio']) {
    border-radius: var(--ikadoc-field-radius);
  }

  html[data-ikadoc-visual-style] .grist-floating-menu {
    border-radius: var(--ikadoc-menu-radius);
    box-shadow: var(--ikadoc-menu-shadow);
    overflow: hidden;
  }

  /* IkaDoc menu items: 48px, 14px medium. */
  html[data-ikadoc-visual-style] .grist-floating-menu > li {
    box-sizing: border-box;
    min-height: 48px;
    padding-top: 0;
    padding-bottom: 0;
    align-items: center;
    font-size: 14px;
    font-weight: 500;
  }

  html[data-ikadoc-visual-style] .test-modal-dialog {
    border-radius: 28px;
  }

  html[data-ikadoc-visual-style] button {
    font-weight: var(--ikadoc-control-weight);
  }
`;
