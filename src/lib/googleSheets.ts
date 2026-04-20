// src/lib/googleSheets.ts
// Thin wrapper around the Google Sheets API for two-way-ish sync.
//
// Sync model:
// - DB remains the canonical store queried by the app.
// - Sheet is the editing surface for existing rows and new inserts.
// - pushTableToSheet: overwrites the sheet tab with current DB rows.
// - pullEditsFromSheet: reads the sheet tab and returns rows keyed by id so the
//   caller can apply upserts back to the DB. New rows added in the sheet can be
//   inserted into the DB when the caller opts into that behavior.
//
// Required env vars:
//   GOOGLE_SHEETS_CLIENT_EMAIL    - service account email
//   GOOGLE_SHEETS_PRIVATE_KEY     - service account private key (with \n escaped)
//   GOOGLE_SHEETS_SPREADSHEET_ID  - the target spreadsheet id

import type { sheets_v4 } from "googleapis";

let cachedClient: sheets_v4.Sheets | null = null;

type SheetRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  if (cachedClient) return cachedClient;

  const { google } = await import("googleapis");
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SHEETS_CLIENT_EMAIL or GOOGLE_SHEETS_PRIVATE_KEY env vars"
    );
  }
  // Vercel/.env strips real newlines — unescape \n.
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID env var");
  return id;
}

/** Stringify a cell value for the Sheets API. Arrays become "a, b, c". */
function cell(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/**
 * Overwrite a tab with the given rows. The first row is always the header.
 * Ensures the tab exists, creates it if missing.
 */
export async function pushTableToSheet(
  tabName: string,
  columns: string[],
  rows: Record<string, unknown>[]
): Promise<void> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  // Ensure the tab exists.
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets?.some((s) => s.properties?.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tabName } } }],
      },
    });
  }

  // Clear, then write header + rows.
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: tabName,
  });

  const values: string[][] = [columns];
  for (const row of rows) {
    values.push(columns.map((c) => cell(row[c])));
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

/**
 * Read a tab back as an array of `{ column: string }` records. The first row
 * must be the header. Empty trailing rows are skipped.
 */
export async function pullEditsFromSheet(
  tabName: string
): Promise<Record<string, string>[]> {
  const { rows } = await pullSheetRecords(tabName);
  return rows.map((row) => row.values);
}

export async function pullSheetRecords(tabName: string): Promise<{
  header: string[];
  rows: SheetRecord[];
}> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: tabName,
  });
  const rows = res.data.values || [];
  if (rows.length < 2) return { header: [], rows: [] };
  const header = rows[0] as string[];
  const out: SheetRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((v) => v == null || String(v).trim() === "")) continue;
    const rec: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      rec[header[j]] = (row[j] ?? "").toString();
    }
    out.push({ rowNumber: i + 1, values: rec });
  }
  return { header, rows: out };
}

function columnNumberToName(columnNumber: number): string {
  let current = columnNumber;
  let name = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

export async function writeSheetColumnValues(
  tabName: string,
  header: string[],
  columnName: string,
  updates: { rowNumber: number; value: string }[]
): Promise<void> {
  if (updates.length === 0) return;

  const columnIndex = header.indexOf(columnName);
  if (columnIndex === -1) {
    throw new Error(`Column '${columnName}' not found in tab '${tabName}'`);
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const columnLetter = columnNumberToName(columnIndex + 1);

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: updates.map(({ rowNumber, value }) => ({
        range: `${tabName}!${columnLetter}${rowNumber}`,
        values: [[value]],
      })),
    },
  });
}

/** Parse a "TRUE"/"FALSE"/"true"/"1" cell into a boolean. */
export function parseBool(v: string | undefined | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

/** Parse a "a, b, c" cell into a trimmed string array (empty values dropped). */
export function parseList(v: string | undefined | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
