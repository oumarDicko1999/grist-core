import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { IkaDocRuntimeConfig } from "app/ikadoc/IkaDocRuntimeConfig";

import { randomBytes } from "crypto";

const PARTICIPANT_HANDLE_BYTES = 32;

/**
 * Browsers (tabs, devices) one person may keep open in one session. Beyond it the oldest entry
 * leaves, so admissions that lost their cookie cannot pile up until the session expires.
 */
const MAX_ENTRIES_PER_PERSON = 8;

/**
 * One person admitted into one IkaDoc spreadsheet session. Several people can share a session
 * (GR-02); each has their own entry, runtime config and validation token, so every request and
 * every action is validated as the person who made it (GR-03).
 */
export interface IkaDocRuntimeSession {
  sessionId: string;
  /** Unguessable name of this entry, carried by this person's browser only. */
  participantHandle: string;
  userId: string;
  documentId: string;
  documentUrlId: string;
  config: IkaDocRuntimeConfig;
  registeredAtMs: number;
}

export type IkaDocRuntimeSessionResolution =
  | { kind: "active"; session: IkaDocRuntimeSession } |
  { kind: "expired"; session: IkaDocRuntimeSession } |
  { kind: "forbidden"; session: IkaDocRuntimeSession } |
  { kind: "missing" };

export class IkaDocRuntimeSessionRegistry {
  private readonly _byHandle = new Map<string, IkaDocRuntimeSession>();
  private readonly _onUnregistered: ((session: IkaDocRuntimeSession) => void)[] = [];

  /**
   * Admits [config]'s person in one browser ([browserHandle]: the entry its cookie names).
   * A person may have several tabs and devices open: entering again never disconnects them.
   * Their entries take the new config at once (capabilities may have changed), the browser's own
   * entry is reused, and only entries for a document the session has left are dropped.
   */
  public register(
    config: IkaDocRuntimeConfig,
    registeredAtMs = Date.now(),
    browserHandle?: string,
  ): IkaDocRuntimeSession {
    for (const entry of this._entriesOf(config.sessionId, config.user.userId)) {
      if (entry.documentId !== config.documentId) {
        this._delete(entry);
        continue;
      }

      entry.config = config;
      entry.documentUrlId = config.documentUrlId;
    }

    const browserEntry = browserHandle ? this._byHandle.get(browserHandle) : undefined;
    const isSamePerson = browserEntry?.sessionId === config.sessionId &&
      browserEntry.userId === config.user.userId;
    if (browserEntry && isSamePerson) {
      return browserEntry;
    }

    const personEntries = this._entriesOf(config.sessionId, config.user.userId);
    const overLimit = Math.max(0, personEntries.length - MAX_ENTRIES_PER_PERSON + 1);
    for (const oldest of personEntries.slice(0, overLimit)) {
      this._delete(oldest);
    }

    const session: IkaDocRuntimeSession = {
      sessionId: config.sessionId,
      participantHandle: randomBytes(PARTICIPANT_HANDLE_BYTES).toString("base64url"),
      userId: config.user.userId,
      documentId: config.documentId,
      documentUrlId: config.documentUrlId,
      config,
      registeredAtMs,
    };
    this._byHandle.set(session.participantHandle, session);
    return session;
  }

  public getByHandle(participantHandle: string): IkaDocRuntimeSession | undefined {
    const session = this._byHandle.get(participantHandle);
    return session ? this._pruneIfExpired(session) : undefined;
  }

  /** The person's most recent entry in the session (they may have several browsers open). */
  public getByParticipant(
    sessionId: string,
    userId: string,
  ): IkaDocRuntimeSession | undefined {
    const latest = this._entriesOf(sessionId, userId).at(-1);

    return latest ? this._pruneIfExpired(latest) : undefined;
  }

