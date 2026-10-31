import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { setIkaDocGuidedWorkspaceIssues } from "app/client/ui/IkaDocGuidedWorkspaceIssues";
import {
  admitExistingGuidedWorkspaceRows,
  updateGuidedWorkspaceRowStates,
} from "app/client/ui/IkaDocGuidedWorkspaceRows";
import {
  canBuildIkaDocRuntimeProposal,
  canRefreshIkaDocRuntimeSource,
} from "app/client/ui/IkaDocRuntimeAccess";
import { basicButton } from "app/client/ui2018/buttons";
import { testId, theme } from "app/client/ui2018/cssVars";
import {
  IkaDocGuidedWorkspaceDescriptor,
  IkaDocGuidedWorkspaceIssue,
  IkaDocGuidedWorkspaceResult,
  parseIkaDocGuidedWorkspaceDescriptor,
  parseIkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import {
  OwarelinRuntimeEvent,
  postOwarelinRuntimeEvent,
} from "app/ikadoc/OwarelinRuntimeEvents";
import { IKADOC_PARTICIPANTS_CHANGED_EVENT } from "app/ikadoc/OwarelinRuntimeEvents";

import { Computed, dom, MultiHolder, Observable, styled } from "grainjs";

const t = makeT("IkaDocEditorControls");

const MAX_GUIDED_WORKSPACE_VISIBLE_ISSUES = 5;
const GUIDED_WORKSPACE_APPLY_IDEMPOTENCY_SCOPE_SEPARATOR = "\u0000";

const pendingGuidedWorkspaceApplyIdempotencyKeys = new Map<string, string>();

type IkaDocEditorControlState =
  | { kind: "idle"; message: string } |
  { kind: "loading"; message: string } |
  { kind: "error"; message: string };

type IkaDocGuidedWorkspaceControlState =
  | { kind: "hidden" } |
  { kind: "waiting"; message: string } |
  {
    kind: "ready";
    message: string;
    descriptor: IkaDocGuidedWorkspaceDescriptor;
  } |
  { kind: "error"; message: string };

interface IkaDocGuidedWorkspaceResultSummary {
  success: boolean;
  simulated: boolean;
  importedTotal: number;
  updatedTotal: number;
  errorCount: number;
  warningCount: number;
  conflictCount: number;
}

export function buildIkaDocEditorControls(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
  gristDoc: GristDoc,
): Element {
  const state = Observable.create<IkaDocEditorControlState>(owner, {
    kind: "loading",
    message: t("Checking session"),
  });
  const busy = Computed.create(owner, state, (_use, current) => {
    return current.kind === "loading";
  });
  const guidedWorkspaceState = buildGuidedWorkspaceState(owner, config);
  const guidedWorkspaceResult =
    Observable.create<IkaDocGuidedWorkspaceResult | null>(owner, null);
  owner.onDispose(() => setIkaDocGuidedWorkspaceIssues(null));

  void refreshIkaDocSessionStatus(config, state);

  // UI-09: who joined or left the shared spreadsheet, as the host tells it.
  const participants = Observable.create<string>(owner, "");
  const onParticipantsChanged = (event: Event) => {
    const message = (event as CustomEvent<unknown>).detail;
    participants.set(typeof message === "string" ? message : "");
  };
  window.addEventListener(IKADOC_PARTICIPANTS_CHANGED_EVENT, onParticipantsChanged);
  owner.onDispose(() =>
    window.removeEventListener(IKADOC_PARTICIPANTS_CHANGED_EVENT, onParticipantsChanged),
  );

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
    dom.domComputed(guidedWorkspaceState, (current) => {
      return current.kind === "hidden" ?
        null :
        cssIkaDocGuidedControls(
          cssIkaDocGuidedStatus(
            dom.text(current.message),
            cssIkaDocGuidedStatus.cls("-error", current.kind === "error"),
            testId("ikadoc-guided-workspace-status"),
          ),
          current.kind === "ready" &&
          config.guidedWorkspaceUrls &&
          current.descriptor.marker.finalAction === "APPLY_TO_IKADOC" ?
            [
              basicButton(
                t("Simulate"),
                dom.prop("disabled", busy),
                dom.on("click", () =>
                  runGuidedWorkspaceValidation(
                    config,
                    current.descriptor,
                    state,
                    guidedWorkspaceResult,
                    gristDoc,
                  ),
                ),
                testId("ikadoc-guided-workspace-simulate"),
              ),
              basicButton(
                t("Apply"),
                dom.prop("disabled", busy),
                dom.on("click", () =>
                  runGuidedWorkspaceApply(
                    config,
                    current.descriptor,
                    state,
                    guidedWorkspaceResult,
                    gristDoc,
                  ),
                ),
                testId("ikadoc-guided-workspace-apply"),
              ),
            ] :
            null,
          dom.domComputed(guidedWorkspaceResult, result =>
            result ? buildGuidedWorkspaceResultDetails(result) : null,
          ),
        );
    }),
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

function buildGuidedWorkspaceState(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
): Observable<IkaDocGuidedWorkspaceControlState> {
  if (!config.guidedWorkspace) {
    return Observable.create<IkaDocGuidedWorkspaceControlState>(owner, {
      kind: "hidden",
    });
  }

  const state = Observable.create<IkaDocGuidedWorkspaceControlState>(owner, {
    kind: "waiting",
    message: t("Guided workspace"),
  });
  const listener = (rawEvent: Event) => {
    const event = (rawEvent as CustomEvent<OwarelinRuntimeEvent>).detail;
    const descriptor = parseIkaDocGuidedWorkspaceDescriptor(
      event.detail.descriptor,
    );
    if (!descriptor || descriptor.tables.length === 0) {
      state.set({ kind: "error", message: t("Guided workspace unavailable") });
      return;
    }
    state.set({
      kind: "ready",
      descriptor,
      message: t("Guided workspace: {{schema}}", {
        schema: descriptor.schema.label,
      }),
    });
  };
  window.addEventListener(
    "owarelin:guidedWorkspaceDescriptorChanged",
    listener,
  );
  owner.onDispose(() =>
    window.removeEventListener(
      "owarelin:guidedWorkspaceDescriptorChanged",
      listener,
    ),
  );
  return state;
}

async function refreshIkaDocSessionStatus(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
): Promise<void> {
  try {
    const payload = await requestIkaDocJson(config, config.statusUrl, {
      method: "GET",
    });
    const status = readStringField(payload, "status");
    const sourceSummary = config.sourceSummary ?
      `${config.sourceSummary} - ` :
      "";
    state.set({
      kind: "idle",
      message: status ?
        t("{{sourceSummary}}Session: {{status}}", {
          sourceSummary,
          status,
        }) :
        t("{{sourceSummary}}Session ready", { sourceSummary }),
    });
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "status",
      safeMessage,
    });
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
  try {
    await requestIkaDocJson(config, config.refreshUrl, { method: "POST" });
    state.set({ kind: "idle", message: t("Source refreshed") });
    postOwarelinRuntimeEvent(config, "owarelin:sourceRefreshed");
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "refresh",
      safeMessage,
    });
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
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "proposal",
      safeMessage,
    });
  }
}

