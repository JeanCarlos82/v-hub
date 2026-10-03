export type { ColumnInfo, Driver, QueryResult, RowsPage, TableInfo } from "../../domain/database.js";

/** Convierte valores no serializables (bigint, Buffer...) a algo que JSON entienda. */
export function sanitize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex").slice(0, 200)}`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

export const sanitizeRows = (rows: any[]) => rows.map((r) => sanitize(r) as Record<string, unknown>);
