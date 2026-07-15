export interface IkaDocCapabilities {
  canEditCells: boolean;
  canEditStructure: boolean;
  canUseFormulas: boolean;
  canCreateCharts: boolean;
  canViewHistory: boolean;
  canRefreshSource: boolean;
  canSaveToIkaDoc: boolean;
  canDiscard: boolean;
  canUseComments: boolean;
  canUseAttachments: boolean;
  canUseExternalData: boolean;
  canImportLocalFiles: boolean;
  canUseCustomWidgets: boolean;
  canInviteCollaborators: boolean;
  canExportFromBrowser: boolean;
  canShare: boolean;
  canFork: boolean;
  canPublish: boolean;
  canManageAccess: boolean;
  canUsePlugins: boolean;
}

export type IkaDocCapabilityOverrides = Partial<IkaDocCapabilities>;

export const DENIED_IKADOC_CAPABILITIES: IkaDocCapabilities = {
  canEditCells: false,
  canEditStructure: false,
  canUseFormulas: false,
  canCreateCharts: false,
  canViewHistory: false,
  canRefreshSource: false,
  canSaveToIkaDoc: false,
  canDiscard: false,
  canUseComments: false,
  canUseAttachments: false,
  canUseExternalData: false,
  canImportLocalFiles: false,
  canUseCustomWidgets: false,
  canInviteCollaborators: false,
  canExportFromBrowser: false,
  canShare: false,
  canFork: false,
  canPublish: false,
  canManageAccess: false,
  canUsePlugins: false,
};

export function normalizeIkaDocCapabilities(overrides: IkaDocCapabilityOverrides = {}): IkaDocCapabilities {
  return { ...DENIED_IKADOC_CAPABILITIES, ...overrides };
}
