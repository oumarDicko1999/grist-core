import { makeT } from "app/client/lib/localization";
import { IkaDocRequestError } from "app/ikadoc/IkaDocRequest";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";
import { postOwarelinRuntimeEvent } from "app/ikadoc/OwarelinRuntimeEvents";

import { Observable } from "grainjs";

const t = makeT("IkaDocEditorControlState");

/** What the editor's IkaDoc controls show: a message, and whether a call is running or failed. */
export type IkaDocEditorControlState =
  | { kind: "idle"; message: string } |
  { kind: "loading"; message: string } |
  { kind: "error"; message: string };

/**
 * A call to IkaDoc failed: the controls show why, and the IkaDoc page is told (runtimeError).
 * The message is IkaDoc's own when it refused, else a translated fallback, never a raw browser error.
 */
export function reportIkaDocControlFailure(
  config: IkaDocRuntimeConfig,
  state: Observable<IkaDocEditorControlState>,
  operation: string,
  error: unknown,
): void {
  const safeMessage = error instanceof IkaDocRequestError && error.ikadocMessage ?
    error.ikadocMessage :
    t("Request failed");

  state.set({ kind: "error", message: safeMessage });
  postOwarelinRuntimeEvent(config, "owarelin:runtimeError", { operation, safeMessage });
}