async function runGuidedWorkspaceValidation(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  state: Observable<IkaDocEditorControlState>,
  resultState: Observable<IkaDocGuidedWorkspaceResult | null>,
  gristDoc: GristDoc,
): Promise<void> {
  if (!config.guidedWorkspaceUrls) {
    return;
  }

  state.set({ kind: "loading", message: t("Simulating guided workspace") });
  resultState.set(null);
  setIkaDocGuidedWorkspaceIssues(null);
  try {
    await admitExistingGuidedWorkspaceRows(
      gristDoc,
      descriptor,
      t("Admit guided workspace rows"),
    );
    const payload = await requestIkaDocJson(
      config,
      config.guidedWorkspaceUrls.validateUrl,
      guidedWorkspaceRequest(descriptor),
    );
    const result = parseGuidedWorkspaceResultPayload(payload);
    resultState.set(result);
    setIkaDocGuidedWorkspaceIssues(result);
    await updateGuidedWorkspaceRowStates(
      gristDoc,
      descriptor,
      result,
      "validate",
      t("Update guided workspace row states"),
    );
    state.set({ kind: "idle", message: guidedWorkspaceResultMessage(result) });
    postOwarelinRuntimeEvent(
      config,
      "owarelin:guidedWorkspaceValidated",
      guidedWorkspaceResultSummary(result),
    );
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "guided-workspace-simulate",
      safeMessage,
    });
  }
}

