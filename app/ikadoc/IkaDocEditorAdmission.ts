import { IkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import {
  IkaDocEditorMode,
  IkaDocRuntimeConfig,
  IkaDocSessionSourceType,
} from "app/ikadoc/IkaDocRuntimeConfig";

export type IkaDocEditorAdmissionProof =
  { kind: "backend-session" } |
  { kind: "signed-token"; token: string; keyId: string };

export interface IkaDocEditorAdmissionRequest {
  sessionId: string;
  proof: IkaDocEditorAdmissionProof;
  cookieHeader?: string;
  origin?: string;
  locale?: string;
  theme?: string;
  appearance?: string;
}

export interface IkaDocEditorAdmission {
  sessionId: string;
  actorId: string;
  tenantId: string;
  deploymentId: string;
  controlAuthority: string;
  sourceType: IkaDocSessionSourceType;
  mode: IkaDocEditorMode;
  expiresAt: string;
  capabilities: IkaDocCapabilities;
  runtimeConfig: IkaDocRuntimeConfig;
}

export type IkaDocEditorAdmissionDenialCode =
  "runtime-not-configured" |
  "session-not-found" |
  "session-expired" |
  "session-revoked" |
  "tenant-mismatch" |
  "actor-mismatch" |
  "module-disabled" |
  "permission-denied" |
  "backend-unavailable" |
  "malformed-response";

export type IkaDocEditorAdmissionResult =
  { kind: "accepted"; admission: IkaDocEditorAdmission } |
  { kind: "denied"; code: IkaDocEditorAdmissionDenialCode; safeMessage: string };

export interface IkaDocEditorAdmissionClient {
  admitEditor(request: IkaDocEditorAdmissionRequest): Promise<IkaDocEditorAdmissionResult>;
}
