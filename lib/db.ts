import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { normalizeReportData, type ReportData, type ReportRecord, type ReportVersion } from "./types";

const dataDir = path.resolve(process.env.DATA_DIR ?? "data");
fs.mkdirSync(dataDir, { recursive: true });

const globalDb = globalThis as unknown as { ahuDb?: DatabaseSync };
export const db = globalDb.ahuDb ?? new DatabaseSync(path.join(dataDir, "reports.sqlite"));
if (process.env.NODE_ENV !== "production") globalDb.ahuDb = db;

db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
try { db.exec("PRAGMA journal_mode=WAL;"); } catch { /* Another worker may be enabling WAL. */ }
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, report_number TEXT UNIQUE,
    data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS report_versions (
    report_id TEXT NOT NULL, version INTEGER NOT NULL, report_number TEXT NOT NULL,
    pdf_path TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(report_id, version), FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS daily_counters (
    report_date TEXT PRIMARY KEY, value INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS client_history (
    client_id TEXT NOT NULL, report_id TEXT NOT NULL, token TEXT NOT NULL,
    name TEXT, report_number TEXT, test_date TEXT, updated_at TEXT NOT NULL,
    PRIMARY KEY(client_id, report_id),
    FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
  );
`);
try { db.exec("ALTER TABLE report_versions ADD COLUMN type TEXT NOT NULL DEFAULT 'pdf'"); } catch { /* column already exists */ }

type ReportRow = { id: string; token_hash: string; report_number: string | null; data_json: string; created_at: string; updated_at: string };
export function getReportRow(id: string) {
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow | undefined;
}
export function publicReport(row: ReportRow): ReportRecord {
  return { id: row.id, reportNumber: row.report_number, data: normalizeReportData(JSON.parse(row.data_json)), createdAt: row.created_at, updatedAt: row.updated_at };
}
export function createReport(id: string, tokenHash: string, data: ReportData) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO reports(id, token_hash, data_json, created_at, updated_at) VALUES(?,?,?,?,?)")
    .run(id, tokenHash, JSON.stringify(data), now, now);
  return publicReport(getReportRow(id)!);
}
export function updateReport(id: string, data: ReportData) {
  data = normalizeReportData(data);
  db.prepare("UPDATE reports SET data_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(data), new Date().toISOString(), id);
  return publicReport(getReportRow(id)!);
}
export function deleteReport(id: string) { db.prepare("DELETE FROM reports WHERE id = ?").run(id); }

export function allocateReportNumber(id: string) {
  const existing = getReportRow(id)?.report_number;
  if (existing) return existing;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT value FROM daily_counters WHERE report_date = ?").get(date) as { value: number } | undefined;
    const next = (current?.value ?? 0) + 1;
    db.prepare("INSERT INTO daily_counters(report_date,value) VALUES(?,?) ON CONFLICT(report_date) DO UPDATE SET value=excluded.value").run(date, next);
    const number = `AHU-${date}-${String(next).padStart(4, "0")}`;
    db.prepare("UPDATE reports SET report_number = ?, updated_at = ? WHERE id = ? AND report_number IS NULL").run(number, new Date().toISOString(), id);
    db.exec("COMMIT");
    return getReportRow(id)!.report_number!;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function nextVersion(id: string) {
  const row = db.prepare("SELECT COALESCE(MAX(version),0)+1 AS version FROM report_versions WHERE report_id=?").get(id) as { version: number };
  return row.version;
}
export function addNextVersion(id: string, reportNumber: string, pdfPath: string, type: "pdf" | "word" = "pdf") {
  db.exec("BEGIN IMMEDIATE");
  try {
    const version = nextVersion(id);
    const result = addVersion(id, version, reportNumber, pdfPath, type);
    db.exec("COMMIT");
    return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function addVersion(id: string, version: number, reportNumber: string, pdfPath: string, type: "pdf" | "word" = "pdf") {
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO report_versions(report_id,version,report_number,pdf_path,created_at,type) VALUES(?,?,?,?,?,?)")
    .run(id, version, reportNumber, pdfPath, createdAt, type);
  const downloadUrl = type === "word" ? `/api/reports/${id}/versions/${version}/word` : `/api/reports/${id}/versions/${version}/pdf`;
  return { version, reportNumber, createdAt, downloadUrl, type } satisfies ReportVersion;
}
export function listVersions(id: string): ReportVersion[] {
  const rows = db.prepare("SELECT version,report_number,created_at,type FROM report_versions WHERE report_id=? ORDER BY version DESC").all(id) as { version:number; report_number:string; created_at:string; type:string }[];
  return rows.map((r) => {
    const type = (r.type ?? "pdf") as "pdf" | "word";
    const downloadUrl = type === "word" ? `/api/reports/${id}/versions/${r.version}/word` : `/api/reports/${id}/versions/${r.version}/pdf`;
    return { version:r.version, reportNumber:r.report_number, createdAt:r.created_at, downloadUrl, type };
  });
}
export function getVersion(id: string, version: number) {
  return db.prepare("SELECT * FROM report_versions WHERE report_id=? AND version=?").get(id, version) as { pdf_path:string; report_number:string } | undefined;
}
export function deleteVersion(id: string, version: number) {
  const row = getVersion(id, version);
  if (row?.pdf_path) { try { fs.unlinkSync(row.pdf_path); } catch {} }
  db.prepare("DELETE FROM report_versions WHERE report_id=? AND version=?").run(id, version);
}
export const storageRoot = path.join(dataDir, "storage");
fs.mkdirSync(storageRoot, { recursive: true });

export type ClientHistoryItem = { report_id: string; token: string; name: string | null; report_number: string | null; test_date: string | null; updated_at: string };
export function getClientHistory(clientId: string): ClientHistoryItem[] {
  return db.prepare("SELECT report_id,token,name,report_number,test_date,updated_at FROM client_history WHERE client_id=? ORDER BY updated_at DESC LIMIT 50").all(clientId) as ClientHistoryItem[];
}
export function upsertClientHistory(clientId: string, reportId: string, token: string, name: string, reportNumber: string | null, testDate: string | null, updatedAt: string) {
  db.prepare("INSERT INTO client_history(client_id,report_id,token,name,report_number,test_date,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(client_id,report_id) DO UPDATE SET token=excluded.token,name=excluded.name,report_number=excluded.report_number,test_date=excluded.test_date,updated_at=excluded.updated_at").run(clientId, reportId, token, name, reportNumber, testDate, updatedAt);
}
export function deleteClientHistory(clientId: string, reportId: string) {
  db.prepare("DELETE FROM client_history WHERE client_id=? AND report_id=?").run(clientId, reportId);
}
