// Creates the demo document the harness fixtures open: an invoice table shaped like an IkaDoc
// search workspace, owned by Grist's default development user. Development only.

const INVOICE_COUNT = 60;
const RANDOM_SEED = 7;
const LOGIN_REDIRECT_LIMIT = 5;

const CLIENTS = [
  "Ministère de la Santé",
  "Mairie de Bamako",
  "ONG Sahel Eau",
  "Banque Atlantique",
  "Orange Mali",
  "Université de Ségou",
];

const DOCUMENT_LOCALE = "fr-FR";

const STATUSES = ["Brouillon", "Envoyée", "Payée", "Payée", "Payée", "En retard"];

/** IkaDoc sizes columns to their content; Grist's default width (~75px) truncates everything. */
const COLUMN_WIDTHS = {
  ikadoc_record_id: 300,
  ikadoc_schema_type: 130,
  numero: 150,
  client: 210,
  statut: 130,
  montant: 140,
  date_emission: 140,
  note: 200,
};

export async function createDemoDocument(gristOrigin) {
  const apiKey = await defaultUserApiKey(gristOrigin);
  const api = (path, init = {}) => gristApi(gristOrigin, apiKey, path, init);

  const [org] = await api("/api/orgs");
  const [workspace] = await api(`/api/orgs/${org.id}/workspaces`);

  const documentId = await api(`/api/workspaces/${workspace.id}/docs`, {
    method: "POST",
    body: { name: "IkaDoc harness — Factures 2026" },
  });

  await api(`/api/docs/${documentId}/tables`, {
    method: "POST",
    body: { tables: [invoiceTable()] },
  });

  await api(`/api/docs/${documentId}/tables/Factures/records`, {
    method: "POST",
    body: { records: invoiceRecords() },
  });

  await api(`/api/docs/${documentId}/apply`, {
    method: "POST",
    body: [["RemoveTable", "Table1"]],
  });

  await applyColumnWidths(api, documentId);
  await applyFrenchLocale(api, documentId);

  return documentId;
}

export async function documentExists(gristOrigin, documentId) {
  const apiKey = await defaultUserApiKey(gristOrigin);

  const response = await fetch(`${gristOrigin}/api/docs/${documentId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return response.ok;
}

/** Signs in as the default development user (minimal login) and returns their API key. */
async function defaultUserApiKey(gristOrigin) {
  const cookies = await loginCookies(gristOrigin);
  const headers = { ...cookieHeader(cookies), "X-Requested-With": "XMLHttpRequest" };

  const existing = await fetch(`${gristOrigin}/api/profile/apiKey`, { headers });
  const existingKey = existing.ok ? (await existing.text()).replaceAll("\"", "") : "";
  if (existingKey) {
    return existingKey;
  }

  const created = await fetch(`${gristOrigin}/api/profile/apiKey`, { method: "POST", headers });
  if (!created.ok) {
    throw new Error(`Could not create an API key for the default user (HTTP ${created.status})`);
  }

  return (await created.text()).replaceAll("\"", "");
}

/** Follows the `/login` redirects by hand, keeping the session cookies they set. */
async function loginCookies(gristOrigin) {
  const cookies = new Map();
  let url = `${gristOrigin}/login`;

  for (let hop = 0; hop < LOGIN_REDIRECT_LIMIT && url; hop++) {
    const response = await fetch(url, { redirect: "manual", headers: cookieHeader(cookies) });

    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");

      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }

    const location = response.headers.get("location");
    url = location ? new URL(location, gristOrigin).toString() : undefined;
  }

  return cookies;
}

function cookieHeader(cookies) {
  if (cookies.size === 0) {
    return {};
  }

  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");

  return { Cookie: cookie };
}

async function gristApi(gristOrigin, apiKey, path, { method = "GET", body } = {}) {
  const response = await fetch(`${gristOrigin}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);

    throw new Error(`Grist ${method} ${path} failed (HTTP ${response.status}): ${detail}`);
  }

  return response.json();
}

