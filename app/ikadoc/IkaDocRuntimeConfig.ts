import {
  IkaDocCapabilities,
  IkaDocCapabilityOverrides,
  normalizeIkaDocCapabilities,
} from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocGuidedWorkspaceMarker,
  parseIkaDocGuidedWorkspaceMarker,
} from "app/ikadoc/IkaDocGuidedWorkspace";

export type IkaDocSessionSourceType =
  | "document-file" |
  "search-workspace" |
  "report-workspace" |
  "migration-workspace";

export type IkaDocEditorMode = "viewer" | "editor";

export interface IkaDocRuntimeUser {
  userId: string;
  username: string;
  displayName: string;
  email?: string | null;
}

export interface IkaDocGuidedWorkspaceUrls {
  descriptorUrl: string;
  allocateRowsUrl: string;
  admitRowsUrl: string;
  referenceSearchUrl: string;
  referenceResolveUrl: string;
  validateUrl: string;
  applyUrl: string;
}

/**
 * GW-RFR-03: per table, the columns IkaDoc owns (source data).
 * They change only through IkaDoc (materialize, refresh), never from the editor.
 */
export type IkaDocLockedColumns = Record<string, string[]>;

export interface IkaDocRuntimeConfig {
  enabled: true;
  sessionId: string;
  user: IkaDocRuntimeUser;
  collectionCode: string;
  sourceType: IkaDocSessionSourceType;
  sourceSummary?: string;
  mode: IkaDocEditorMode;
  expiresAt: string;
  documentId: string;
  documentUrlId: string;
  workerUrl: string;
  statusUrl: string;
  validationUrl: string;
  validationToken?: string;
  saveUrl?: string;
  discardUrl: string;
  blockedCapabilityUrl?: string;
  refreshUrl?: string;
  proposalUrl?: string;
  guidedWorkspaceUrls?: IkaDocGuidedWorkspaceUrls;
  guidedWorkspace?: IkaDocGuidedWorkspaceMarker;
  lockedColumns?: IkaDocLockedColumns;
  capabilities: IkaDocCapabilities;
  locale: string;
  theme?: string;
  appearance: "light" | "dark";
}

export type IkaDocBrowserRuntimeConfig = Omit<
  IkaDocRuntimeConfig,
  "validationToken"
>;

export function toIkaDocBrowserRuntimeConfig(
  config: IkaDocRuntimeConfig,
): IkaDocBrowserRuntimeConfig {
  return {
    enabled: config.enabled,
    sessionId: config.sessionId,
    user: config.user,
    collectionCode: config.collectionCode,
    sourceType: config.sourceType,
    sourceSummary: config.sourceSummary,
    mode: config.mode,
    expiresAt: config.expiresAt,
    documentId: config.documentId,
    documentUrlId: config.documentUrlId,
    workerUrl: config.workerUrl,
    statusUrl: config.statusUrl,
    validationUrl: config.validationUrl,
    saveUrl: config.saveUrl,
    discardUrl: config.discardUrl,
    blockedCapabilityUrl: config.blockedCapabilityUrl,
    refreshUrl: config.refreshUrl,
    proposalUrl: config.proposalUrl,
    guidedWorkspaceUrls: config.guidedWorkspaceUrls,
    guidedWorkspace: config.guidedWorkspace,
    capabilities: config.capabilities,
    locale: config.locale,
    theme: config.theme,
    appearance: config.appearance,
  };
}

export interface IkaDocRuntimeConfigWire extends Omit<
  IkaDocRuntimeConfig,
  "capabilities"
> {
  capabilities?: IkaDocCapabilityOverrides;
}

export type IkaDocRuntimeConfigParseFailure =
  | "not-an-object" |
  "invalid-enabled-flag" |
  "missing-required-string" |
  "invalid-source-type" |
  "invalid-editor-mode" |
  "invalid-user" |
  "invalid-capabilities" |
  "invalid-guided-workspace" |
  "invalid-guided-workspace-urls" |
  "invalid-locked-columns";

