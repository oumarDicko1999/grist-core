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
  const payload = await requestIkaDocJson(config, urls.referenceSearchUrl, {
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
  const payload = await requestIkaDocJson(config, urls.referenceResolveUrl, {
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

async function requestIkaDocJson(
  config: IkaDocRuntimeConfig,
  url: string,
  body: object,
): Promise<unknown> {
  const response = await window.fetch(url, {
    credentials: "include",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Collection": config.collectionCode,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(readIkaDocError(payload) ?? "Reference lookup failed");
  }
  return payload;
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

function readIkaDocError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const error = (payload as Record<string, unknown>).error;
  return typeof error === "string" && error.length > 0 ? error : undefined;
}
