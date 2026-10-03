import { Redis } from "ioredis";
import type { Driver } from "./types.js";
import { sanitize } from "./types.js";

/** Separa un comando estilo redis-cli respetando comillas: SET "mi clave" 'valor con espacios' */
function parseCommand(text: string): string[] {
  const args: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) args.push((m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, "$1"));
  return args;
}

export function redisDriver(url: string): Driver {
  const clients = new Map<number, Redis>();
  const client = (db = 0) => {
    let c = clients.get(db);
    if (!c) {
      c = new Redis(url, { db, lazyConnect: false, maxRetriesPerRequest: 1, connectTimeout: 8000 });
      c.on("error", () => {});
      clients.set(db, c);
    }
    return c;
  };
  const dbIndex = (ns?: string) => Number(String(ns ?? "db0").replace(/^db/, "")) || 0;

  async function preview(c: Redis, key: string) {
    const type = await c.type(key);
    const ttl = await c.ttl(key);
    let value: unknown;
    switch (type) {
      case "string":
        value = await c.getrange(key, 0, 500);
        break;
      case "hash":
        value = await c.hlen(key).then((n) => `${n} campos`);
        break;
      case "list":
        value = await c.llen(key).then((n) => `${n} elementos`);
        break;
      case "set":
        value = await c.scard(key).then((n) => `${n} miembros`);
        break;
      case "zset":
        value = await c.zcard(key).then((n) => `${n} miembros`);
        break;
      default:
        value = `(${type})`;
    }
    return { key, type, ttl, value };
  }

  return {
    kind: "redis",
    async info() {
      const raw = await client().info();
      const get = (k: string) => raw.match(new RegExp(`^${k}:(.*)$`, "m"))?.[1]?.trim();
      return {
        version: `Redis ${get("redis_version") ?? "?"}`,
        size: Number(get("used_memory") ?? 0),
        extra: {
          connections: Number(get("connected_clients") ?? 0),
          memoryHuman: get("used_memory_human"),
          uptimeDays: get("uptime_in_days"),
          opsPerSec: get("instantaneous_ops_per_sec"),
        },
      };
    },
    async namespaces() {
      const raw = await client().info("keyspace");
      const dbs = [...raw.matchAll(/^db(\d+):/gm)].map((m) => Number(m[1]));
      if (!dbs.includes(0)) dbs.unshift(0);
      return dbs.sort((a, b) => a - b).map((d) => `db${d}`);
    },
    async tables(ns) {
      const n = await client(dbIndex(ns)).dbsize();
      return [{ name: "keys", type: "keyspace", rows: n }];
    },
    async structure() {
      return [
        { name: "key", type: "string" },
        { name: "type", type: "string" },
        { name: "ttl", type: "integer" },
        { name: "value", type: "preview" },
      ];
    },
    async rows(ns, _table, { limit, offset, search }) {
      const c = client(dbIndex(ns));
      const wanted = offset + limit;
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await c.scan(cursor, "MATCH", search ? `*${search}*` : "*", "COUNT", 500);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0" && keys.length < wanted && keys.length < 50_000);
      const page = keys.sort().slice(offset, wanted);
      const rows = await Promise.all(page.map((k) => preview(c, k)));
      return { columns: ["key", "type", "ttl", "value"], rows, total: search ? null : await c.dbsize() };
    },
    async query(text, ns) {
      const args = parseCommand(text.trim());
      if (!args.length) throw new Error("Comando vacío");
      const started = performance.now();
      const result = await client(dbIndex(ns)).call(args[0], ...args.slice(1));
      const value = sanitize(result instanceof Buffer ? result.toString() : result);
      const rows = Array.isArray(value)
        ? value.map((v, i) => ({ "#": i + 1, value: v }))
        : [{ "#": 1, value }];
      return {
        columns: ["#", "value"],
        rows,
        rowCount: rows.length,
        command: args[0].toUpperCase(),
        durationMs: performance.now() - started,
      };
    },
    async close() {
      await Promise.all([...clients.values()].map((c) => c.quit().catch(() => c.disconnect())));
      clients.clear();
    },
  };
}
