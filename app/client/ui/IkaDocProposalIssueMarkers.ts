import { setIkaDocGuidedWorkspaceIssues } from "app/client/ui/IkaDocGuidedWorkspaceIssues";
import { IKADOC_PROPOSAL_ISSUES_EVENT, parseIkaDocProposalIssues } from "app/ikadoc/IkaDocProposalIssues";

import { MultiHolder } from "grainjs";

/**
 * GW-COL-05: marks the cells IkaDoc refused when applying a proposal, with the same markers the
 * guided workspace uses, until the next proposal result or the editor closes.
 */
export function listenForIkaDocProposalIssues(owner: MultiHolder): void {
  const listener = (event: Event) => {
    const runtimeEvent = (event as CustomEvent<{ detail?: Record<string, unknown> }>).detail;

    setIkaDocGuidedWorkspaceIssues(parseIkaDocProposalIssues(runtimeEvent?.detail ?? {}));
  };

  window.addEventListener(IKADOC_PROPOSAL_ISSUES_EVENT, listener);
  owner.onDispose(() => window.removeEventListener(IKADOC_PROPOSAL_ISSUES_EVENT, listener));
}
