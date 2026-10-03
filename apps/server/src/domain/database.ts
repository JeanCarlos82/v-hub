export type DbKind = "postgres" | "mysql" | "redis" | "mongodb";

export interface TableInfo {
  name: string;
  type?: string;
  rows?: number | null;
  size?: number | null;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  default?: string | null;
  primaryKey?: boolean;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command?: string;
  durationMs: number;
}

export interface RowsPage {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number | null;
}

export interface Driver {
  kind: DbKind;
  info(): Promise<{ version: string; size?: number | null; extra?: Record<string, unknown> }>;
  /** Postgres: esquemas · MySQL: bases de datos · Redis: db0..dbN · Mongo: bases de datos */
  namespaces(): Promise<string[]>;
  /** Para Redis devuelve una pseudo-tabla "keys" */
  tables(ns: string): Promise<TableInfo[]>;
  structure(ns: string, table: string): Promise<ColumnInfo[]>;
  rows(ns: string, table: string, opts: { limit: number; offset: number; search?: string }): Promise<RowsPage>;
  query(text: string, ns?: string): Promise<QueryResult>;
  close(): Promise<void>;
}

export interface ManualConnection {
  id: string;
  name: string;
  kind: DbKind;
  url: string;
  createdAt: number;
}

export interface ConnectionSummary {
  id: string; // "coolify:<uuid>" | "manual:<id>"
  name: string;
  kind: DbKind | null; // null = motor no soportado por el explorador (p. ej. clickhouse)
  engine: string;
  source: "coolify" | "manual";
  status?: string;
  hasUrl: boolean;
  resourceUuid?: string;
}