export type IkaDocRuntimeConfigParseResult =
  | { kind: "disabled" } |
  { kind: "invalid"; reason: IkaDocRuntimeConfigParseFailure } |
  { kind: "enabled"; config: IkaDocRuntimeConfig };

const IKA_DOC_SOURCE_TYPES: ReadonlySet<IkaDocSessionSourceType> = new Set([
  "document-file",
  "search-workspace",
  "report-workspace",
  "migration-workspace",
]);

const IKA_DOC_EDITOR_MODES: ReadonlySet<IkaDocEditorMode> = new Set([
  "viewer",
  "editor",
]);

const REQUIRED_STRING_FIELDS = [
  "sessionId",
  "collectionCode",
  "documentId",
  "documentUrlId",
  "workerUrl",
  "statusUrl",
  "validationUrl",
  "validationToken",
  "discardUrl",
  "expiresAt",
  "locale",
] as const;

export function parseIkaDocRuntimeConfig(
  input: unknown,
): IkaDocRuntimeConfigParseResult {
  if (input === undefined) {
    return { kind: "disabled" };
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { kind: "invalid", reason: "not-an-object" };
  }

  const raw = input as Record<string, unknown>;
  if (raw.enabled !== true) {
    return { kind: "invalid", reason: "invalid-enabled-flag" };
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof raw[field] !== "string" || raw[field].length === 0) {
      return { kind: "invalid", reason: "missing-required-string" };
    }
  }

  if (
    typeof raw.sourceType !== "string" ||
    !IKA_DOC_SOURCE_TYPES.has(raw.sourceType as IkaDocSessionSourceType)
  ) {
    return { kind: "invalid", reason: "invalid-source-type" };
  }

  if (
    typeof raw.mode !== "string" ||
    !IKA_DOC_EDITOR_MODES.has(raw.mode as IkaDocEditorMode)
  ) {
    return { kind: "invalid", reason: "invalid-editor-mode" };
  }

  if (!isIkaDocRuntimeUser(raw.user)) {
    return { kind: "invalid", reason: "invalid-user" };
  }

  if (
    raw.capabilities !== undefined &&
    (!raw.capabilities ||
      typeof raw.capabilities !== "object" ||
      Array.isArray(raw.capabilities))
  ) {
    return { kind: "invalid", reason: "invalid-capabilities" };
  }

  const guidedWorkspace = normalizeGuidedWorkspace(raw.guidedWorkspace);
  if (guidedWorkspace === "invalid") {
    return { kind: "invalid", reason: "invalid-guided-workspace" };
  }
  const guidedWorkspaceUrls = normalizeGuidedWorkspaceUrls(
    raw.guidedWorkspaceUrls,
  );
  if (guidedWorkspaceUrls === "invalid") {
    return { kind: "invalid", reason: "invalid-guided-workspace-urls" };
  }

  const lockedColumns = normalizeLockedColumns(raw.lockedColumns);
  if (lockedColumns === "invalid") {
    return { kind: "invalid", reason: "invalid-locked-columns" };
  }

  const sessionId = raw.sessionId as string;
  const collectionCode = raw.collectionCode as string;
  const documentId = raw.documentId as string;
  const documentUrlId = raw.documentUrlId as string;
  const workerUrl = raw.workerUrl as string;
  const statusUrl = raw.statusUrl as string;
  const validationUrl = raw.validationUrl as string;
  const validationToken = raw.validationToken as string;
  const discardUrl = raw.discardUrl as string;
  const expiresAt = raw.expiresAt as string;
  const locale = raw.locale as string;
  const appearance = raw.appearance === "dark" ? "dark" : "light";

  return {
    kind: "enabled",
    config: {
      enabled: true,
      sessionId,
      user: normalizeIkaDocRuntimeUser(raw.user),
      collectionCode,
      sourceType: raw.sourceType as IkaDocSessionSourceType,
      sourceSummary:
        typeof raw.sourceSummary === "string" ? raw.sourceSummary : undefined,
      mode: raw.mode as IkaDocEditorMode,
      expiresAt,
      documentId,
      documentUrlId,
      workerUrl,
      statusUrl,
      validationUrl,
      validationToken,
      saveUrl: typeof raw.saveUrl === "string" ? raw.saveUrl : undefined,
      discardUrl,
      blockedCapabilityUrl:
        typeof raw.blockedCapabilityUrl === "string" ?
          raw.blockedCapabilityUrl :
          undefined,
      refreshUrl:
        typeof raw.refreshUrl === "string" ? raw.refreshUrl : undefined,
      proposalUrl:
        typeof raw.proposalUrl === "string" ? raw.proposalUrl : undefined,
      guidedWorkspaceUrls,
      guidedWorkspace,
      lockedColumns,
      capabilities: normalizeIkaDocCapabilities(
        raw.capabilities as IkaDocCapabilityOverrides | undefined,
      ),
      locale,
      theme: typeof raw.theme === "string" ? raw.theme : undefined,
      appearance,
    },
  };
}

