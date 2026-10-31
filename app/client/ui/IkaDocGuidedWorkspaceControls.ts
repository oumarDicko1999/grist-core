import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { IkaDocEditorControlState, reportIkaDocControlFailure } from "app/client/ui/IkaDocEditorControlState";
import { setIkaDocGuidedWorkspaceIssues } from "app/client/ui/IkaDocGuidedWorkspaceIssues";
import {
  admitExistingGuidedWorkspaceRows,
  updateGuidedWorkspaceRowStates,
} from "app/client/ui/IkaDocGuidedWorkspaceRows";
import { basicButton } from "app/client/ui2018/buttons";
import { testId, theme } from "app/client/ui2018/cssVars";
import {
  IkaDocGuidedWorkspaceDescriptor,
  IkaDocGuidedWorkspaceIssue,
  IkaDocGuidedWorkspaceResult,
  parseIkaDocGuidedWorkspaceDescriptor,
  parseIkaDocGuidedWorkspaceResult,
} from "app/ikadoc/IkaDocGuidedWorkspace";
import { requestIkaDocJson } from "app/ikadoc/IkaDocRequest";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { OwarelinRuntimeEvent, postOwarelinRuntimeEvent } from "app/ikadoc/OwarelinRuntimeEvents";

import { Computed, dom, DomContents, MultiHolder, Observable, styled } from "grainjs";

const t = makeT("IkaDocGuidedWorkspaceControls");

const MAX_GUIDED_WORKSPACE_VISIBLE_ISSUES = 5;
const GUIDED_WORKSPACE_APPLY_IDEMPOTENCY_SCOPE_SEPARATOR = "\u0000";

/** One idempotency key per pending apply, so a retried apply is not applied twice by IkaDoc. */
const pendingGuidedWorkspaceApplyIdempotencyKeys = new Map<string, string>();

type IkaDocGuidedWorkspaceControlState =
  | { kind: "hidden" } |
  { kind: "waiting"; message: string } |
  { kind: "ready"; message: string; descriptor: IkaDocGuidedWorkspaceDescriptor } |
  { kind: "error"; message: string };

type GuidedWorkspaceStep = "validate" | "apply";

interface IkaDocGuidedWorkspaceResultSummary {
  success: boolean;
  simulated: boolean;
  importedTotal: number;
  updatedTotal: number;
  errorCount: number;
  warningCount: number;
  conflictCount: number;
}

/**
 * The guided workspace's controls: its status, « Simulate » and « Apply », and the issues IkaDoc
 * found. Runs share the editor controls' state, so one IkaDoc call runs at a time.
 */
export function buildIkaDocGuidedWorkspaceControls(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
  gristDoc: GristDoc,
  editorState: Observable<IkaDocEditorControlState>,
): DomContents {
  const busy = Computed.create(owner, editorState, (_use, current) => current.kind === "loading");

  const guidedState = buildGuidedWorkspaceState(owner, config);
  const result = Observable.create<IkaDocGuidedWorkspaceResult | null>(owner, null);
  owner.onDispose(() => setIkaDocGuidedWorkspaceIssues(null));

  const run = (step: GuidedWorkspaceStep, descriptor: IkaDocGuidedWorkspaceDescriptor) =>
    runGuidedWorkspaceStep(step, config, descriptor, editorState, result, gristDoc);

  return dom.domComputed(guidedState, (current) => {
    if (current.kind === "hidden") {
      return null;
    }

    const canApply = current.kind === "ready" && config.guidedWorkspaceUrls &&
      current.descriptor.marker.finalAction === "APPLY_TO_IKADOC";

    return cssIkaDocGuidedControls(
      cssIkaDocGuidedStatus(
        dom.text(current.message),
        cssIkaDocGuidedStatus.cls("-error", current.kind === "error"),
        testId("ikadoc-guided-workspace-status"),
      ),

      canApply ? [
        basicButton(
          t("Simulate"),
          dom.prop("disabled", busy),
          dom.on("click", () => run("validate", current.descriptor)),
          testId("ikadoc-guided-workspace-simulate"),
        ),
        basicButton(
          t("Apply"),
          dom.prop("disabled", busy),
          dom.on("click", () => run("apply", current.descriptor)),
          testId("ikadoc-guided-workspace-apply"),
        ),
      ] : null,

      dom.domComputed(result, current => current ? buildGuidedWorkspaceResultDetails(current) : null),
    );
  });
}

/** The descriptor arrives from the IkaDoc page (owarelin:guidedWorkspaceDescriptorChanged). */
function buildGuidedWorkspaceState(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
): Observable<IkaDocGuidedWorkspaceControlState> {
  if (!config.guidedWorkspace) {
    return Observable.create<IkaDocGuidedWorkspaceControlState>(owner, { kind: "hidden" });
  }

  const state = Observable.create<IkaDocGuidedWorkspaceControlState>(owner, {
    kind: "waiting",
    message: t("Guided workspace"),
  });

  const listener = (rawEvent: Event) => {
    const event = (rawEvent as CustomEvent<OwarelinRuntimeEvent>).detail;
    const descriptor = parseIkaDocGuidedWorkspaceDescriptor(event.detail.descriptor);

    if (!descriptor || descriptor.tables.length === 0) {
      state.set({ kind: "error", message: t("Guided workspace unavailable") });
      return;
    }

    state.set({
      kind: "ready",
      descriptor,
      message: t("Guided workspace: {{schema}}", { schema: descriptor.schema.label }),
    });
  };

  window.addEventListener("owarelin:guidedWorkspaceDescriptorChanged", listener);
  owner.onDispose(() => window.removeEventListener("owarelin:guidedWorkspaceDescriptorChanged", listener));

  return state;
}

