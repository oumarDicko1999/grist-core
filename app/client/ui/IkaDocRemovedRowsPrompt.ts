import { makeT } from "app/client/lib/localization";
import { bigBasicButton } from "app/client/ui2018/buttons";
import { testId } from "app/client/ui2018/cssVars";
import { saveModal } from "app/client/ui2018/modals";
import { IkaDocRemovedRowsDecision } from "app/ikadoc/IkaDocSourceRefresh";

import { dom } from "grainjs";

const t = makeT("IkaDocRemovedRowsPrompt");

/**
 * GW-RFR-01: warns that refreshing would remove rows whose records are gone (deleted, no longer
 * readable, or no longer matching), and asks whether to remove or keep them. Resolves undefined
 * when the person cancels.
 */
export function askIkaDocRemovedRows(removedRows: number): Promise<IkaDocRemovedRowsDecision | undefined> {
  return new Promise((resolve) => {
    saveModal(ctl => ({
      title: t("{{count}} rows are no longer in the source", { count: removedRows }),
      body: [
        dom("p", t("Their records were deleted, no longer match, or you can no longer read them.")),
        dom("p", t("Remove these rows from the table, or keep them as they are?")),
      ],
      saveLabel: t("Remove the rows"),
      saveFunc: async () => resolve("remove"),
      extraButtons: bigBasicButton(t("Keep the rows"),
        dom.on("click", () => {
          resolve("keep");
          ctl.close();
        }),
        testId("ikadoc-keep-removed-rows"),
      ),
      width: "normal",
    }), { onCancel: () => resolve(undefined) });
  });
}
