/**
 * GW-SRC-10 / GW-RFR-05: the IkaDoc sources behind a Grist session, as IkaDoc describes them
 * in the runtime config and in `owarelin:sourcesChanged` events. IkaDoc writes the labels.
 */
export type IkaDocSourceOrigin = "saved-search" | "query" | "selection" | "document";

export interface IkaDocSessionSource {
  sourceId: string;
  tableId: string;
  label: string;
  origin: IkaDocSourceOrigin;

  /** IkaDoc's description of what the source covers, e.g. « Recherche « Factures 2026 » ». */
  scope: string;

  rowCount: number;

  /** When IkaDoc materialized or last refreshed the source (ISO 8601). */
  snapshotAt: string;
}

const ORIGINS: ReadonlySet<string> = new Set<IkaDocSourceOrigin>([
  "saved-search",
  "query",
  "selection",
  "document",
]);

/** Undefined when IkaDoc sends no sources; "invalid" when any entry is malformed. */
export function parseIkaDocSessionSources(input: unknown): IkaDocSessionSource[] | undefined | "invalid" {
  if (input === undefined) {
    return undefined;
  }

  if (!Array.isArray(input)) {
    return "invalid";
  }

  const sources = input.map(parseSource);

  return sources.every(source => source !== undefined) ? sources : "invalid";
}

function parseSource(input: unknown): IkaDocSessionSource | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const raw = input as Record<string, unknown>;

  const texts = [raw.sourceId, raw.tableId, raw.label, raw.scope, raw.snapshotAt];
  const hasTexts = texts.every(value => typeof value === "string" && value.length > 0);

  const hasOrigin = typeof raw.origin === "string" && ORIGINS.has(raw.origin);
  const hasRowCount = Number.isInteger(raw.rowCount) && (raw.rowCount as number) >= 0;
  const hasSnapshotTime = typeof raw.snapshotAt === "string" && !Number.isNaN(Date.parse(raw.snapshotAt));

  if (!hasTexts || !hasOrigin || !hasRowCount || !hasSnapshotTime) {
    return undefined;
  }

  return {
    sourceId: raw.sourceId as string,
    tableId: raw.tableId as string,
    label: raw.label as string,
    origin: raw.origin as IkaDocSourceOrigin,
    scope: raw.scope as string,
    rowCount: raw.rowCount as number,
    snapshotAt: raw.snapshotAt as string,
  };
}
