import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { IkaDocEditorControlState, reportIkaDocControlFailure } from "app/client/ui/IkaDocEditorControlState";
import { buildIkaDocGuidedWorkspaceControls } from "app/client/ui/IkaDocGuidedWorkspaceControls";
import { listenForIkaDocProposalIssues } from "app/client/ui/IkaDocProposalIssueMarkers";
import { askIkaDocRemovedRows } from "app/client/ui/IkaDocRemovedRowsPrompt";
import {
  canBuildIkaDocRuntimeProposal,
  canRefreshIkaDocRuntimeSource,
} from "app/client/ui/IkaDocRuntimeAccess";
import { basicButton } from "app/client/ui2018/buttons";
import { testId, theme } from "app/client/ui2018/cssVars";
import { requestIkaDocJson } from "app/ikadoc/IkaDocRequest";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { refreshWithRemovalDecision } from "app/ikadoc/IkaDocSourceRefresh";
import { IKADOC_PARTICIPANTS_CHANGED_EVENT, postOwarelinRuntimeEvent } from "app/ikadoc/OwarelinRuntimeEvents";

import { Computed, dom, MultiHolder, Observable, styled } from "grainjs";

const t = makeT("IkaDocEditorControls");

/**
 * The editor's IkaDoc controls in Grist's top bar: the session status, who joined the shared
 * spreadsheet, the guided workspace, and « Refresh » / « Build proposal » when allowed.
 */
export function buildIkaDocEditorControls(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
  gristDoc: GristDoc,
): Element {
  const state = Observable.create<IkaDocEditorControlState>(owner, {
    kind: "loading",
    message: t("Checking session"),
  });
  const busy = Computed.create(owner, state, (_use, current) => current.kind === "loading");

  void refreshIkaDocSessionStatus(config, state);

  // GW-COL-05: the cells IkaDoc refused when it applied a proposal.
  listenForIkaDocProposalIssues(owner);

  // UI-09: who joined or left the shared spreadsheet, as the host tells it.
  const participants = Observable.create<string>(owner, "");
  const onParticipantsChanged = (event: Event) => {
    const message = (event as CustomEvent<unknown>).detail;
    participants.set(typeof message === "string" ? message : "");
  };

  window.addEventListener(IKADOC_PARTICIPANTS_CHANGED_EVENT, onParticipantsChanged);
  owner.onDispose(() => window.removeEventListener(IKADOC_PARTICIPANTS_CHANGED_EVENT, onParticipantsChanged));

  return cssIkaDocControls(
    cssIkaDocStatus(
      dom.text(use => use(state).message),
      cssIkaDocStatus.cls("-error", use => use(state).kind === "error"),
      testId("ikadoc-editor-status"),
    ),

    cssIkaDocStatus(
      dom.text(participants),
      dom.attr("aria-live", "polite"),
      dom.show(use => use(participants) !== ""),
      testId("ikadoc-participants-status"),
    ),

    buildIkaDocGuidedWorkspaceControls(owner, config, gristDoc, state),

    config.refreshUrl && canRefreshIkaDocRuntimeSource(config) ?
      basicButton(
        t("Refresh"),
        dom.prop("disabled", busy),
        dom.on("click", () => runIkaDocRefresh(config, state)),
        testId("ikadoc-editor-refresh"),
      ) :
      null,

    canBuildIkaDocRuntimeProposal(config) ?
      basicButton(
        t("Build proposal"),
        dom.prop("disabled", busy),
        dom.on("click", () => runIkaDocProposal(config, state)),
        testId("ikadoc-editor-proposal"),
      ) :
      null,
  );
}

async function refreshIkaDocSessionStatus(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  try {
    const payload = await requestIkaDocJson(config, config.statusUrl, { method: "GET" });

    const rawStatus = payload && typeof payload === "object" ? (payload as Record<string, unknown>).status : undefined;
    const status = typeof rawStatus === "string" && rawStatus.length > 0 ? rawStatus : undefined;
    const sourceSummary = config.sourceSummary ? `${config.sourceSummary} - ` : "";

    state.set({
      kind: "idle",
      message: status ?
        t("{{sourceSummary}}Session: {{status}}", { sourceSummary, status }) :
        t("{{sourceSummary}}Session ready", { sourceSummary }),
    });
  } catch (error) {
    reportIkaDocControlFailure(config, state, "status", error);
  }
}

async function runIkaDocRefresh(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  if (!config.refreshUrl) {
    return;
  }

  state.set({ kind: "loading", message: t("Refreshing source") });
  postOwarelinRuntimeEvent(config, "owarelin:refreshRequested");

  const refreshUrl = config.refreshUrl;

  try {
    // GW-RFR-01: rows whose records are gone are only removed or kept once the person decides.
    const outcome = await refreshWithRemovalDecision(
      body => requestIkaDocJson(config, refreshUrl, { method: "POST", body }),
      askIkaDocRemovedRows,
    );

    if (outcome === "cancelled") {
      state.set({ kind: "idle", message: t("Refresh cancelled") });
      return;
    }

    state.set({ kind: "idle", message: t("Source refreshed") });
    postOwarelinRuntimeEvent(config, "owarelin:sourceRefreshed");
  } catch (error) {
    reportIkaDocControlFailure(config, state, "refresh", error);
  }
}

async function runIkaDocProposal(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  if (!config.proposalUrl) {
    return;
  }

  state.set({ kind: "loading", message: t("Building proposal") });
  postOwarelinRuntimeEvent(config, "owarelin:proposalRequested");

  try {
    await requestIkaDocJson(config, config.proposalUrl, { method: "POST" });

    state.set({ kind: "idle", message: t("Proposal requested") });
  } catch (error) {
    reportIkaDocControlFailure(config, state, "proposal", error);
  }
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
