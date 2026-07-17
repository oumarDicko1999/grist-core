import { IkaDocRuntimeConfig, parseIkaDocRuntimeConfigFromLoadConfig } from "app/common/gristUrls";
import { getGristConfig } from "app/common/urlUtils";

export function getIkaDocRuntimeConfig(): IkaDocRuntimeConfig | null {
  const runtime = parseIkaDocRuntimeConfigFromLoadConfig(getGristConfig());
  return runtime.kind === "enabled" ? runtime.config : null;
}

export function canEditIkaDocRuntimeStructure(): boolean {
  const config = getIkaDocRuntimeConfig();
  if (!config) { return true; }
  return config.mode === "editor" && config.capabilities.canEditStructure;
}

export function canExportFromIkaDocRuntimeBrowser(): boolean {
  const config = getIkaDocRuntimeConfig();
  if (!config) { return true; }
  return config.capabilities.canExportFromBrowser;
}

export function shouldShowIkaDocRuntimeAuthoringSurfaces(): boolean {
  return canEditIkaDocRuntimeStructure();
}