async function runGuidedWorkspaceApply(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  state: Observable<IkaDocEditorControlState>,
  resultState: Observable<IkaDocGuidedWorkspaceResult | null>,
  gristDoc: GristDoc,
): Promise<void> {
  if (!config.guidedWorkspaceUrls) {
    return;
  }

  state.set({ kind: "loading", message: t("Applying guided workspace") });
  resultState.set(null);
  setIkaDocGuidedWorkspaceIssues(null);
  try {
    await admitExistingGuidedWorkspaceRows(
      gristDoc,
      descriptor,
      t("Admit guided workspace rows"),
    );
    const payload = await requestIkaDocJson(
      config,
      config.guidedWorkspaceUrls.applyUrl,
      guidedWorkspaceRequest(descriptor, {
        idempotencyKey: guidedWorkspaceApplyIdempotencyKey(config, descriptor),
      }),
    );
    const result = parseGuidedWorkspaceResultPayload(payload);
    resultState.set(result);
    setIkaDocGuidedWorkspaceIssues(result);
    await updateGuidedWorkspaceRowStates(
      gristDoc,
      descriptor,
      result,
      "apply",
      t("Update guided workspace row states"),
    );
    state.set({ kind: "idle", message: guidedWorkspaceResultMessage(result) });
    postOwarelinRuntimeEvent(
      config,
      "owarelin:guidedWorkspaceApplied",
      guidedWorkspaceResultSummary(result),
    );
    clearGuidedWorkspaceApplyIdempotencyKey(config, descriptor);
  } catch (error) {
    const safeMessage = safeIkaDocErrorMessage(error);
    state.set({ kind: "error", message: safeMessage });
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "guided-workspace-apply",
      safeMessage,
    });
  }
}

function guidedWorkspaceApplyIdempotencyKey(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
): string {
  const scope = guidedWorkspaceApplyIdempotencyScope(config, descriptor);
  const existing = pendingGuidedWorkspaceApplyIdempotencyKeys.get(scope);
  if (existing) {
    return existing;
  }
  const key = window.crypto.randomUUID();
  pendingGuidedWorkspaceApplyIdempotencyKeys.set(scope, key);
  return key;
}

function clearGuidedWorkspaceApplyIdempotencyKey(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
) {
  pendingGuidedWorkspaceApplyIdempotencyKeys.delete(
    guidedWorkspaceApplyIdempotencyScope(config, descriptor),
  );
}

function guidedWorkspaceApplyIdempotencyScope(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
): string {
  return [
    config.sessionId,
    descriptor.marker.intent,
    ...descriptor.tables.map(table =>
      [table.tableId, table.targetSchemaCode].join(
        GUIDED_WORKSPACE_APPLY_IDEMPOTENCY_SCOPE_SEPARATOR,
      ),
    ),
  ].join(GUIDED_WORKSPACE_APPLY_IDEMPOTENCY_SCOPE_SEPARATOR);
}

function guidedWorkspaceRequest(
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  extraBody: Record<string, unknown> = {},
): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tables: descriptor.tables.map(table => ({
        tableId: table.tableId,
        targetSchemaCode: table.targetSchemaCode,
      })),
      ...extraBody,
    }),
  };
}

function guidedWorkspaceResultMessage(
  result: IkaDocGuidedWorkspaceResult,
): string {
  const summary = guidedWorkspaceResultSummary(result);
  if (
    summary.success === false ||
    summary.errorCount > 0 ||
    summary.conflictCount > 0
  ) {
    return t("Guided workspace has {{count}} issue(s)", {
      count: summary.errorCount + summary.conflictCount,
    });
  }
  return t("Guided workspace ready to apply");
}

