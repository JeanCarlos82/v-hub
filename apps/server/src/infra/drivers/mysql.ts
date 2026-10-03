import mysql from "mysql2/promise";
import type { Driver } from "./types.js";
import { sanitizeRows } from "./types.js";

const q = (id: string) => `\`${id.replace(/`/g, "``")}\``;
const SYSTEM = new Set(["information_schema", "performance_schema", "mysql", "sys"]);

export function mysqlDriver(url: string): Driver {
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: 4,
    multipleStatements: true,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 8000,
  });

  return {
    kind: "mysql",
    async info() {
      const [rows]: any = await pool.query(
        "SELECT VERSION() AS version, DATABASE() AS db, " +
          "(SELECT SUM(data_length + index_length) FROM information_schema.TABLES) AS size",
      );
      const [threads]: any = await pool.query("SHOW STATUS LIKE 'Threads_connected'");
      return {
        version: rows[0].version,
        size: Number(rows[0].size ?? 0),
        extra: { database: rows[0].db, connections: Number(threads[0]?.Value ?? 0) },
      };
    },
    async namespaces() {
      const [rows]: any = await pool.query("SHOW DATABASES");
      return rows.map((r: any) => r.Database).filter((d: string) => !SYSTEM.has(d));
    },
    async tables(ns) {
      const [rows]: any = await pool.query(
        "SELECT TABLE_NAME AS name, LOWER(TABLE_TYPE) AS type, TABLE_ROWS AS `rows`, (DATA_LENGTH + INDEX_LENGTH) AS size " +
          "FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
        [ns],
      );
      return rows.map((r: any) => ({
        name: r.name,
        type: r.type === "base table" ? "table" : r.type,
        rows: r.rows === null ? null : Number(r.rows),
        size: r.size === null ? null : Number(r.size),
      }));
    },
    async structure(ns, table) {
      const [rows]: any = await pool.query(
        "SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE = 'YES' AS nullable, COLUMN_DEFAULT AS `default`, " +
          "COLUMN_KEY = 'PRI' AS pk FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
        [ns, table],
      );
      return rows.map((r: any) => ({
        name: r.name,
        type: r.type,
        nullable: Boolean(r.nullable),
        default: r.default,
        primaryKey: Boolean(r.pk),
      }));
    },
    async rows(ns, table, { limit, offset }) {
      const target = `${q(ns)}.${q(table)}`;
      const [rows, fields]: any = await pool.query(`SELECT * FROM ${target} LIMIT ? OFFSET ?`, [limit, offset]);
      let total: number | null = null;
      try {
        const [c]: any = await pool.query({ sql: `SELECT COUNT(*) AS n FROM ${target}`, timeout: 3000 });
        total = Number(c[0].n);
      } catch {}
      return { columns: (fields ?? []).map((f: any) => f.name), rows: sanitizeRows(rows), total };
    },
    async query(text, ns) {
      const conn = await pool.getConnection();
      const started = performance.now();
      try {
        if (ns) await conn.query(`USE ${q(ns)}`);
        const [result, fields]: any = await conn.query(text);
        // Con varias sentencias mysql2 devuelve un array de resultados: nos quedamos con el último
        const multi = Array.isArray(fields) && Array.isArray(fields[0]);
        const last = multi ? result[result.length - 1] : result;
        const lastFields = multi ? fields[fields.length - 1] : fields;
        if (Array.isArray(last)) {
          return {
            columns: (lastFields ?? []).map((f: any) => f.name),
            rows: sanitizeRows(last),
            rowCount: last.length,
            command: "SELECT",
            durationMs: performance.now() - started,
          };
        }
        return {
          columns: [],
          rows: [],
          rowCount: last?.affectedRows ?? 0,
          command: last?.info || "OK",
          durationMs: performance.now() - started,
        };
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
}
