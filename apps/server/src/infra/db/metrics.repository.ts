import type { DatabaseSync } from "node:sqlite";
import type { MetricsRepository } from "../../domain/ports.js";
import type { MinuteSample } from "../../domain/telemetry.js";

const RETENTION_MS = 7 * 24 * 3600_000;

export class SqliteMetricsRepository implements MetricsRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(m: MinuteSample) {
    this.db
      .prepare("INSERT OR REPLACE INTO metrics_minute (ts, cpu, mem, disk, rx, tx, load1) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(m.ts, m.cpu, m.mem, m.disk, m.rx, m.tx, m.load1);
    // Conservamos 7 días
    this.db.prepare("DELETE FROM metrics_minute WHERE ts < ?").run(Date.now() - RETENTION_MS);
  }

  range(sinceMs: number) {
    return this.db.prepare("SELECT * FROM metrics_minute WHERE ts >= ? ORDER BY ts ASC").all(sinceMs) as unknown as MinuteSample[];
  }
}