function guidedWorkspaceResultSummary(
  result: IkaDocGuidedWorkspaceResult,
): IkaDocGuidedWorkspaceResultSummary & Record<string, unknown> {
  return {
    success: result.success,
    simulated: result.simulated,
    importedTotal: countTotal(result.importedCounts),
    updatedTotal: countTotal(result.updatedCounts),
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    conflictCount: result.conflicts.length,
  };
}

function parseGuidedWorkspaceResultPayload(
  payload: unknown,
): IkaDocGuidedWorkspaceResult {
  const result = parseIkaDocGuidedWorkspaceResult(payload);
  if (!result) {
    throw new Error(t("Guided workspace response is invalid"));
  }
  return result;
}

function countTotal(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function buildGuidedWorkspaceResultDetails(
  result: IkaDocGuidedWorkspaceResult,
): Element | null {
  const issues = [...result.errors, ...result.warnings];
  if (issues.length === 0) {
    return null;
  }
  const visibleIssues = issues.slice(0, MAX_GUIDED_WORKSPACE_VISIBLE_ISSUES);
  return cssIkaDocGuidedIssueList(
    visibleIssues.map(issue =>
      cssIkaDocGuidedIssue(
        issueLabel(issue),
        cssIkaDocGuidedIssue.cls("-error", result.errors.includes(issue)),
      ),
    ),
    issues.length > visibleIssues.length ?
      cssIkaDocGuidedIssue(
        t("{{count}} more issue(s)", {
          count: issues.length - visibleIssues.length,
        }),
      ) :
      null,
    testId("ikadoc-guided-workspace-issues"),
  );
}

function issueLabel(issue: IkaDocGuidedWorkspaceIssue): string {
  const location = issueLocation(issue);
  return location ? `${location}: ${issue.message}` : issue.message;
}

function issueLocation(issue: IkaDocGuidedWorkspaceIssue): string {
  const parts = [
    issue.tableId ?? issue.schemaType,
    issue.gristRowId ?
      t("row {{row}}", { row: issue.gristRowId }) :
      issue.row ?
        t("row {{row}}", { row: issue.row }) :
        null,
    issue.metadataCode ?? issue.column,
  ].filter(Boolean);
  return parts.join(" / ");
}

async function requestIkaDocJson(
  config: IkaDocRuntimeConfig,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("X-Collection", config.collectionCode);
  const response = await window.fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(readIkaDocError(payload) ?? t("Request failed"));
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
  return error instanceof Error && error.message.length > 0 ?
    error.message :
    t("Request failed");
}

const cssIkaDocControls = styled(
  "div",
  `
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  margin-right: 8px;
`,
);

const cssIkaDocGuidedControls = styled(
  "div",
  `
  display: flex;
  align-items: center;
  gap: 6px;
`,
);

const cssIkaDocStatus = styled(
  "div",
  `
  max-width: 220px;
  color: ${theme.lightText};
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &-error {
    color: ${theme.errorText};
  }
`,
);

const cssIkaDocGuidedStatus = styled(
  "div",
  `
  display: flex;
  align-items: center;
  max-width: 180px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: ${theme.choiceTokenBg};
  color: ${theme.choiceTokenFg};
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &-error {
    background: color-mix(in srgb, ${theme.errorText} 14%, transparent);
    color: ${theme.errorText};
  }
`,
);

const cssIkaDocGuidedIssueList = styled(
  "div",
  `
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(520px, 40vw);
  overflow: hidden;
`,
);

const cssIkaDocGuidedIssue = styled(
  "div",
  `
  max-width: 160px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  background: ${theme.choiceTokenBg};
  color: ${theme.mediumText};
  font-size: 11px;
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &-error {
    background: color-mix(in srgb, ${theme.errorText} 14%, transparent);
    color: ${theme.errorText};
  }
`,
);
