import { DENIED_IKADOC_CAPABILITIES } from "app/ikadoc/IkaDocCapabilities";
import {
  applyOwarelinHostEvent,
  owarelinRuntimeEvent,
  parseOwarelinRuntimeEvent,
} from "app/ikadoc/OwarelinRuntimeEvents";

import { assert } from "chai";
import { JSDOM } from "jsdom";

const CONFIG = {
  enabled: true as const,
  sessionId: "session-1",
  collectionCode: "records",
  user: {
    userId: "user-1",
    username: "alice",
    displayName: "Alice",
    email: "alice@example.test",
  },
  sourceType: "document-file" as const,
  mode: "editor" as const,
  expiresAt: "2099-01-01T00:00:00.000Z",
  documentId: "doc-1",
  documentUrlId: "doc-url-1",
  workerUrl: "/ikadoc/sessions/session-1/worker",
  statusUrl: "https://records.owarelin.localhost/api/grist/sessions/session-1",
  validationUrl: "https://records.owarelin.localhost/api/grist/editor/session-validation",
  discardUrl: "https://records.owarelin.localhost/api/grist/sessions/session-1/cancel",
  capabilities: DENIED_IKADOC_CAPABILITIES,
  locale: "en",
  appearance: "light" as const,
};

describe("OwarelinRuntimeEvents", function() {
  it("builds versioned outbound runtime events without document data", function() {
    const event = owarelinRuntimeEvent(CONFIG, "owarelin:saveCompleted", {
      contentChanged: true,
      cleanupDisposition: "pending",
    });

    assert.equal(event.type, "owarelin:saveCompleted");
    assert.equal(event.version, 1);
    assert.equal(event.sessionId, "session-1");
    assert.equal(event.sourceType, "document-file");
    assert.equal(event.detail.contentChanged, true);
    assert.equal(event.detail.cleanupDisposition, "pending");
    assert.isString(event.emittedAt);
    assert.notProperty(event, "rows");
    assert.notProperty(event, "cells");
  });

  it("builds discard completion as a first-class outbound runtime event", function() {
    const event = owarelinRuntimeEvent(CONFIG, "owarelin:discardCompleted");

    assert.equal(event.type, "owarelin:discardCompleted");
    assert.equal(event.version, 1);
    assert.equal(event.sessionId, "session-1");
    assert.deepEqual(event.detail, {});
  });

  it("builds dirty and clean document lifecycle events", function() {
    const dirty = owarelinRuntimeEvent(CONFIG, "owarelin:documentDirty");
    const clean = owarelinRuntimeEvent(CONFIG, "owarelin:documentClean");

    assert.equal(dirty.type, "owarelin:documentDirty");
    assert.equal(clean.type, "owarelin:documentClean");
    assert.equal(dirty.version, 1);
    assert.equal(clean.version, 1);
  });

  it("accepts inbound host events only for the current session and known names", function() {
    const accepted = parseOwarelinRuntimeEvent({
      type: "owarelin:themeChanged",
      version: 1,
      sessionId: "session-1",
      sourceType: "document-file",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { theme: "nexus", appearance: "dark" },
    }, CONFIG);

    const wrongSession = parseOwarelinRuntimeEvent({
      type: "owarelin:themeChanged",
      version: 1,
      sessionId: "other-session",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { theme: "nexus" },
    }, CONFIG);

    const unknown = parseOwarelinRuntimeEvent({
      type: "owarelin:cellContentChanged",
      version: 1,
      sessionId: "session-1",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: {},
    }, CONFIG);

    assert.equal(accepted?.type, "owarelin:themeChanged");
    assert.deepEqual(accepted?.detail, { theme: "nexus", appearance: "dark" });
    assert.equal(wrongSession, undefined);
    assert.equal(unknown, undefined);
  });

  it("applies lifecycle host events to IkaDoc-owned runtime state attributes", function() {
    const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
    (global as any).document = jsdom.window.document;

    applyOwarelinHostEvent({
      type: "owarelin:sessionExpired",
      version: 1,
      sessionId: "session-1",
      sourceType: "document-file",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { safeMessage: "Session expired" },
    });

    assert.equal(document.documentElement.dataset.owarelinRuntimeState, "expired");
    assert.equal(document.documentElement.dataset.owarelinRuntimeStateEvent, "owarelin:sessionExpired");
    assert.equal(document.documentElement.dataset.owarelinRuntimeStateAt, "2026-07-11T00:00:00.000Z");
    assert.equal(document.documentElement.dataset.owarelinRuntimeStateMessage, "Session expired");
  });

  it("tracks save state host events without exposing document data", function() {
    const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
    (global as any).document = jsdom.window.document;

    applyOwarelinHostEvent({
      type: "owarelin:saveFailed",
      version: 1,
      sessionId: "session-1",
      sourceType: "document-file",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { safeMessage: "x".repeat(300), cells: [{ value: "private" }] },
    });

    assert.equal(document.documentElement.dataset.owarelinSaveState, "failed");
    assert.equal(document.documentElement.dataset.owarelinRuntimeState, "save-failed");
    assert.equal(document.documentElement.dataset.owarelinRuntimeStateMessage?.length, 240);
    assert.notInclude(JSON.stringify(document.documentElement.dataset), "private");
  });

  it("applies host theme and appearance changes to runtime attributes", function() {
    const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
    (global as any).document = jsdom.window.document;

    applyOwarelinHostEvent({
      type: "owarelin:themeChanged",
      version: 1,
      sessionId: "session-1",
      sourceType: "document-file",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { theme: "nexus", appearance: "dark" },
    });

    assert.equal(document.documentElement.dataset.tenantThemeStyle, "material");
    assert.equal(document.documentElement.dataset.ikadocVisualStyle, "material");
    assert.equal(document.documentElement.dataset.gristAppearance, "dark");
    assert.equal(document.documentElement.style.colorScheme, "dark");
  });

  it("preserves current appearance when a host theme event changes style only", function() {
    const jsdom = new JSDOM("<!doctype html><html><body></body></html>");
    (global as any).document = jsdom.window.document;
    document.documentElement.dataset.gristAppearance = "dark";
    document.documentElement.style.colorScheme = "dark";

    applyOwarelinHostEvent({
      type: "owarelin:themeChanged",
      version: 1,
      sessionId: "session-1",
      sourceType: "document-file",
      emittedAt: "2026-07-11T00:00:00.000Z",
      detail: { theme: "owarelin" },
    });

    assert.equal(document.documentElement.dataset.tenantThemeStyle, "owarelin");
    assert.equal(document.documentElement.dataset.ikadocVisualStyle, "owarelin");
    assert.equal(document.documentElement.dataset.gristAppearance, "dark");
    assert.equal(document.documentElement.style.colorScheme, "dark");
  });
});
