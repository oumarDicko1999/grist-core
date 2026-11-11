export type IkaDocVisualStyle = "material" | "owarelin" | "paper";

export interface IkaDocThemeBridgeState {
  appearance: "light" | "dark";
  mode: "viewer" | "editor";
  theme?: string;
}

export function applyIkaDocThemeBridgeState(state: IkaDocThemeBridgeState): void {
  const visualStyle = resolveIkaDocVisualStyle(state.theme);
  document.documentElement.dataset.ikadocRuntime = "true";
  document.documentElement.dataset.ikadocVisualStyle = visualStyle;
  document.documentElement.dataset.tenantThemeStyle = visualStyle;
  document.documentElement.dataset.gristAppearance = state.appearance;
  document.documentElement.dataset.ikadocRuntimeMode = state.mode;
  document.documentElement.style.setProperty("color-scheme", state.appearance);
}

export function resolveIkaDocVisualStyle(theme: string | undefined): IkaDocVisualStyle {
  if (theme === "material" || theme === "default" || theme === "nexus") {
    return "material";
  }
  return theme === "paper" ? "paper" : "owarelin";
}
