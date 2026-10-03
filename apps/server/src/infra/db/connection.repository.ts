import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { DbKind, ManualConnection } from "../../domain/database.js";
import type { ConnectionRepository } from "../../domain/ports.js";
import type { Cipher } from "../crypto.js";

/** Conexiones manuales a BD externas, con la URL cifrada. */
export class SqliteConnectionRepository implements ConnectionRepository {
  constructor(private readonly db: DatabaseSync, private readonly cipher: Cipher) {}

  list(): ManualConnection[] {
    const rows = this.db.prepare("SELECT * FROM connections ORDER BY created_at DESC").all() as any[];
    return rows.flatMap((r) => {
      try {
        return [{ id: r.id, name: r.name, kind: r.kind, url: this.cipher.decrypt(r.url_enc), createdAt: r.created_at }];
      } catch {
        console.warn(`[V-HUB] No se pudo descifrar la conexión «${r.name}» (¿cambió APP_SECRET?). Se omite.`);
        return [];
      }
    });
  }

  get(id: string): ManualConnection | undefined {
    return this.list().find((c) => c.id === id);
  }

  create(name: string, kind: DbKind, url: string): ManualConnection {
    const c = { id: randomUUID(), name, kind, url, createdAt: Date.now() };
    this.db
      .prepare("INSERT INTO connections (id, name, kind, url_enc, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(c.id, name, kind, this.cipher.encrypt(url), c.createdAt);
    return c;
  }

  remove(id: string) {
    this.db.prepare("DELETE FROM connections WHERE id = ?").run(id);
  }
}
