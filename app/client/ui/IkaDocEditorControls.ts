import { makeT } from "app/client/lib/localization";
import { basicButton } from "app/client/ui2018/buttons";
import { testId, theme } from "app/client/ui2018/cssVars";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { postOwarelinRuntimeEvent } from "app/ikadoc/OwarelinRuntimeEvents";

import { Computed, dom, MultiHolder, Observable, styled } from "grainjs";

const t = makeT("IkaDocEditorControls");

type IkaDocEditorControlState =
  { kind: "idle"; message: string } |
  { kind: "loading"; message: string } |
  { kind: "error"; message: string };

export function buildIkaDocEditorControls(owner: MultiHolder, config: IkaDocRuntimeConfig): Element {
  const state = Observable.create<IkaDocEditorControlState>(owner, {
    kind: "loading",
    message: t("Checking IkaDoc session"),
  });
  const busy = Computed.create(owner, state, (_use, current) => {
    return current.kind === "loading";
  });

  void refreshIkaDocSessionStatus(config, state);

  return cssIkaDocControls(
    cssIkaDocStatus(
      dom.text(use => use(state).message),
      cssIkaDocStatus.cls("-error", use => use(state).kind === "error"),
      testId("ikadoc-editor-status"),
    ),
    config.refreshUrl && config.capabilities.canRefreshSource ? basicButton(
      t("Refresh"),
      dom.prop("disabled", busy),
      dom.on("click", () => runIkaDocRefresh(config, state)),
      testId("ikadoc-editor-refresh"),
    ) : null,
    config.proposalUrl && config.capabilities.canEditCells ? basicButton(
      t("Build proposal"),
      dom.prop("disabled", busy),
      dom.on("click", () => runIkaDocProposal(config, state)),
      testId("ikadoc-editor-proposal"),
    ) : null,
  );
}

async function refreshIkaDocSessionStatus(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  try {
    const payload = await requestIkaDocJson(config, config.statusUrl, { method: "GET" });
    const status = readStringField(payload, "status");
    const sourceSummary = config.sourceSummary ? `${config.sourceSummary} - ` : "";
    state.set({
      kind: "idle",
      message: status ?
        t("{{sourceSummary}}IkaDoc session: {{status}}", { sourceSummary, status }) :
        t("{{sourceSummary}}IkaDoc session ready", { sourceSummary }),
    });
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", { operation: "status", safeMessage });
  }
}

async function runIkaDocRefresh(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  if (!config.refreshUrl) {
    return;
  }

  state.set({ kind: "loading", message: t("Refreshing IkaDoc source") });
  postOwarelinRuntimeEvent(config, "owarelin:refreshRequested");
  try {
    await requestIkaDocJson(config, config.refreshUrl, { method: "POST" });
    state.set({ kind: "idle", message: t("IkaDoc source refreshed") });
    postOwarelinRuntimeEvent(config, "owarelin:sourceRefreshed");
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", { operation: "refresh", safeMessage });
  }
}

async function runIkaDocProposal(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  if (!config.proposalUrl) {
    return;
  }

  state.set({ kind: "loading", message: t("Building IkaDoc proposal") });
  postOwarelinRuntimeEvent(config, "owarelin:proposalRequested");
  try {
    await requestIkaDocJson(config, config.proposalUrl, { method: "POST" });
    state.set({ kind: "idle", message: t("IkaDoc proposal requested") });
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", { operation: "proposal", safeMessage });
  }
}

async function requestIkaDocJson(config: IkaDocRuntimeConfig, url: string, init: RequestInit): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("X-Collection", config.collectionCode);
  const response = await window.fetch(url, { credentials: "include", ...init, headers });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(readIkaDocError(payload) ?? t("IkaDoc request failed"));
  }
  return payload;
}

function readIkaDocError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const error = (payload as Record<string, unknown>).error;
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return undefined;
}

function readStringField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeIkaDocErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : t("IkaDoc request failed");
}

const cssIkaDocControls = styled("div", `
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  margin-right: 8px;
`);

const cssIkaDocStatus = styled("div", `
  max-width: 220px;
  color: ${theme.lightText};
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &-error {
    color: ${theme.errorText};
  }
`);
