import { parseIkaDocGuidedWorkspaceDescriptor } from "app/ikadoc/IkaDocGuidedWorkspace";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { applyIkaDocThemeBridgeState } from "app/ikadoc/IkaDocThemeState";

const MAX_RUNTIME_STATE_MESSAGE_LENGTH = 240;

/** UI-09: the window event the editor controls listen to; its detail is the host's message. */
export const IKADOC_PARTICIPANTS_CHANGED_EVENT = "ikadoc:participantsChanged";

export type OwarelinInboundRuntimeEventName =
  | "owarelin:languageChanged" |
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
  "owarelin:cleanupPending" |
  "owarelin:guidedWorkspaceDescriptorChanged" |
  "owarelin:participantsChanged" |
  "owarelin:sourcesChanged" |
  "owarelin:sourceRecordsChanged" |
  "owarelin:proposalIssues";

export type OwarelinOutboundRuntimeEventName =
  | "owarelin:editorReady" |
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
  "owarelin:guidedWorkspaceValidated" |
  "owarelin:guidedWorkspaceApplied" |
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

export function attachOwarelinRuntimeEventBridge(
  config: IkaDocRuntimeConfig,
): void {
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
    sourceType:
      typeof raw.sourceType === "string" ? raw.sourceType : config.sourceType,
    emittedAt: raw.emittedAt,
    detail:
      detail && typeof detail === "object" && !Array.isArray(detail) ?
        (detail as Record<string, unknown>) :
        {},
  };
}

function owarelinHostOrigin(config: IkaDocRuntimeConfig): string {
  return new URL(config.statusUrl, window.location.href).origin;
}

function isOwarelinInboundRuntimeEventName(
  value: string,
): value is OwarelinInboundRuntimeEventName {
  return INBOUND_OWARELIN_RUNTIME_EVENTS.has(
    value as OwarelinInboundRuntimeEventName,
  );
}

export function applyOwarelinHostEvent(
  event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>,
): void {
  switch (event.type) {
    case "owarelin:languageChanged":
      if (typeof event.detail.locale === "string") {
        document.documentElement.lang = event.detail.locale;
      }
      break;
    case "owarelin:themeChanged":
      applyHostTheme(event);
      break;
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
    case "owarelin:guidedWorkspaceDescriptorChanged":
      setGuidedWorkspaceDescriptorState(event);
      break;
    case "owarelin:participantsChanged":
      setParticipantsState(event);
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
      // Sources events are read by the sources panel itself (IkaDocSourcesPanel).
      break;
  }
}

/** The IkaDoc page switched style or appearance; what it leaves out stays as it is. */
function applyHostTheme(event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>): void {
  const { dataset } = document.documentElement;

  const requested = event.detail.appearance;
  const current = dataset.gristAppearance === "dark" ? "dark" : "light";
  const appearance = requested === "dark" || requested === "light" ? requested : current;

  applyIkaDocThemeBridgeState({
    appearance,
    mode: dataset.ikadocRuntimeMode === "viewer" ? "viewer" : "editor",
    theme: typeof event.detail.theme === "string" ? event.detail.theme : undefined,
  });
}

/**
 * UI-09: someone joined or left the shared spreadsheet, or it closed. The host wrote the message
 * in the user's language, naming only people they may see; it is shown as text, never markup.
 */
function setParticipantsState(
  event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>,
): void {
  setRuntimeState("participants-changed", event);
  const message = readStringDetail(event.detail, "safeMessage");
  if (!message) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(IKADOC_PARTICIPANTS_CHANGED_EVENT, {
      detail: message.slice(0, MAX_RUNTIME_STATE_MESSAGE_LENGTH),
    }),
  );
}

function setGuidedWorkspaceDescriptorState(
  event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>,
): void {
  const descriptor = parseIkaDocGuidedWorkspaceDescriptor(
    event.detail.descriptor,
  );
  if (!descriptor) {
    setRuntimeState("guided-workspace-descriptor-invalid", {
      ...event,
      detail: { safeMessage: "Guided workspace metadata is unavailable." },
    });
    return;
  }

  document.documentElement.dataset.owarelinGuidedWorkspace =
    descriptor.marker.intent;
  document.documentElement.dataset.owarelinGuidedWorkspaceSchema =
    descriptor.schema.label;
  document.documentElement.dataset.owarelinGuidedWorkspaceTables =
    descriptor.tables.length.toString();
  document.documentElement.dataset.owarelinGuidedWorkspaceFields =
    descriptor.fields.length.toString();
  document.documentElement.dataset.owarelinGuidedWorkspaceProtectedColumns =
    descriptor.protectedColumns.length.toString();
}

function setRuntimeState(
  state: string,
  event: OwarelinRuntimeEvent<OwarelinInboundRuntimeEventName>,
): void {
  document.documentElement.dataset.owarelinRuntimeState = state;
  document.documentElement.dataset.owarelinRuntimeStateEvent = event.type;
  document.documentElement.dataset.owarelinRuntimeStateAt = event.emittedAt;
  const safeMessage =
    readStringDetail(event.detail, "safeMessage") ??
    readStringDetail(event.detail, "message");
  if (safeMessage) {
    document.documentElement.dataset.owarelinRuntimeStateMessage =
      safeMessage.slice(0, MAX_RUNTIME_STATE_MESSAGE_LENGTH);
  }
}

function readStringDetail(
  detail: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = detail[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const INBOUND_OWARELIN_RUNTIME_EVENTS: ReadonlySet<OwarelinInboundRuntimeEventName> =
  new Set([
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
    "owarelin:guidedWorkspaceDescriptorChanged",
    "owarelin:participantsChanged",
    "owarelin:sourcesChanged",
    "owarelin:sourceRecordsChanged",
    "owarelin:proposalIssues",
  ]);
