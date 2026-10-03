import type { DatabaseSync } from "node:sqlite";
import type { SettingsRepository } from "../../domain/ports.js";
import type { StoredSettings } from "../../domain/settings.js";
import type { Cipher } from "../crypto.js";

/** Claves cuyo valor se guarda cifrado */
const SECRET_KEYS = new Set<keyof StoredSettings>(["coolifyToken"]);

/** Ajustes clave/valor en la tabla `settings`. */
export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: DatabaseSync, private readonly cipher: Cipher) {}

  load(): StoredSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as { key: keyof StoredSettings; value: string }[];
    const out: Record<string, string> = {};
    for (const { key, value } of rows) {
      try {
        out[key] = SECRET_KEYS.has(key) ? this.cipher.decrypt(value) : value;
      } catch {
        console.warn(`[V-HUB] No se pudo descifrar el ajuste «${key}» (¿cambió APP_SECRET?). Se omite.`);
      }
    }
    return out as StoredSettings;
  }

  save(patch: Partial<StoredSettings>) {
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    const remove = this.db.prepare("DELETE FROM settings WHERE key = ?");
    for (const [key, value] of Object.entries(patch) as [keyof StoredSettings, string | undefined][]) {
      if (value === undefined || value === "") remove.run(key);
      else upsert.run(key, SECRET_KEYS.has(key) ? this.cipher.encrypt(value) : value);
    }
  }
}