/**
 * Simulates (validate) or applies the guided workspace through IkaDoc: rows are admitted first,
 * then IkaDoc's result marks the rows and lists the issues. An apply carries an idempotency key,
 * kept until it succeeds, so retrying it never applies twice.
 */
async function runGuidedWorkspaceStep(
  step: GuidedWorkspaceStep,
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
  state: Observable<IkaDocEditorControlState>,
  resultState: Observable<IkaDocGuidedWorkspaceResult | null>,
  gristDoc: GristDoc,
): Promise<void> {
  const urls = config.guidedWorkspaceUrls;
  if (!urls) {
    return;
  }

  const isApply = step === "apply";

  state.set({
    kind: "loading",
    message: isApply ? t("Applying guided workspace") : t("Simulating guided workspace"),
  });
  resultState.set(null);
  setIkaDocGuidedWorkspaceIssues(null);

  try {
    await admitExistingGuidedWorkspaceRows(gristDoc, descriptor, t("Admit guided workspace rows"));

    const body = {
      tables: descriptor.tables.map(table => ({ tableId: table.tableId, targetSchemaCode: table.targetSchemaCode })),
      ...(isApply ? { idempotencyKey: guidedWorkspaceApplyIdempotencyKey(config, descriptor) } : {}),
    };
    const payload = await requestIkaDocJson(config, isApply ? urls.applyUrl : urls.validateUrl, {
      method: "POST",
      body,
    });

    const result = parseIkaDocGuidedWorkspaceResult(payload);
    if (!result) {
      throw new Error(t("Guided workspace response is invalid"));
    }

    resultState.set(result);
    setIkaDocGuidedWorkspaceIssues(result);
    await updateGuidedWorkspaceRowStates(gristDoc, descriptor, result, step, t("Update guided workspace row states"));

    state.set({ kind: "idle", message: guidedWorkspaceResultMessage(result) });
    postOwarelinRuntimeEvent(
      config,
      isApply ? "owarelin:guidedWorkspaceApplied" : "owarelin:guidedWorkspaceValidated",
      guidedWorkspaceResultSummary(result),
    );

    if (isApply) {
      pendingGuidedWorkspaceApplyIdempotencyKeys.delete(guidedWorkspaceApplyIdempotencyScope(config, descriptor));
    }
  } catch (error) {
    const operation = isApply ? "guided-workspace-apply" : "guided-workspace-simulate";
    reportIkaDocControlFailure(config, state, operation, error);
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

/** The same apply: the same session, intent and tables with their target schemas. */
function guidedWorkspaceApplyIdempotencyScope(
  config: IkaDocRuntimeConfig,
  descriptor: IkaDocGuidedWorkspaceDescriptor,
): string {
  const separator = GUIDED_WORKSPACE_APPLY_IDEMPOTENCY_SCOPE_SEPARATOR;
  const tables = descriptor.tables.map(table => [table.tableId, table.targetSchemaCode].join(separator));

  return [config.sessionId, descriptor.marker.intent, ...tables].join(separator);
}

function guidedWorkspaceResultMessage(result: IkaDocGuidedWorkspaceResult): string {
  const summary = guidedWorkspaceResultSummary(result);

  const blockingCount = summary.errorCount + summary.conflictCount;
  if (!summary.success || blockingCount > 0) {
    return t("Guided workspace has {{count}} issue(s)", { count: blockingCount });
  }

  return t("Guided workspace ready to apply");
}

/** What the IkaDoc page is told about a run: counts only, never row or cell data. */
function guidedWorkspaceResultSummary(
  result: IkaDocGuidedWorkspaceResult,
): IkaDocGuidedWorkspaceResultSummary & Record<string, unknown> {
  const total = (counts: Readonly<Record<string, number>>) =>
    Object.values(counts).reduce((sum, count) => sum + count, 0);

  return {
    success: result.success,
    simulated: result.simulated,
    importedTotal: total(result.importedCounts),
    updatedTotal: total(result.updatedCounts),
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    conflictCount: result.conflicts.length,
  };
}

function buildGuidedWorkspaceResultDetails(result: IkaDocGuidedWorkspaceResult): Element | null {
  const issues = [...result.errors, ...result.warnings];
  if (issues.length === 0) {
    return null;
  }

  const visibleIssues = issues.slice(0, MAX_GUIDED_WORKSPACE_VISIBLE_ISSUES);
  const hiddenCount = issues.length - visibleIssues.length;

  return cssIkaDocGuidedIssueList(
    visibleIssues.map(issue =>
      cssIkaDocGuidedIssue(
        issueLabel(issue),
        cssIkaDocGuidedIssue.cls("-error", result.errors.includes(issue)),
      ),
    ),
    hiddenCount > 0 ? cssIkaDocGuidedIssue(t("{{count}} more issue(s)", { count: hiddenCount })) : null,
    testId("ikadoc-guided-workspace-issues"),
  );
}

/** « Factures / ligne 4 / montant: message », with whatever location IkaDoc gave. */
function issueLabel(issue: IkaDocGuidedWorkspaceIssue): string {
  const row = issue.gristRowId || issue.row;

  const location = [
    issue.tableId ?? issue.schemaType,
    row ? t("row {{row}}", { row }) : null,
    issue.metadataCode ?? issue.column,
  ].filter(Boolean).join(" / ");

  return location ? `${location}: ${issue.message}` : issue.message;
}

const cssIkaDocGuidedControls = styled("div", `
  display: flex;
  align-items: center;
  gap: 6px;
`);

const cssIkaDocGuidedStatus = styled("div", `
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
`);

const cssIkaDocGuidedIssueList = styled("div", `
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: min(520px, 40vw);
  overflow: hidden;
`);

const cssIkaDocGuidedIssue = styled("div", `
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
`);
