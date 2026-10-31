import { components, ThemeTokens, tokens } from "app/common/ThemePrefs";
import { ikaDocChartColorway, OwarelinDark, OwarelinLight } from "app/common/themes/OwarelinThemes";
import { OWARELIN_COLOR_TOKENS } from "app/common/themes/owarelinTokens";

import { assert } from "chai";

const WCAG_AA_TEXT = 4.5;

type Rgba = [number, number, number, number];

const THEMES = [
  ["OwarelinLight", OwarelinLight],
  ["OwarelinDark", OwarelinDark],
] as const;

/** Text color on background color, for both themes. */
const TEXT_PAIRS: [string, string][] = [
  ["body", "bg"],
  ["body", "bgSecondary"],
  ["emphasis", "bg"],
  ["secondary", "bg"],
  ["secondary", "bgSecondary"],
  ["primary", "bg"],
  ["components.cellFg", "components.cellBg"],
  ["components.tableHeaderFg", "components.tableHeaderBg"],
  ["components.choiceTokenFg", "components.choiceTokenBg"],
  ["components.controlPrimaryFg", "components.controlPrimaryBg"],
  ["components.controlPrimaryFg", "components.controlPrimaryHoverBg"],
  ["components.menuItemSelectedFg", "components.menuItemSelectedBg"],
  ["components.iconButtonFg", "components.iconButtonPrimaryBg"],
  ["components.sidePanelOpenerActiveFg", "components.sidePanelOpenerActiveBg"],
  ["components.activePageFg", "components.activePageBg"],
  ["veryLight", "bgEmphasis"],
];

/** GW-THM-01/05/06: the Owarelin themes follow IkaDoc's tokens and keep text readable. */
describe("Owarelin themes", function() {
  it("take their surfaces, text and primary from the IkaDoc design tokens", function() {
    assert.equal(OwarelinLight.bg, OWARELIN_COLOR_TOKENS.light.surface);
    assert.equal(OwarelinLight.primary, OWARELIN_COLOR_TOKENS.light.primary);
    assert.equal(OwarelinLight.body, OWARELIN_COLOR_TOKENS.light.ink);

    assert.equal(OwarelinDark.bg, OWARELIN_COLOR_TOKENS.dark.surface);
    assert.equal(OwarelinDark.primary, OWARELIN_COLOR_TOKENS.dark.primary);

    assert.include(String(OwarelinLight.fontFamily), "Owarelin Inter");
  });

  it("uses the Owarelin chart palette only under Owarelin themes", function() {
    assert.isAbove(ikaDocChartColorway("OwarelinLight")?.length ?? 0, 5);
    assert.isAbove(ikaDocChartColorway("OwarelinDark")?.length ?? 0, 5);

    assert.isUndefined(ikaDocChartColorway("GristLight"));
  });

  for (const [name, theme] of THEMES) {
    describe(`${name} text contrast (WCAG AA ${WCAG_AA_TEXT}:1)`, function() {
      for (const [fg, bg] of TEXT_PAIRS) {
        it(`${fg} on ${bg}`, function() {
          const background = parseColor(resolve(theme, bg));
          const foreground = parseColor(resolve(theme, fg));

          const ratio = contrast(composite(foreground, background), background);

          assert.isAtLeast(ratio, WCAG_AA_TEXT, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
        });
      }
    });
  }
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
