// Run in a Grist page opened through IkaDoc (or the harness), from the browser console,
// after defining `palette` as the content of palette.json. Measures the grid, chips and
// shell the way extract.js measures IkaDoc, and returns every difference (empty = match).
//
//   ikadocCheckGrist(palette)
window.ikadocCheckGrist = (palette) => {
  const html = document.documentElement;

  const style = html.dataset.ikadocVisualStyle;
  const appearance = html.dataset.gristAppearance;
  const expected = palette.palette[style][appearance];

  // Measured in the IkaDoc frontend: Owarelin buttons are bold, Material buttons medium.
  const buttonWeight = { owarelin: "700", material: "500" }[style];

  const probe = document.createElement("div");
  document.body.append(probe);

  // Same normalization as extract.js, so both sides compare as strings.
  const normalize = (cssColor) => {
    probe.style.color = "";
    probe.style.color = cssColor;
    const computed = getComputedStyle(probe).color;

    const numbers = computed.match(/[\d.]+/g).map(Number);
    const isSrgbFunction = computed.startsWith("color(");

    const [r, g, b] = isSrgbFunction ? numbers.slice(0, 3).map(c => c * 255) : numbers.slice(0, 3);
    const alpha = numbers[3] ?? 1;
    const hex = channel => Math.round(channel).toString(16).padStart(2, "0");

    if (alpha === 1) {
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(alpha * 1000) / 1000})`;
  };

  const css = (selector, property) => {
    const element = document.querySelector(selector);

    return element ? getComputedStyle(element).getPropertyValue(property) : "MISSING";
  };
  const height = selector => Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? -1);

  const rows = [...document.querySelectorAll(".gridview_row .record")];
  const oddRow = rows[0];
  const evenRow = rows[1];

  const checks = [
    ["font", css(".field_clip", "font-family").includes("IkaDoc Inter"), true],

    ["header height", height(".field.column_name"), 42],
    ["header weight", css(".field.column_name", "font-weight"), "700"],
    ["header size", css(".field.column_name", "font-size"), "12px"],
    ["header bg", normalize(css(".field.column_name", "background-color")), expected.grid.headerBg],
    ["header fg", normalize(css(".field.column_name", "color")), expected.grid.headerFg],
    ["header border bottom", normalize(css(".column_names.record", "border-bottom-color")), expected.grid.headerBorderBottom],

    ["row height", Math.round(oddRow.getBoundingClientRect().height), 46],
    ["cell size", css(".record:not(.column_names) .field_clip", "font-size"), "13px"],
    ["cell fg", normalize(css(".record:not(.column_names) .field", "color")), expected.colors.onSurface],
    ["row bg", normalize(getComputedStyle(oddRow).backgroundColor), expected.colors.surface],
    ["even row bg", normalize(getComputedStyle(evenRow).backgroundColor), expected.grid.rowEvenBg],
    ["row border", normalize(getComputedStyle(oddRow).borderBottomColor), expected.grid.cellBorderBottom],
    ["cell border", normalize(css(".record:not(.column_names) .field", "border-right-color")), expected.grid.cellBorderRight],

    ["chip bg", normalize(css(".test-choice-token", "background-color")), expected.chip.bg],
    ["chip fg", normalize(css(".test-choice-token", "color")), expected.chip.fg],
    ["chip radius", css(".test-choice-token", "border-radius"), "9999px"],
    ["chip height", height(".test-choice-token"), 24],

    ["add button bg", normalize(css(".test-dp-add-new", "background-color")), expected.colors.primary],
    ["add button fg", normalize(css(".test-dp-add-new", "color")), expected.colors.onPrimary],
    ["add button radius", css(".test-dp-add-new", "border-radius"), "9999px"],
    ["add button weight", css(".test-dp-add-new", "font-weight"), buttonWeight],

    ["selected row number bg", normalize(css(".gridview_data_row_num.selected", "background-color")), expected.colors.secondaryContainer],

    ["selected page bg", normalize(css(".test-treeview-itemHeader.selected", "background-color")), expected.colors.secondaryContainer],
    ["selected page fg", normalize(css(".test-treeview-itemHeader.selected", "color")), expected.colors.onSecondaryContainer],
  ];

  probe.remove();

  return checks
    .filter(([, actual, wanted]) => actual !== wanted)
    .map(([name, actual, wanted]) => `${name}: ${actual} (IkaDoc ${wanted})`);
};