/**
 * Column widths live on the view's fields, so they are set after the table exists.
 * Only grid sections: Grist refuses changes to record card fields.
 */
async function applyColumnWidths(api, documentId) {
  const table = name => api(`/api/docs/${documentId}/tables/${name}/records`);

  const { records: columns } = await table("_grist_Tables_column");
  const { records: sections } = await table("_grist_Views_section");
  const { records: fields } = await table("_grist_Views_section_field");

  const columnIds = new Map(columns.map(column => [column.id, column.fields.colId]));
  const gridSectionIds = new Set(
    sections.filter(section => section.fields.parentKey === "record").map(section => section.id),
  );

  const sizedFields = fields
    .filter(field => gridSectionIds.has(field.fields.parentId))
    .map(field => ({ id: field.id, width: COLUMN_WIDTHS[columnIds.get(field.fields.colRef)] }))
    .filter(field => field.width !== undefined);

  await api(`/api/docs/${documentId}/apply`, {
    method: "POST",
    body: [[
      "BulkUpdateRecord",
      "_grist_Views_section_field",
      sizedFields.map(field => field.id),
      { width: sizedFields.map(field => field.width) },
    ]],
  });
}

/** IkaDoc tenants are French: dates read "12 avr. 2026" and amounts "5 732 000". */
async function applyFrenchLocale(api, documentId) {
  const { records: [docInfo] } = await api(`/api/docs/${documentId}/tables/_grist_DocInfo/records`);

  const settings = JSON.parse(docInfo.fields.documentSettings || "{}");
  settings.locale = DOCUMENT_LOCALE;

  await api(`/api/docs/${documentId}/apply`, {
    method: "POST",
    body: [["UpdateRecord", "_grist_DocInfo", docInfo.id, { documentSettings: JSON.stringify(settings) }]],
  });
}

function invoiceTable() {
  return {
    id: "Factures",
    columns: [
      column("ikadoc_record_id", "ID", "Text"),
      column("ikadoc_schema_type", "Schema type", "Text"),
      column("numero", "Numéro", "Text"),
      column("client", "Client", "Text"),
      column("statut", "Statut", "Choice", {
        choices: ["Brouillon", "Envoyée", "Payée", "En retard"],
      }),
      column("montant", "Montant", "Numeric", { numMode: "decimal", decimals: 0 }),
      column("date_emission", "Émise le", "Date", { dateFormat: "D MMM YYYY" }),

      // The user's own column: not IkaDoc data, so editable (not in the fixtures' lockedColumns).
      column("note", "Note", "Text"),
    ],
  };
}

function column(id, label, type, widgetOptions) {
  const fields = { label, type };

  if (widgetOptions) {
    fields.widgetOptions = JSON.stringify(widgetOptions);
  }

  return { id, fields };
}

/** The same invoices on every run: a small deterministic generator instead of Math.random. */
function invoiceRecords() {
  let state = RANDOM_SEED;

  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const pick = list => list[Math.floor(next() * list.length)];

  const firstDay = Date.UTC(2026, 0, 5);
  const dayMs = 24 * 60 * 60 * 1000;

  return Array.from({ length: INVOICE_COUNT }, (_, index) => {
    const recordNumber = String(index + 1).padStart(4, "0");
    const amount = Math.round((150_000 + next() * 9_350_000) / 1000) * 1000;
    const issuedOn = firstDay + Math.floor(next() * 290) * dayMs;

    return {
      fields: {
        ikadoc_record_id: `00000000-0000-4000-8000-00000000${recordNumber}`,
        ikadoc_schema_type: "invoice",
        numero: `FAC-2026-${recordNumber}`,
        client: pick(CLIENTS),
        statut: pick(STATUSES),
        montant: amount,
        date_emission: issuedOn / 1000,
      },
    };
  });
}
