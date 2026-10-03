import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

/** Abre (o crea) la base de datos local de V-HUB y aplica el esquema. */
export function openDatabase(dataDir: string): DatabaseSync {
  const db = new DatabaseSync(join(dataDir, "vhub.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      url_enc TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metrics_minute (
      ts INTEGER PRIMARY KEY,
      cpu REAL, mem REAL, disk REAL, rx REAL, tx REAL, load1 REAL
    );
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT
    );
  `);
  return db;
}
