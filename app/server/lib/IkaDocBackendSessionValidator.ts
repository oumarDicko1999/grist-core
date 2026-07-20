import { IkaDocRuntimeSessionValidator } from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import fetch, { RequestInit } from "node-fetch";

export class IkaDocBackendSessionValidator implements IkaDocRuntimeSessionValidator {
  public constructor(
    private readonly _bearerToken: string | undefined,
    private readonly _timeoutMs: number,
  ) {}

  public async validate(session: IkaDocRuntimeSession, operation: string): Promise<void> {
    if (!this._bearerToken) {
      throw new Error("IkaDoc editor validation is not configured");
    }

    const options: RequestInit = {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${this._bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: session.sessionId,
        documentId: session.documentId,
        documentUrlId: session.documentUrlId,
        operation,
      }),
      timeout: this._timeoutMs,
    };

    const response = await fetch(session.config.validationUrl, options);
    if (response.ok) {
      return;
    }

    log.warn("IkaDoc editor validation request failed", {
      sessionId: session.sessionId,
      documentId: session.documentId,
      operation,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`IkaDoc editor session rejected ${operation}`);
  }
}
