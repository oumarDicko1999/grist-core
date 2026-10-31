import { components, ThemeTokens, tokens } from "app/common/ThemePrefs";
import { IKADOC_PALETTE } from "app/common/themes/ikadocPalette";
import {
  ikaDocChartColorway, IkaDocMaterialDark, IkaDocMaterialLight, OwarelinDark, OwarelinLight,
} from "app/common/themes/IkaDocThemes";

import { assert } from "chai";

const WCAG_AA_TEXT = 4.5;

type Rgba = [number, number, number, number];

const THEMES = [
  { name: "OwarelinLight", theme: OwarelinLight, palette: IKADOC_PALETTE.owarelin.light },
  { name: "OwarelinDark", theme: OwarelinDark, palette: IKADOC_PALETTE.owarelin.dark },
  { name: "IkaDocMaterialLight", theme: IkaDocMaterialLight, palette: IKADOC_PALETTE.material.light },
  { name: "IkaDocMaterialDark", theme: IkaDocMaterialDark, palette: IKADOC_PALETTE.material.dark },
] as const;

/** Text color on background color, for every theme. */
const TEXT_PAIRS: [string, string][] = [
  ["body", "bg"],
  ["body", "bgSecondary"],
  ["emphasis", "bg"],
  ["secondary", "bg"],
  ["primary", "bg"],
  ["veryLight", "bgEmphasis"],
  ["components.cellFg", "components.cellBg"],
  ["components.tableHeaderFg", "components.tableHeaderBg"],
  ["components.choiceTokenFg", "components.choiceTokenBg"],
  ["components.controlPrimaryFg", "components.controlPrimaryBg"],
  ["components.controlPrimaryFg", "components.controlPrimaryHoverBg"],
  ["components.iconButtonFg", "components.iconButtonPrimaryBg"],
  ["components.sidePanelOpenerActiveFg", "components.sidePanelOpenerActiveBg"],
  ["components.activePageFg", "components.activePageBg"],
  ["components.menuItemFg", "components.menuBg"],
  ["components.menuItemSelectedFg", "components.menuItemSelectedBg"],
];

/** GW-THM-01/05/06/07: Grist themes follow the colors IkaDoc renders, and keep text readable. */
describe("IkaDoc themes", function() {
  for (const { name, theme, palette } of THEMES) {
    describe(name, function() {
      it("takes surfaces, text and primary from the IkaDoc palette", function() {
        assert.equal(theme.bg, palette.colors.surface);
        assert.equal(theme.bgSecondary, palette.colors.background);
        assert.equal(theme.body, palette.colors.onSurface);
        assert.equal(theme.primary, palette.colors.primary);
      });

      it("draws the grid like the IkaDoc record table", function() {
        assert.equal(theme.components.tableHeaderBg, palette.grid.headerBg);
        assert.equal(theme.components.tableHeaderFg, palette.grid.headerFg);
        assert.equal(theme.components.tableBodyBorder, palette.grid.cellBorderBottom);
        assert.equal(theme.components.choiceTokenBg, palette.chip.bg);
      });

      it("puts IkaDoc's on-primary color, not white, on primary controls", function() {
        assert.equal(theme.components.controlPrimaryFg, palette.colors.onPrimary);
        assert.equal(theme.components.iconButtonFg, palette.colors.onPrimary);
      });

      it("marks the selected page with IkaDoc's container color", function() {
        assert.equal(theme.components.activePageBg, palette.colors.secondaryContainer);
        assert.equal(theme.components.activePageFg, palette.colors.onSecondaryContainer);
      });

      it("uses IkaDoc's variable Inter for the interface and for cell data", function() {
        assert.include(String(theme.fontFamily), "IkaDoc Inter");
        assert.include(String(theme.fontFamilyData), "IkaDoc Inter");
      });

      describe(`text contrast (WCAG AA ${WCAG_AA_TEXT}:1)`, function() {
        for (const [fg, bg] of TEXT_PAIRS) {
          it(`${fg} on ${bg}`, function() {
            const background = composite(parseColor(resolve(theme, bg)), parseColor(theme.bg as string));
            const foreground = parseColor(resolve(theme, fg));

            const ratio = contrast(composite(foreground, background), background);

            assert.isAtLeast(ratio, WCAG_AA_TEXT, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
          });
        }
      });
    });
  }

  it("uses the Owarelin chart palette only under Owarelin themes", function() {
    assert.isAbove(ikaDocChartColorway("OwarelinLight")?.length ?? 0, 5);
    assert.isAbove(ikaDocChartColorway("OwarelinDark")?.length ?? 0, 5);

    assert.isUndefined(ikaDocChartColorway("IkaDocMaterialLight"));
    assert.isUndefined(ikaDocChartColorway("GristLight"));
  });
});

/** Resolves a token path, following references to other theme tokens (`tokens.primary`, ...). */
function resolve(theme: ThemeTokens, path: string): string {
  const [group, key] = path.includes(".") ? path.split(".") : [undefined, path];

  const values = group === "components" ?
    theme.components as unknown as Record<string, unknown> :
    theme as unknown as Record<string, unknown>;

  return resolveValue(theme, values[key], path);
}

function resolveValue(theme: ThemeTokens, value: unknown, path: string): string {
  if (typeof value === "string") {
    return value;
  }

  const tokenName = Object.keys(tokens).find(
    name => (tokens as Record<string, unknown>)[name] === value,
  );
  if (tokenName) {
    return resolve(theme, tokenName);
  }

  const componentName = Object.keys(components).find(
    name => (components as Record<string, unknown>)[name] === value,
  );
  if (componentName) {
    return resolve(theme, `components.${componentName}`);
  }

  throw new Error(`Cannot resolve ${path}`);
}

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(value.trim());
  if (hex) {
    const alpha = hex[4] ? parseInt(hex[4], 16) / 255 : 1;

    return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), alpha];
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);
    const alpha = parts[3] === undefined ? 1 : parseAlpha(parts[3]);

    return [Number(parts[0]), Number(parts[1]), Number(parts[2]), alpha];
  }

  throw new Error(`Unsupported color ${value}`);
}

function parseAlpha(value: string): number {
  return value.endsWith("%") ? parseFloat(value) / 100 : parseFloat(value);
}

/** The color a translucent foreground actually shows over its background. */
function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3];
  const blend = (i: number) => foreground[i] * alpha + background[i] * (1 - alpha);

  return [blend(0), blend(1), blend(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255;

    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);

  return (lighter + 0.05) / (darker + 0.05);
}
