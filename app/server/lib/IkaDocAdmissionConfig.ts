import { IkaDocDeploymentPageConfig } from "app/common/gristUrls";
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

/**
 * GW-SEC-01: refuse browser requests that carry no IkaDoc session.
 * On in every IkaDoc deployment; `IKADOC_GRIST_RUNTIME_ONLY=false` is for the dev harness only.
 */
export function readIkaDocRuntimeOnly(): boolean {
  const ikadocConfigured = readIkaDocAdmissionConfig() !== undefined;
  if (!ikadocConfigured) {
    return false;
  }

  return appSettings
    .section("ikadoc")
    .section("runtime")
    .flag("runtimeOnly")
    .requireBool({
      envVar: "IKADOC_GRIST_RUNTIME_ONLY",
      defaultValue: true,
    });
}

/**
 * GW-THM-03 / GW-SHL-02: what pages served without an IkaDoc session need to look like IkaDoc.
 * Undefined outside IkaDoc deployments.
 */
export function readIkaDocDeploymentPageConfig(): IkaDocDeploymentPageConfig | undefined {
  if (readIkaDocAdmissionConfig() === undefined) {
    return undefined;
  }

  const theme = appSettings
    .section("ikadoc")
    .section("runtime")
    .flag("defaultTheme")
    .requireString({
      envVar: "IKADOC_GRIST_DEFAULT_THEME",
      defaultValue: "owarelin",
    });
  const returnUrl = appSettings
    .section("ikadoc")
    .section("runtime")
    .flag("appUrl")
    .readString({
      envVar: "IKADOC_APP_URL",
    });

  return { theme, returnUrl };
}
