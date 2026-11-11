import { IkaDocRequestError } from "app/ikadoc/IkaDocRequest";

/** IkaDoc's answer when a refresh would remove rows and the person has not decided yet. */
export const IKADOC_REMOVAL_UNDECIDED_CODE = "GRIST_SOURCE_REFRESH_REMOVAL_UNDECIDED";

/** What the person chose for rows whose records are gone from the source (GW-RFR-01). */
export type IkaDocRemovedRowsDecision = "remove" | "keep";

/** The body of a refresh request: empty until the person has answered the warning. */
export interface IkaDocRefreshBody {
  removedRows?: IkaDocRemovedRowsDecision;
}

/**
 * How many rows a refresh would remove when IkaDoc stopped it so the person can decide, or
 * undefined for any other failure.
 */
export function ikaDocUndecidedRemovedRows(error: unknown): number | undefined {
  if (!(error instanceof IkaDocRequestError) || error.code !== IKADOC_REMOVAL_UNDECIDED_CODE) {
    return undefined;
  }

  const count = Number(error.params.removedRows);

  return Number.isInteger(count) && count > 0 ? count : undefined;
}

/**
 * GW-RFR-01: refreshes with no decision first. When IkaDoc answers that rows would be removed,
 * asks the person, then refreshes again with their answer. Returns "cancelled" when the person
 * closed the warning; nothing was changed then.
 */
export async function refreshWithRemovalDecision(
  send: (body: IkaDocRefreshBody) => Promise<unknown>,
  ask: (removedRows: number) => Promise<IkaDocRemovedRowsDecision | undefined>,
): Promise<"refreshed" | "cancelled"> {
  try {
    await send({});

    return "refreshed";
  } catch (error) {
    const removedRows = ikaDocUndecidedRemovedRows(error);
    if (removedRows === undefined) {
      throw error;
    }

    const decision = await ask(removedRows);
    if (!decision) {
      return "cancelled";
    }

    await send({ removedRows: decision });

    return "refreshed";
  }
}
