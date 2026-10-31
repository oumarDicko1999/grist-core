import { IkaDocRequestError, requestIkaDocJson } from "app/ikadoc/IkaDocRequest";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

export interface IkaDocReferenceLookupOption {
  id: string;
  schemaType: string;
  schemaCode: string;
  label: string;
  secondaryLabel?: string | null;
  contextLabel?: string | null;
  canOpen: boolean;
}

export interface IkaDocReferenceLookupRequest {
  tableId: string;
  metadataCode: string;
  rowKey?: string;
  query?: string;
  pageSize?: number;
}

export async function searchIkaDocGuidedReferenceOptions(
  config: IkaDocRuntimeConfig,
  request: IkaDocReferenceLookupRequest,
): Promise<readonly IkaDocReferenceLookupOption[]> {
  const urls = requireGuidedReferenceLookupUrls(config);
  const payload = await requestReferenceLookup(config, urls.referenceSearchUrl, {
    tableId: request.tableId,
    metadataCode: request.metadataCode,
    rowKey: request.rowKey,
    query: request.query ?? "",
    pageSize: request.pageSize,
  });
  return parseIkaDocReferenceLookupResponse(payload);
}

export async function resolveIkaDocGuidedReferenceOptions(
  config: IkaDocRuntimeConfig,
  request: Omit<IkaDocReferenceLookupRequest, "query" | "pageSize"> & {
    ids: readonly string[];
  },
): Promise<readonly IkaDocReferenceLookupOption[]> {
  const urls = requireGuidedReferenceLookupUrls(config);
  const payload = await requestReferenceLookup(config, urls.referenceResolveUrl, {
    tableId: request.tableId,
    metadataCode: request.metadataCode,
    rowKey: request.rowKey,
    ids: request.ids,
  });
  return parseIkaDocReferenceLookupResponse(payload);
}

function requireGuidedReferenceLookupUrls(config: IkaDocRuntimeConfig) {
  if (!config.guidedWorkspaceUrls) {
    throw new Error("Guided workspace reference lookup is not configured");
  }
  return config.guidedWorkspaceUrls;
}

/** POST to IkaDoc's reference lookup, with IkaDoc's own message when it refuses. */
async function requestReferenceLookup(
  config: IkaDocRuntimeConfig,
  url: string,
  body: object,
): Promise<unknown> {
  try {
    return await requestIkaDocJson(config, url, { method: "POST", body });
  } catch (error) {
    const ikadocMessage = error instanceof IkaDocRequestError ? error.ikadocMessage : undefined;
    throw new Error(ikadocMessage ?? "Reference lookup failed");
  }
}

export function parseIkaDocReferenceLookupResponse(
  payload: unknown,
): readonly IkaDocReferenceLookupOption[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Reference lookup response is not an object");
  }
  const items = (payload as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    throw new Error("Reference lookup response is missing items");
  }
  return items.map(parseReferenceLookupOption);
}

function parseReferenceLookupOption(
  input: unknown,
): IkaDocReferenceLookupOption {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Reference lookup option is not an object");
  }
  const raw = input as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    raw.id.length === 0 ||
    typeof raw.schemaType !== "string" ||
    raw.schemaType.length === 0 ||
    typeof raw.schemaCode !== "string" ||
    raw.schemaCode.length === 0 ||
    typeof raw.label !== "string" ||
    raw.label.length === 0 ||
    typeof raw.canOpen !== "boolean"
  ) {
    throw new Error("Reference lookup option is malformed");
  }
  return {
    id: raw.id,
    schemaType: raw.schemaType,
    schemaCode: raw.schemaCode,
    label: raw.label,
    secondaryLabel: optionalString(raw.secondaryLabel),
    contextLabel: optionalString(raw.contextLabel),
    canOpen: raw.canOpen,
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
