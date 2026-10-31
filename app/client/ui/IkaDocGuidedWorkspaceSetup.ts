import { GristDoc } from "app/client/components/GristDoc";
import { makeT } from "app/client/lib/localization";
import { reportError } from "app/client/models/AppModel";
import { parseIkaDocGuidedWorkspaceDescriptor } from "app/ikadoc/IkaDocGuidedWorkspace";
import {
  buildGuidedWorkspacePageSetupActions,
  buildGuidedWorkspaceSetupActions,
  canPrepareGuidedWorkspaceTables,
  ExistingGuidedWorkspaceTable,
} from "app/ikadoc/IkaDocGuidedWorkspaceSetup";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import {
  OwarelinRuntimeEvent,
  postOwarelinRuntimeEvent,
} from "app/ikadoc/OwarelinRuntimeEvents";

import { MultiHolder } from "grainjs";

const t = makeT("IkaDocGuidedWorkspaceSetup");

export function attachIkaDocGuidedWorkspaceSetup(
  owner: MultiHolder,
  config: IkaDocRuntimeConfig,
  gristDoc: GristDoc,
): void {
  if (!canPrepareGuidedWorkspaceTables(config)) {
    return;
  }

  const listener = (rawEvent: Event) => {
    void prepareGuidedWorkspaceTables(config, gristDoc, rawEvent);
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
}

function existingGuidedWorkspaceTables(
  gristDoc: GristDoc,
): ExistingGuidedWorkspaceTable[] {
  return gristDoc.docModel.allTables.all().map((table) => {
    const tableRef = table.id.peek();
    const columnIds = table
      .columns()
      .all()
      .map(column => column.colId.peek());
    const hasPageSection = gristDoc.docModel.viewSections.rowModels.some(
      section =>
        section.tableRef.peek() === tableRef &&
        !section.isRaw.peek() &&
        !section.isRecordCard.peek(),
    );
    return {
      tableId: table.tableId.peek(),
      tableRef,
      columnIds,
      hasPageSection,
    };
  });
}

async function prepareGuidedWorkspaceTables(
  config: IkaDocRuntimeConfig,
  gristDoc: GristDoc,
  rawEvent: Event,
): Promise<void> {
  const event = (rawEvent as CustomEvent<OwarelinRuntimeEvent>).detail;
  const descriptor = parseIkaDocGuidedWorkspaceDescriptor(
    event.detail.descriptor,
  );
  if (!descriptor) {
    return;
  }

  const actions = buildGuidedWorkspaceSetupActions(
    descriptor,
    existingGuidedWorkspaceTables(gristDoc),
  );
  if (actions.length === 0) {
    return;
  }

  try {
    await gristDoc.docData.bundleActions(
      t("Prepare guided workspace tables"),
      () => gristDoc.docData.sendActions(actions),
    );

    const pageActions = buildGuidedWorkspacePageSetupActions(
      descriptor,
      existingGuidedWorkspaceTables(gristDoc),
    );
    if (pageActions.length > 0) {
      await gristDoc.docData.bundleActions(
        t("Prepare guided workspace pages"),
        () => gristDoc.docData.sendActions(pageActions),
      );
    }
  } catch (error) {
    reportError(error);
    postOwarelinRuntimeEvent(config, "owarelin:runtimeError", {
      operation: "guided-workspace-setup",
      safeMessage: t("Guided workspace setup failed."),
    });
  }
}
