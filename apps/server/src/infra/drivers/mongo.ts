import { MongoClient, BSON } from "mongodb";
import type { Driver } from "./types.js";

const toJson = (doc: unknown) => BSON.EJSON.serialize(doc as any, { relaxed: true }) as Record<string, unknown>;

/**
 * Consulta en JSON (Extended JSON), por ejemplo:
 *   { "collection": "users", "find": { "age": { "$gt": 18 } }, "limit": 50 }
 *   { "collection": "orders", "aggregate": [ { "$group": { "_id": "$status", "n": { "$sum": 1 } } } ] }
 *   { "collection": "users", "count": {} }
 *   { "command": { "dbStats": 1 } }
 */
export function mongoDriver(url: string): Driver {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8000, maxPoolSize: 4 });
  const ready = client.connect();
  const defaultDb = () => client.db().databaseName;

  return {
    kind: "mongodb",
    async info() {
      await ready;
      const build = await client.db("admin").command({ buildInfo: 1 });
      let connections: number | undefined;
      try {
        connections = (await client.db("admin").command({ serverStatus: 1 })).connections?.current;
      } catch {}
      const stats = await client.db(defaultDb()).stats().catch(() => null);
      return { version: `MongoDB ${build.version}`, size: stats?.storageSize ?? null, extra: { connections } };
    },
    async namespaces() {
      await ready;
      try {
        const r = await client.db().admin().listDatabases({ nameOnly: true });
        return r.databases.map((d) => d.name).filter((n) => !["admin", "config", "local"].includes(n) || n === defaultDb());
      } catch {
        return [defaultDb()]; // el usuario no tiene permiso para listar bases de datos
      }
    },
    async tables(ns) {
      await ready;
      const db = client.db(ns);
      const cols = await db.listCollections({}, { nameOnly: false }).toArray();
      return Promise.all(
        cols.map(async (c) => ({
          name: c.name,
          type: c.type ?? "collection",
          rows: c.type === "view" ? null : await db.collection(c.name).estimatedDocumentCount().catch(() => null),
        })),
      );
    },
    async structure(ns, table) {
      await ready;
      const sample = await client.db(ns).collection(table).find().limit(50).toArray();
      const fields = new Map<string, Set<string>>();
      for (const d of sample)
        for (const [k, v] of Object.entries(d)) {
          const t = v === null ? "null" : Array.isArray(v) ? "array" : (v as any)?._bsontype ?? typeof v;
          (fields.get(k) ?? fields.set(k, new Set()).get(k)!).add(String(t));
        }
      return [...fields].map(([name, types]) => ({ name, type: [...types].join(" | "), primaryKey: name === "_id" }));
    },
    async rows(ns, table, { limit, offset, search }) {
      await ready;
      const col = client.db(ns).collection(table);
      let filter = {};
      if (search) {
        try {
          filter = BSON.EJSON.parse(search) as object;
        } catch {
          throw new Error("El filtro debe ser JSON válido, por ejemplo {\"status\": \"active\"}");
        }
      }
      const docs = await col.find(filter).skip(offset).limit(limit).toArray();
      const rows = docs.map(toJson);
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      const total = search ? await col.countDocuments(filter) : await col.estimatedDocumentCount();
      return { columns, rows, total };
    },
    async query(text, ns) {
      await ready;
      const started = performance.now();
      let spec: any;
      try {
        spec = BSON.EJSON.parse(text);
      } catch {
        throw new Error('La consulta debe ser JSON, por ejemplo {"collection": "users", "find": {}}');
      }
      const db = client.db(ns ?? defaultDb());
      let docs: any[];
      let command: string;
      if (spec.command) {
        docs = [await db.command(spec.command)];
        command = Object.keys(spec.command)[0];
      } else {
        if (!spec.collection) throw new Error('Falta "collection"');
        const col = db.collection(spec.collection);
        if (spec.aggregate) {
          docs = await col.aggregate(spec.aggregate).limit(spec.limit ?? 500).toArray();
          command = "aggregate";
        } else if (spec.count) {
          docs = [{ count: await col.countDocuments(spec.count) }];
          command = "count";
        } else if (spec.insertOne) {
          docs = [await col.insertOne(spec.insertOne)];
          command = "insertOne";
        } else if (spec.updateMany) {
          docs = [await col.updateMany(spec.updateMany.filter ?? {}, spec.updateMany.update)];
          command = "updateMany";
        } else if (spec.deleteMany) {
          docs = [await col.deleteMany(spec.deleteMany)];
          command = "deleteMany";
        } else {
          docs = await col
            .find(spec.find ?? {})
            .sort(spec.sort ?? {})
            .limit(spec.limit ?? 100)
            .toArray();
          command = "find";
        }
      }
      const rows = docs.map(toJson);
      return {
        columns: [...new Set(rows.flatMap((r) => Object.keys(r)))],
        rows,
        rowCount: rows.length,
        command,
        durationMs: performance.now() - started,
      };
    },
    close: () => client.close(),
  };
}
