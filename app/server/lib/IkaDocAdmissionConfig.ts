import { appSettings } from "app/server/lib/AppSettings";

export interface IkaDocAdmissionConfig {
  admissionUrl: string;
  validationUrl?: string;
  bearerToken?: string;
  timeoutMs: number;
  forwardAuthSecret?: string;
}

const DEFAULT_IKADOC_ADMISSION_TIMEOUT_MS = 5000;

export function readIkaDocAdmissionConfig(): IkaDocAdmissionConfig | undefined {
  const admissionUrl = appSettings
    .section("ikadoc")
    .section("editor")
    .flag("admissionUrl")
    .readString({
      envVar: "IKADOC_EDITOR_ADMISSION_URL",
    });
  if (!admissionUrl) {
    return undefined;
  }

  const validationUrl = appSettings
    .section("ikadoc")
    .section("editor")
    .flag("validationUrl")
    .readString({
      envVar: "IKADOC_EDITOR_VALIDATION_URL",
    });
  const bearerToken = appSettings
    .section("ikadoc")
    .section("editor")
    .flag("admissionBearerToken")
    .readString({
      envVar: "IKADOC_EDITOR_ADMISSION_BEARER_TOKEN",
    });
  const timeoutMs = appSettings
    .section("ikadoc")
    .section("editor")
    .flag("admissionTimeoutMs")
    .requireInt({
      envVar: "IKADOC_EDITOR_ADMISSION_TIMEOUT_MS",
      defaultValue: DEFAULT_IKADOC_ADMISSION_TIMEOUT_MS,
      minValue: 1,
    });
  const forwardAuthSecret = appSettings
    .section("ikadoc")
    .section("editor")
    .flag("forwardAuthSecret")
    .readString({
      envVar: "IKADOC_GRIST_FORWARD_AUTH_SECRET",
    });

  return {
    admissionUrl,
    validationUrl,
    bearerToken,
    timeoutMs,
    forwardAuthSecret,
  };
}