function normalizeLockedColumns(input: unknown): IkaDocLockedColumns | undefined | "invalid" {
  if (input === undefined) {
    return undefined;
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "invalid";
  }

  const lockedColumns: IkaDocLockedColumns = {};

  for (const [tableId, columnIds] of Object.entries(input)) {
    const validColumns = Array.isArray(columnIds) &&
      columnIds.every(columnId => typeof columnId === "string" && columnId.length > 0);
    if (!validColumns) {
      return "invalid";
    }

    lockedColumns[tableId] = [...columnIds];
  }

  return lockedColumns;
}

function normalizeGuidedWorkspace(
  input: unknown,
): IkaDocGuidedWorkspaceMarker | undefined | "invalid" {
  if (input === undefined || input === null) {
    return undefined;
  }
  return parseIkaDocGuidedWorkspaceMarker(input) ?? "invalid";
}

function normalizeGuidedWorkspaceUrls(
  input: unknown,
): IkaDocGuidedWorkspaceUrls | undefined | "invalid" {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "invalid";
  }
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.descriptorUrl !== "string" ||
    raw.descriptorUrl.length === 0 ||
    typeof raw.allocateRowsUrl !== "string" ||
    raw.allocateRowsUrl.length === 0 ||
    typeof raw.admitRowsUrl !== "string" ||
    raw.admitRowsUrl.length === 0 ||
    typeof raw.referenceSearchUrl !== "string" ||
    raw.referenceSearchUrl.length === 0 ||
    typeof raw.referenceResolveUrl !== "string" ||
    raw.referenceResolveUrl.length === 0 ||
    typeof raw.validateUrl !== "string" ||
    raw.validateUrl.length === 0 ||
    typeof raw.applyUrl !== "string" ||
    raw.applyUrl.length === 0
  ) {
    return "invalid";
  }
  return {
    descriptorUrl: raw.descriptorUrl,
    allocateRowsUrl: raw.allocateRowsUrl,
    admitRowsUrl: raw.admitRowsUrl,
    referenceSearchUrl: raw.referenceSearchUrl,
    referenceResolveUrl: raw.referenceResolveUrl,
    validateUrl: raw.validateUrl,
    applyUrl: raw.applyUrl,
  };
}

function isIkaDocRuntimeUser(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const raw = input as Record<string, unknown>;
  return (
    typeof raw.userId === "string" &&
    raw.userId.length > 0 &&
    typeof raw.username === "string" &&
    raw.username.length > 0 &&
    typeof raw.displayName === "string" &&
    raw.displayName.length > 0 &&
    (raw.email === null ||
      raw.email === undefined ||
      typeof raw.email === "string")
  );
}

function normalizeIkaDocRuntimeUser(
  input: Record<string, unknown>,
): IkaDocRuntimeUser {
  return {
    userId: input.userId as string,
    username: input.username as string,
    displayName: input.displayName as string,
    email:
      typeof input.email === "string" && input.email.length > 0 ?
        input.email :
        null,
  };
}
