import { resolveIkaDocGuidedReferenceOptions } from "app/ikadoc/IkaDocReferenceLookup";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

const MAX_CACHED_LABELS = 2000;

/** Which reference field a lookup is for: IkaDoc scopes the allowed records by it. */
export interface IkaDocReferenceLookupContext {
  tableId: string;
  metadataCode: string;
  rowKey?: string;
}

interface LabelWaiter {
  resolve: (label: string) => void;
  reject: (error: unknown) => void;
}

/** The ids asked for in one turn of the event loop, for one lookup context. */
interface LabelBatch {
  config: IkaDocRuntimeConfig;
  context: IkaDocReferenceLookupContext;
  waiters: Map<string, LabelWaiter[]>;
}

const cachedLabels = new Map<string, string>();
const pendingBatches = new Map<string, LabelBatch>();

/**
 * The label IkaDoc gives a referenced record, or its id when IkaDoc does not know it.
 *
 * A grid shows many reference cells at once, so the ids asked for in the same turn are resolved
 * in one IkaDoc call. Labels are cached per session and context, oldest dropped first.
 */
export function ikaDocReferenceLabel(
  config: IkaDocRuntimeConfig,
  context: IkaDocReferenceLookupContext,
  id: string,
): Promise<string> {
  const contextKey = lookupContextKey(config, context);

  const cached = cachedLabels.get(`${contextKey}|${id}`);
  if (cached) {
    return Promise.resolve(cached);
  }

  let batch = pendingBatches.get(contextKey);
  if (!batch) {
    batch = { config, context, waiters: new Map() };
    pendingBatches.set(contextKey, batch);
    window.setTimeout(() => resolveBatch(contextKey), 0);
  }

  const waiters = batch.waiters.get(id) ?? [];
  batch.waiters.set(id, waiters);

  return new Promise<string>((resolve, reject) => waiters.push({ resolve, reject }));
}

async function resolveBatch(contextKey: string): Promise<void> {
  const batch = pendingBatches.get(contextKey);
  if (!batch) {
    return;
  }

  pendingBatches.delete(contextKey);
  const ids = [...batch.waiters.keys()];

  try {
    const options = await resolveIkaDocGuidedReferenceOptions(batch.config, { ...batch.context, ids });
    const labels = new Map(options.map(option => [option.id, option.label]));

    for (const [id, waiters] of batch.waiters) {
      const label = labels.get(id) ?? id;

      cacheLabel(`${contextKey}|${id}`, label);
      waiters.forEach(waiter => waiter.resolve(label));
    }
  } catch (error) {
    for (const waiters of batch.waiters.values()) {
      waiters.forEach(waiter => waiter.reject(error));
    }
  }
}

function cacheLabel(key: string, label: string): void {
  cachedLabels.set(key, label);

  const oldestKey = cachedLabels.keys().next().value;
  if (cachedLabels.size > MAX_CACHED_LABELS && oldestKey !== undefined) {
    cachedLabels.delete(oldestKey);
  }
}

function lookupContextKey(config: IkaDocRuntimeConfig, context: IkaDocReferenceLookupContext): string {
  return [config.sessionId, context.tableId, context.metadataCode, context.rowKey ?? ""].join("|");
}
