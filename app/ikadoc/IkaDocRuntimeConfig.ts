import {
  IkaDocCapabilities,
  IkaDocCapabilityOverrides,
  normalizeIkaDocCapabilities,
} from "app/ikadoc/IkaDocCapabilities";

export type IkaDocSessionSourceType =
  "document-file" |
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
  saveUrl?: string;
  discardUrl: string;
  blockedCapabilityUrl?: string;
  refreshUrl?: string;
  proposalUrl?: string;
  capabilities: IkaDocCapabilities;
  locale: string;
  theme?: string;
  appearance: "light" | "dark";
}

export interface IkaDocRuntimeConfigWire extends Omit<IkaDocRuntimeConfig, "capabilities"> {
  capabilities?: IkaDocCapabilityOverrides;
}

export type IkaDocRuntimeConfigParseFailure =
  "not-an-object" |
  "invalid-enabled-flag" |
  "missing-required-string" |
  "invalid-source-type" |
  "invalid-editor-mode" |
  "invalid-user" |
  "invalid-capabilities";

export type IkaDocRuntimeConfigParseResult =
  { kind: "disabled" } |
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
  "discardUrl",
  "expiresAt",
  "locale",
] as const;

export function parseIkaDocRuntimeConfig(input: unknown): IkaDocRuntimeConfigParseResult {
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

  if (typeof raw.sourceType !== "string" || !IKA_DOC_SOURCE_TYPES.has(raw.sourceType as IkaDocSessionSourceType)) {
    return { kind: "invalid", reason: "invalid-source-type" };
  }

  if (typeof raw.mode !== "string" || !IKA_DOC_EDITOR_MODES.has(raw.mode as IkaDocEditorMode)) {
    return { kind: "invalid", reason: "invalid-editor-mode" };
  }

  if (!isIkaDocRuntimeUser(raw.user)) {
    return { kind: "invalid", reason: "invalid-user" };
  }

  if (
    raw.capabilities !== undefined &&
    (!raw.capabilities || typeof raw.capabilities !== "object" || Array.isArray(raw.capabilities))
  ) {
    return { kind: "invalid", reason: "invalid-capabilities" };
  }

  const sessionId = raw.sessionId as string;
  const collectionCode = raw.collectionCode as string;
  const documentId = raw.documentId as string;
  const documentUrlId = raw.documentUrlId as string;
  const workerUrl = raw.workerUrl as string;
  const statusUrl = raw.statusUrl as string;
  const validationUrl = raw.validationUrl as string;
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
      sourceSummary: typeof raw.sourceSummary === "string" ? raw.sourceSummary : undefined,
      mode: raw.mode as IkaDocEditorMode,
      expiresAt,
      documentId,
      documentUrlId,
      workerUrl,
      statusUrl,
      validationUrl,
      saveUrl: typeof raw.saveUrl === "string" ? raw.saveUrl : undefined,
      discardUrl,
      blockedCapabilityUrl: typeof raw.blockedCapabilityUrl === "string" ? raw.blockedCapabilityUrl : undefined,
      refreshUrl: typeof raw.refreshUrl === "string" ? raw.refreshUrl : undefined,
      proposalUrl: typeof raw.proposalUrl === "string" ? raw.proposalUrl : undefined,
      capabilities: normalizeIkaDocCapabilities(raw.capabilities as IkaDocCapabilityOverrides | undefined),
      locale,
      theme: typeof raw.theme === "string" ? raw.theme : undefined,
      appearance,
    },
  };
}

function isIkaDocRuntimeUser(input: unknown): input is Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const raw = input as Record<string, unknown>;
  return typeof raw.userId === "string" &&
    raw.userId.length > 0 &&
    typeof raw.username === "string" &&
    raw.username.length > 0 &&
    typeof raw.displayName === "string" &&
    raw.displayName.length > 0 &&
    (raw.email === null || raw.email === undefined || typeof raw.email === "string");
}

function normalizeIkaDocRuntimeUser(input: Record<string, unknown>): IkaDocRuntimeUser {
  return {
    userId: input.userId as string,
    username: input.username as string,
    displayName: input.displayName as string,
    email: typeof input.email === "string" && input.email.length > 0 ? input.email : null,
  };
}
