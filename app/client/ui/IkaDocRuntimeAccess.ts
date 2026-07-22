import {
  IkaDocRuntimeCapabilities,
  IkaDocRuntimeConfig,
  parseIkaDocRuntimeConfigFromLoadConfig,
} from "app/common/gristUrls";
import { getGristConfig } from "app/common/urlUtils";

export function getIkaDocRuntimeConfig(): IkaDocRuntimeConfig | null {
  const runtime = parseIkaDocRuntimeConfigFromLoadConfig(getGristConfig());
  return runtime.kind === "enabled" ? runtime.config : null;
}

export function isIkaDocRuntimeMode(config = getIkaDocRuntimeConfig()): boolean {
  return Boolean(config);
}

export function isIkaDocRuntimeEditor(config = getIkaDocRuntimeConfig()): boolean {
  if (!config) {
    return true;
  }
  return config.mode === "editor";
}

export function canEditIkaDocRuntimeStructure(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canEditStructure", { editorOnly: true }, config);
}

export function canEditIkaDocRuntimeCells(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canEditCells", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimeFormulas(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUseFormulas", { editorOnly: true }, config);
}

export function canCreateIkaDocRuntimeCharts(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canCreateCharts", { editorOnly: true }, config);
}

export function canViewIkaDocRuntimeHistory(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canViewHistory", {}, config);
}

export function canRefreshIkaDocRuntimeSource(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canRefreshSource", { editorOnly: true }, config);
}

export function canSaveToIkaDocRuntime(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canSaveToIkaDoc", { editorOnly: true }, config);
}

export function canDiscardIkaDocRuntime(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canDiscard", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimeComments(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUseComments", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimeAttachments(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUseAttachments", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimeExternalData(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUseExternalData", { editorOnly: true }, config);
}

export function canImportIkaDocRuntimeLocalFiles(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canImportLocalFiles", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimeCustomWidgets(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUseCustomWidgets", { editorOnly: true }, config);
}

export function canInviteIkaDocRuntimeCollaborators(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canInviteCollaborators", { editorOnly: true }, config);
}

export function canExportFromIkaDocRuntimeBrowser(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canExportFromBrowser", {}, config);
}

export function canShareIkaDocRuntime(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canShare", { editorOnly: true }, config);
}

export function canForkIkaDocRuntime(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canFork", { editorOnly: true }, config);
}

export function canPublishIkaDocRuntime(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canPublish", { editorOnly: true }, config);
}

export function canManageIkaDocRuntimeAccess(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canManageAccess", { editorOnly: true }, config);
}

export function canUseIkaDocRuntimePlugins(config?: IkaDocRuntimeConfig): boolean {
  return hasIkaDocRuntimeCapability("canUsePlugins", { editorOnly: true }, config);
}

export function canBuildIkaDocRuntimeProposal(config?: IkaDocRuntimeConfig): boolean {
  return Boolean(config?.proposalUrl) &&
    hasIkaDocRuntimeCapability("canEditCells", { editorOnly: true }, config);
}

export function shouldShowIkaDocRuntimeAuthoringSurfaces(config = getIkaDocRuntimeConfig()): boolean {
  if (!config) {
    return true;
  }
  return (
    config.mode === "editor" &&
    (canEditIkaDocRuntimeStructure(config) ||
      canUseIkaDocRuntimeFormulas(config) ||
      canCreateIkaDocRuntimeCharts(config) ||
      canUseIkaDocRuntimeCustomWidgets(config))
  );
}

function hasIkaDocRuntimeCapability(
  capability: keyof IkaDocRuntimeCapabilities,
  options: { editorOnly?: boolean },
  config = getIkaDocRuntimeConfig(),
): boolean {
  if (!config) {
    return true;
  }
  if (options.editorOnly && config.mode !== "editor") {
    return false;
  }
  return config.capabilities[capability];
}
