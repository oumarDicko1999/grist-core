import { UserAction } from "app/common/DocActions";
import { normalizeIkaDocCapabilities } from "app/ikadoc/IkaDocCapabilities";
import { ActiveDoc } from "app/server/lib/ActiveDoc";
import { DummyAuthorizer } from "app/server/lib/DocAuthorizer";
import { OptDocSession } from "app/server/lib/DocSession";
import { createIkaDocRuntimeAuthSession } from "app/server/lib/IkaDocRuntimeAuth";
import { IKADOC_RUNTIME_PARTICIPANT_COOKIE, IKADOC_RUNTIME_SESSION_COOKIE } from "app/server/lib/IkaDocRuntimeCookies";
import { IkaDocRuntimeSessionRegistry } from "app/server/lib/IkaDocRuntimeSessionRegistry";
import { createDocTools } from "test/server/docTools";
import * as testUtils from "test/server/testUtils";

import { IncomingMessage } from "http";

import { assert } from "chai";

/** SEC-2: IkaDoc's columns survive every path Grist offers, checked on the changes Grist computes. */
describe("IkaDoc locked column guard", function() {
  this.timeout(20000);
  testUtils.withoutSandboxing();
  testUtils.setTmpLogLevel("error");

  const docTools = createDocTools();
  let doc: ActiveDoc;

  beforeEach(async function() {
    doc = await docTools.createDoc("locked-columns.grist");
    await doc.applyUserActions(docTools.createFakeSession("owners"), [
      ["AddTable", "Factures", [
        { id: "Numero", type: "Text" },
        { id: "Montant", type: "Numeric" },
        { id: "Note", type: "Text" },
      ]],
      ["BulkAddRecord", "Factures", [null, null], { Numero: ["F-1", "F-2"], Montant: [100, 200] }],
    ]);
  });

  afterEach(async function() {
    await doc.shutdown();
  });

  async function personWithLockedColumns(): Promise<OptDocSession> {
    const registry = new IkaDocRuntimeSessionRegistry();
    const entry = registry.register({
      enabled: true,
      sessionId: "session-1",
      collectionCode: "records",
      user: { userId: "user-1", username: "alice", displayName: "Alice", email: "alice@example.test" },
      sourceType: "search-workspace",
      mode: "editor",
      expiresAt: "2099-01-01T00:00:00.000Z",
      documentId: doc.docName,
      documentUrlId: doc.docName,
      workerUrl: `/api/docs/${doc.docName}`,
      statusUrl: "/api/grist/sessions/session-1",
      validationUrl: "/api/grist/editor/session-validation",
      validationToken: "validation-token",
      discardUrl: "/api/grist/sessions/session-1/cancel",
      capabilities: normalizeIkaDocCapabilities({ canEditCells: true, canEditStructure: true }),
      locale: "en",
      appearance: "light",
      lockedColumns: { Factures: ["Numero", "Montant"] },
    });
    const cookie = `${IKADOC_RUNTIME_SESSION_COOKIE}=session-1; ${IKADOC_RUNTIME_PARTICIPANT_COOKIE}=${entry.participantHandle}`;
    const dbManager = { getAnonymousUserId: () => 0, getPreviewerUserId: () => 1 } as never;

    const authSession = await createIkaDocRuntimeAuthSession(
      dbManager,
      registry,
      { headers: { cookie } } as unknown as IncomingMessage,
      "ikadoc",
    );
    assert.isDefined(authSession, "the person is admitted");

    const request = { authSession, headers: {}, get: () => undefined };
    const docSession = new OptDocSession({ req: request as never });
    docSession.authorizer = new DummyAuthorizer("editors", doc.docName);

    return docSession;
  }

  function columnRowId(colId: string): number {
    const tableRef = doc.docData!.getMetaTable("_grist_Tables").findRow("tableId", "Factures");
    const columns = doc.docData!.getMetaTable("_grist_Tables_column").filterRecords({ parentId: tableRef });
    const column = columns.find(record => record.colId === colId);
    assert.isDefined(column, `column ${colId} exists`);

    return column!.id;
  }

  function columnIds(): string[] {
    const tableRef = doc.docData!.getMetaTable("_grist_Tables").findRow("tableId", "Factures");

    return doc.docData!.getMetaTable("_grist_Tables_column")
      .filterRecords({ parentId: tableRef })
      .map(record => record.colId)
      .filter(colId => colId !== "manualSort");
  }

  async function refused(docSession: OptDocSession, actions: UserAction[]): Promise<void> {
    let error: Error | undefined;
    try {
      await doc.applyUserActions(docSession, actions);
    } catch (caught) {
      error = caught as Error;
    }

    assert.match(String(error?.message), /does not allow change the IkaDoc column/);
  }

  it("refuses renaming a locked column through its metadata", async function() {
    const person = await personWithLockedColumns();

    await refused(person, [["UpdateRecord", "_grist_Tables_column", columnRowId("Montant"), { colId: "Total" }]]);

    assert.deepEqual(columnIds(), ["Numero", "Montant", "Note"]);
  });

  it("refuses changing a locked column's type or formula through its metadata", async function() {
    const person = await personWithLockedColumns();
    const montant = columnRowId("Montant");

    await refused(person, [["UpdateRecord", "_grist_Tables_column", montant, { type: "Text" }]]);
    await refused(person, [["UpdateRecord", "_grist_Tables_column", montant, { isFormula: true, formula: "1" }]]);

    const column = doc.docData!.getMetaTable("_grist_Tables_column").getRecord(montant)!;
    assert.equal(column.type, "Numeric");
    assert.isFalse(column.isFormula);
  });

  it("refuses removing a locked column through its metadata", async function() {
    const person = await personWithLockedColumns();

    await refused(person, [["RemoveRecord", "_grist_Tables_column", columnRowId("Numero")]]);

    assert.deepEqual(columnIds(), ["Numero", "Montant", "Note"]);
  });

  it("refuses removing or renaming the table that holds locked columns", async function() {
    const person = await personWithLockedColumns();
    const tableRef = doc.docData!.getMetaTable("_grist_Tables").findRow("tableId", "Factures");

    await refused(person, [["RemoveTable", "Factures"]]);
    await refused(person, [["UpdateRecord", "_grist_Tables", tableRef, { tableId: "Invoices" }]]);

    assert.equal(doc.docData!.getMetaTable("_grist_Tables").findRow("tableId", "Factures"), tableRef);
  });

  it("refuses copying another column's values into a locked column", async function() {
    const person = await personWithLockedColumns();

    await refused(person, [["CopyFromColumn", "Factures", "Note", "Montant", null]]);

    const rows = await doc.fetchTable(docTools.createFakeSession("owners"), "Factures");
    assert.deepEqual(rows.tableData[3].Montant, [100, 200]);
  });

  it("lets the person work on the other columns", async function() {
    const person = await personWithLockedColumns();

    await doc.applyUserActions(person, [
      ["UpdateRecord", "Factures", 1, { Note: "relancée" }],
      ["UpdateRecord", "_grist_Tables_column", columnRowId("Note"), { colId: "Commentaire" }],
    ]);

    assert.deepEqual(columnIds(), ["Numero", "Montant", "Commentaire"]);
  });

  it("does not hold requests without an admitted person (IkaDoc's service) to it", async function() {
    await doc.applyUserActions(docTools.createFakeSession("owners"), [["RemoveTable", "Factures"]]);

    assert.equal(doc.docData!.getMetaTable("_grist_Tables").findRow("tableId", "Factures"), 0);
  });
});
