import { IkaDocRuntimeSessionValidator } from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

/** How long someone removed from a session, or who lost access, can still watch it at most. */
const REVALIDATION_INTERVAL_MS = 15_000;
const REVALIDATION_OPERATION = "keep spreadsheet open";

/**
 * GR-03: someone who only watches a shared spreadsheet makes no action that IkaDoc could refuse,
 * yet still receives everyone else's changes. Every entry is therefore asked about periodically;
 * an entry IkaDoc refuses (removed from the session, access lost, session ended or IkaDoc
 * unreachable) leaves the registry, which closes that person's connections. Reconnecting asks
 * IkaDoc to admit them again, so it only succeeds if IkaDoc agrees.
 */
export class IkaDocRuntimeSessionRevalidator {
  private _timer: NodeJS.Timeout | undefined;
  private _running = false;

  public constructor(
    private readonly _registry: IkaDocRuntimeSessionRegistry,
    private readonly _validator: IkaDocRuntimeSessionValidator,
  ) {}

  public start(): void {
    this._timer ??= setInterval(() => void this.revalidateAll(), REVALIDATION_INTERVAL_MS);
  }

  public stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  public async revalidateAll(): Promise<void> {
    if (this._running) {
      return;
    }
    this._running = true;
    try {
      this._registry.pruneExpired();
      for (const session of this._registry.participants()) {
        try {
          await this._validator.validate(session, REVALIDATION_OPERATION);
        } catch (error) {
          log.warn("IkaDoc refused a spreadsheet participant; closing their connections", {
            sessionId: session.sessionId,
            documentId: session.documentId,
          });
          this._registry.unregister(session);
        }
      }
    } finally {
      this._running = false;
    }
  }
}
