import { IkaDocRuntimeSessionValidator, IkaDocValidatedAction } from "app/server/lib/IkaDocRuntimePolicy";
import { IkaDocRuntimeSession } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import log from "app/server/lib/log";

import fetch, { RequestInit } from "node-fetch";

const IKADOC_GRIST_SESSION_HEADER = "X-IkaDoc-Grist-Session";

export class IkaDocBackendSessionValidator implements IkaDocRuntimeSessionValidator {
  public constructor(
    private readonly _timeoutMs: number,
    private readonly _validationUrl?: string,
  ) {}

  public async validate(
    session: IkaDocRuntimeSession,
    operation: string,
    action?: IkaDocValidatedAction,
  ): Promise<void> {
    const validationToken = session.config.validationToken;
    if (!validationToken) {
      throw new Error("Spreadsheet editor validation is not configured.");
    }

    const options: RequestInit = {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${validationToken}`,
        "Content-Type": "application/json",
        [IKADOC_GRIST_SESSION_HEADER]: session.sessionId,
      },
      body: JSON.stringify({
        sessionId: session.sessionId,
        documentId: session.documentId,
        documentUrlId: session.documentUrlId,
        operation,
        action,
      }),
      timeout: this._timeoutMs,
    };

    const response = await fetch(
      this._validationUrl || session.config.validationUrl,
      options,
    );
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
    throw new Error(`Spreadsheet editor session rejected ${operation}`);
  }
}