  /**
   * The document's policy, for requests that carry no person of their own. With several people
   * in a session it is the narrowest one (fewest capabilities), so it never grants more than
   * anyone was given. It never identifies a person.
   */
  public resolveByDocumentId(
    documentId: string,
  ): IkaDocRuntimeSessionResolution {
    const matching = [...this._byHandle.values()].filter(
      session => session.documentId === documentId || session.documentUrlId === documentId,
    );
    if (matching.length === 0) {
      return { kind: "missing" };
    }
    const nowMs = Date.now();
    const active = matching.filter(session => !isIkaDocRuntimeSessionExpired(session, nowMs));
    for (const expired of matching.filter(session => !active.includes(session))) {
      this._delete(expired);
    }
    if (active.length === 0) {
      return { kind: "expired", session: matching[0] };
    }
    return { kind: "active", session: narrowest(active) };
  }

  public participants(): IkaDocRuntimeSession[] {
    return [...this._byHandle.values()];
  }

  public unregister(session: IkaDocRuntimeSession): void {
    if (this._byHandle.get(session.participantHandle) === session) {
      this._delete(session);
    }
  }

  /** Called with every entry that leaves the registry, so its connections can be closed. */
  public onUnregistered(listener: (session: IkaDocRuntimeSession) => void): void {
    this._onUnregistered.push(listener);
  }

  public pruneExpired(nowMs = Date.now()): void {
    for (const session of this._byHandle.values()) {
      if (isIkaDocRuntimeSessionExpired(session, nowMs)) {
        this._delete(session);
      }
    }
  }

  /** The person's entries in the session, oldest first. */
  private _entriesOf(sessionId: string, userId: string): IkaDocRuntimeSession[] {
    return [...this._byHandle.values()]
      .filter(session => session.sessionId === sessionId && session.userId === userId)
      .sort((a, b) => a.registeredAtMs - b.registeredAtMs);
  }

  private _pruneIfExpired(
    session: IkaDocRuntimeSession,
  ): IkaDocRuntimeSession | undefined {
    if (!isIkaDocRuntimeSessionExpired(session)) {
      return session;
    }
    this._delete(session);
    return undefined;
  }

  private _delete(session: IkaDocRuntimeSession): void {
    this._byHandle.delete(session.participantHandle);
    for (const listener of this._onUnregistered) {
      listener(session);
    }
  }
}

/**
 * Only what every person in the session may do (the intersection of their capabilities),
 * so a request without a person is never allowed something one of them was refused.
 */
function narrowest(sessions: IkaDocRuntimeSession[]): IkaDocRuntimeSession {
  const [first] = sessions;
  const capabilityNames = Object.keys(first.config.capabilities) as (keyof IkaDocCapabilities)[];

  const shared = Object.fromEntries(
    capabilityNames.map(name => [
      name,
      sessions.every(session => session.config.capabilities[name] === true),
    ]),
  ) as unknown as IkaDocCapabilities;

  // Prefer a real person's entry when it already has exactly the shared capabilities.
  const exactMatch = sessions.find(session =>
    capabilityNames.every(name => session.config.capabilities[name] === shared[name]),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const anyViewer = sessions.some(session => session.config.mode === "viewer");
  const mode = anyViewer ? "viewer" : first.config.mode;

  return { ...first, config: { ...first.config, mode, capabilities: shared } };
}

/** Whether the session's admission has run out; an unreadable expiry counts as expired. */
export function isIkaDocRuntimeSessionExpired(session: IkaDocRuntimeSession, nowMs = Date.now()): boolean {
  const expiresAtMs = Date.parse(session.config.expiresAt);

  return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs;
}

const attachedSessions = new WeakMap<object, IkaDocRuntimeSession>();

/** Remembers who the runtime auth admitted for [request], for the policy checks that follow. */
export function attachIkaDocRuntimeSession(request: object, session: IkaDocRuntimeSession): void {
  attachedSessions.set(request, session);
}

export function attachedIkaDocRuntimeSession(request: object): IkaDocRuntimeSession | undefined {
  return attachedSessions.get(request);
}
