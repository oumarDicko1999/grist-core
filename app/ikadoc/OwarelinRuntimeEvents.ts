import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

const MAX_RUNTIME_STATE_MESSAGE_LENGTH = 240;

export type OwarelinInboundRuntimeEventName =
  "owarelin:languageChanged" |
  "owarelin:themeChanged" |
  "owarelin:sessionExpired" |
  "owarelin:checkoutReleased" |
  "owarelin:moduleDisabled" |
  "owarelin:tenantSuspended" |
  "owarelin:sourceRefreshed" |
  "owarelin:proposalReady" |
  "owarelin:saveStarted" |
  "owarelin:saveCompleted" |
  "owarelin:saveFailed" |
  "owarelin:cleanupPending";

export type OwarelinOutboundRuntimeEventName =
  "owarelin:editorReady" |
  "owarelin:documentDirty" |
  "owarelin:documentClean" |
  "owarelin:saveRequested" |
  "owarelin:discardRequested" |
  "owarelin:discardCompleted" |
  "owarelin:refreshRequested" |
  "owarelin:loadMoreRequested" |
  "owarelin:proposalRequested" |
  "owarelin:blockedCapabilityAttempted" |
  "owarelin:runtimeError" |
  "owarelin:sourceRefreshed" |
  "owarelin:saveCompleted" |
  "owarelin:saveFailed" |
  "owarelin:cleanupPending";

export interface OwarelinRuntimeEvent<T extends string = string> {
  type: T;
  version: 1;
  sessionId: string;
  sourceType: string;
  emittedAt: string;
  detail: Record<string, unknown>;
}

let attachedSessionId: string | undefined;

export function attachOwarelinRuntimeEventBridge(config: IkaDocRuntimeConfig): void {
  if (attachedSessionId === config.sessionId) {
    return;
  }
  attachedSessionId = config.sessionId;
  document.documentElement.lang = config.locale;

  window.addEventListener("message", (message) => {
    if (message.origin !== owarelinHostOrigin(config)) {
      return;
    }
    const event = parseOwarelinRuntimeEvent(message.data, config);
    if (!event) {
      return;
    }
    applyOwarelinHostEvent(event);
    window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
  });

  postOwarelinRuntimeEvent(config, "owarelin:editorReady", {
    documentId: config.documentId,
    documentUrlId: config.documentUrlId,
    mode: config.mode,
  });
}

export function postOwarelinRuntimeEvent(
  config: IkaDocRuntimeConfig,
  type: OwarelinOutboundRuntimeEventName,
  detail: Record<string, unknown> = {},
): void {
  window.parent.postMessage(
    owarelinRuntimeEvent(config, type, detail),
    owarelinHostOrigin(config),
  );
}

export function owarelinRuntimeEvent(
  config: IkaDocRuntimeConfig,
  type: OwarelinOutboundRuntimeEventName,
  detail: Record<string, unknown> = {},
): OwarelinRuntimeEvent<OwarelinOutboundRuntimeEventName> {
  return {
    type,
    version: 1,
    sessionId: config.sessionId,
    sourceType: config.sourceType,
    emittedAt: new Date().toISOString(),
    detail,
  };
}

export function parseOwarelinRuntimeEvent(
  value: unknown,
  config: IkaDocRuntimeConfig,
): OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.type !== "string" ||
    !isOwarelinInboundRuntimeEventName(raw.type) ||
    raw.version !== 1 ||
    raw.sessionId !== config.sessionId ||
    typeof raw.emittedAt !== "string"
  ) {
    return undefined;
  }
  const detail = raw.detail;
  return {
    type: raw.type,
    version: 1,
    sessionId: config.sessionId,
    sourceType: typeof raw.sourceType === "string" ? raw.sourceType : config.sourceType,
    emittedAt: raw.emittedAt,
    detail: detail && typeof detail === "object" && !Array.isArray(detail) ? detail as Record<string, unknown> : {},
  };
}

function owarelinHostOrigin(config: IkaDocRuntimeConfig): string {
  return new URL(config.statusUrl, window.location.href).origin;
}

function isOwarelinInboundRuntimeEventName(value: string): value is OwarelinInboundRuntimeEventName {
  return INBOUND_OWARELIN_RUNTIME_EVENTS.has(value as OwarelinInboundRuntimeEventName);
}

export function applyOwarelinHostEvent(event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>): void {
  if (event.type === "owarelin:languageChanged" && typeof event.detail.locale === "string") {
    document.documentElement.lang = event.detail.locale;
  }
  if (event.type === "owarelin:themeChanged") {
    const currentAppearance = document.documentElement.dataset.gristAppearance === "dark" ? "dark" : "light";
    const appearance = event.detail.appearance === "dark" || event.detail.appearance === "light" ?
      event.detail.appearance :
      currentAppearance;
    const theme = typeof event.detail.theme === "string" ? event.detail.theme : undefined;
    applyIkaDocThemeBridgeState({
      appearance,
      theme,
    });
  }
  switch (event.type) {
    case "owarelin:sessionExpired":
      setRuntimeState("expired", event);
      break;
    case "owarelin:checkoutReleased":
      setRuntimeState("checkout-released", event);
      break;
    case "owarelin:moduleDisabled":
      setRuntimeState("module-disabled", event);
      break;
    case "owarelin:tenantSuspended":
      setRuntimeState("tenant-suspended", event);
      break;
    case "owarelin:cleanupPending":
      setRuntimeState("cleanup-pending", event);
      break;
    case "owarelin:sourceRefreshed":
      setRuntimeState("source-refreshed", event);
      break;
    case "owarelin:proposalReady":
      setRuntimeState("proposal-ready", event);
      break;
    case "owarelin:saveStarted":
      document.documentElement.dataset.owarelinSaveState = "saving";
      break;
    case "owarelin:saveCompleted":
      document.documentElement.dataset.owarelinSaveState = "saved";
      break;
    case "owarelin:saveFailed":
      document.documentElement.dataset.owarelinSaveState = "failed";
      setRuntimeState("save-failed", event);
      break;
    default:
      break;
  }
}

function setRuntimeState(
  state: string,
  event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>,
): void {
  document.documentElement.dataset.owarelinRuntimeState = state;
  document.documentElement.dataset.owarelinRuntimeStateEvent = event.type;
  document.documentElement.dataset.owarelinRuntimeStateAt = event.emittedAt;
  const safeMessage = readStringDetail(event.detail, "safeMessage") ?? readStringDetail(event.detail, "message");
  if (safeMessage) {
    document.documentElement.dataset.owarelinRuntimeStateMessage =
      safeMessage.slice(0, MAX_RUNTIME_STATE_MESSAGE_LENGTH);
  }
}

function readStringDetail(detail: Record<string, unknown>, field: string): string | undefined {
  const value = detail[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const INBOUND_OWARELIN_RUNTIME_EVENTS: ReadonlySet<OwarelinInboundRuntimeEventName> = new Set([
  "owarelin:languageChanged",
  "owarelin:themeChanged",
  "owarelin:sessionExpired",
  "owarelin:checkoutReleased",
  "owarelin:moduleDisabled",
  "owarelin:tenantSuspended",
  "owarelin:sourceRefreshed",
  "owarelin:proposalReady",
  "owarelin:saveStarted",
  "owarelin:saveCompleted",
  "owarelin:saveFailed",
  "owarelin:cleanupPending",
]);
