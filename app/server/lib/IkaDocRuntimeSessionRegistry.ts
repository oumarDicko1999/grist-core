import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

export interface IkaDocRuntimeSession {
  sessionId: string;
  documentId: string;
  documentUrlId: string;
  config: IkaDocRuntimeConfig;
  registeredAtMs: number;
}

export type IkaDocRuntimeSessionResolution =
  | { kind: "active"; session: IkaDocRuntimeSession }
  | { kind: "expired"; session: IkaDocRuntimeSession }
  | { kind: "missing" };

export class IkaDocRuntimeSessionRegistry {
  private readonly _byDocumentId = new Map<string, IkaDocRuntimeSession>();
  private readonly _byDocumentUrlId = new Map<string, IkaDocRuntimeSession>();
  private readonly _bySessionId = new Map<string, IkaDocRuntimeSession>();

  public register(
    config: IkaDocRuntimeConfig,
    registeredAtMs = Date.now(),
  ): IkaDocRuntimeSession {
    const session = {
      sessionId: config.sessionId,
      documentId: config.documentId,
      documentUrlId: config.documentUrlId,
      config,
      registeredAtMs,
    };
    this._byDocumentId.set(session.documentId, session);
    this._byDocumentUrlId.set(session.documentUrlId, session);
    this._bySessionId.set(session.sessionId, session);
    return session;
  }

  public getByDocumentId(documentId: string): IkaDocRuntimeSession | undefined {
    const resolution = this.resolveByDocumentId(documentId);
    return resolution.kind === "active" ? resolution.session : undefined;
  }

  public getBySessionId(sessionId: string): IkaDocRuntimeSession | undefined {
    const session = this._bySessionId.get(sessionId);
    return session ? this._pruneIfExpired(session) : undefined;
  }

  public resolveByDocumentId(
    documentId: string,
  ): IkaDocRuntimeSessionResolution {
    const session =
      this._byDocumentId.get(documentId) ??
      this._byDocumentUrlId.get(documentId);
    if (!session) {
      return { kind: "missing" };
    }
    if (runtimeSessionExpiresAtMs(session) > Date.now()) {
      return { kind: "active", session };
    }
    this._delete(session);
    return { kind: "expired", session };
  }

  public unregister(sessionId: string): void {
    const session = this._bySessionId.get(sessionId);
    if (!session) {
      return;
    }
    this._delete(session);
  }

  public pruneExpired(nowMs = Date.now()): void {
    for (const session of this._bySessionId.values()) {
      if (runtimeSessionExpiresAtMs(session) <= nowMs) {
        this._delete(session);
      }
    }
  }

  private _pruneIfExpired(
    session: IkaDocRuntimeSession,
  ): IkaDocRuntimeSession | undefined {
    if (runtimeSessionExpiresAtMs(session) > Date.now()) {
      return session;
    }
    this._delete(session);
    return undefined;
  }

  private _delete(session: IkaDocRuntimeSession): void {
    this._byDocumentId.delete(session.documentId);
    this._byDocumentUrlId.delete(session.documentUrlId);
    this._bySessionId.delete(session.sessionId);
  }
}

function runtimeSessionExpiresAtMs(session: IkaDocRuntimeSession): number {
  const expiresAtMs = Date.parse(session.config.expiresAt);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : Number.NEGATIVE_INFINITY;
}
