import pg from "pg";
import type { Driver, QueryResult } from "./types.js";
import { sanitizeRows } from "./types.js";

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

export function postgresDriver(url: string): Driver {
  const pool = new pg.Pool({ connectionString: url, max: 4, idleTimeoutMillis: 60_000, connectionTimeoutMillis: 8000 });
  pool.on("error", () => {});

  return {
    kind: "postgres",
    async info() {
      const r = await pool.query(
        "SELECT version() AS version, pg_database_size(current_database()) AS size, current_database() AS db, " +
          "(SELECT count(*) FROM pg_stat_activity) AS connections",
      );
      const row = r.rows[0];
      return {
        version: String(row.version).split(" on ")[0],
        size: Number(row.size),
        extra: { database: row.db, connections: Number(row.connections) },
      };
    },
    async namespaces() {
      const r = await pool.query(
        "SELECT schema_name FROM information_schema.schemata " +
          "WHERE schema_name NOT LIKE 'pg\\_%' AND schema_name <> 'information_schema' ORDER BY schema_name",
      );
      return r.rows.map((x) => x.schema_name);
    },
    async tables(ns) {
      const r = await pool.query(
        `SELECT c.relname AS name,
                CASE c.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view'
                               WHEN 'p' THEN 'partitioned table' WHEN 'f' THEN 'foreign table' END AS type,
                CASE WHEN c.reltuples < 0 THEN NULL ELSE c.reltuples::bigint END AS rows,
                pg_total_relation_size(c.oid) AS size
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relkind IN ('r','v','m','p','f')
          ORDER BY c.relname`,
        [ns],
      );
      return r.rows.map((x) => ({ name: x.name, type: x.type, rows: x.rows === null ? null : Number(x.rows), size: Number(x.size) }));
    },
    async structure(ns, table) {
      const r = await pool.query(
        `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable,
                pg_get_expr(d.adbin, d.adrelid) AS "default",
                EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary AND a.attnum = ANY(i.indkey)) AS pk
           FROM pg_attribute a
           JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
           LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
          ORDER BY a.attnum`,
        [ns, table],
      );
      return r.rows.map((x) => ({ name: x.name, type: x.type, nullable: x.nullable, default: x.default, primaryKey: x.pk }));
    },
    async rows(ns, table, { limit, offset }) {
      const target = `${q(ns)}.${q(table)}`;
      const client = await pool.connect();
      try {
        const data = await client.query(`SELECT * FROM ${target} LIMIT $1 OFFSET $2`, [limit, offset]);
        let total: number | null = null;
        try {
          await client.query("SET statement_timeout = 3000");
          total = Number((await client.query(`SELECT count(*) AS n FROM ${target}`)).rows[0].n);
        } catch {
          total = null; // tabla enorme: no bloqueamos la UI
        } finally {
          await client.query("RESET statement_timeout").catch(() => {});
        }
        return { columns: data.fields.map((f) => f.name), rows: sanitizeRows(data.rows), total };
      } finally {
        client.release();
      }
    },
    async query(text, ns) {
      const client = await pool.connect();
      const started = performance.now();
      try {
        if (ns) await client.query(`SET search_path TO ${q(ns)}, public`);
        const res: any = await client.query(text);
        const last = Array.isArray(res) ? res[res.length - 1] : res;
        const out: QueryResult = {
          columns: (last.fields ?? []).map((f: any) => f.name),
          rows: sanitizeRows(last.rows ?? []),
          rowCount: last.rowCount ?? last.rows?.length ?? 0,
          command: last.command,
          durationMs: performance.now() - started,
        };
        return out;
      } finally {
        await client.query("RESET search_path").catch(() => {});
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
