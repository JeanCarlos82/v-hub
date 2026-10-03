import type { DatabaseSync } from "node:sqlite";
import type { AuditLog } from "../../domain/ports.js";

export class SqliteAuditLog implements AuditLog {
  constructor(private readonly db: DatabaseSync) {}

  log(action: string, target?: string, detail?: unknown) {
    this.db
      .prepare("INSERT INTO audit (ts, action, target, detail) VALUES (?, ?, ?, ?)")
      .run(Date.now(), action, target ?? null, detail === undefined ? null : JSON.stringify(detail));
  }

  recent(limit = 100) {
    return this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(limit);
  }
}
