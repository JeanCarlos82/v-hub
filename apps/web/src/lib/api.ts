export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    credentials: "include",
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/auth/")) window.dispatchEvent(new Event("vhub:unauthorized"));
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return data as T;
}

export type ResourceType = "application" | "database" | "service";

export interface Resource {
  uuid: string;
  name: string;
  type: ResourceType;
  subtype: string | null;
  status: string;
  fqdn: string | null;
  environmentId: number;
  description: string | null;
}

export interface Environment {
  id: number;
  uuid: string | null;
  name: string;
  resources: Resource[];
}

export interface Project {
  uuid: string;
  name: string;
  description: string | null;
  environments: Environment[];
}

export interface StepResult {
  resource: string;
  type: string;
  ok: boolean;
  error?: string;
}

export interface HostSample {
  ts: number;
  cpu: number;
  cores: number;
  mem: { total: number; used: number; pct: number };
  swap: { total: number; used: number };
  disk: { total: number; used: number; pct: number };
  net: { rx: number; tx: number };
  load: [number, number, number];
  uptime: number;
}

export interface MinuteSample {
  ts: number;
  cpu: number;
  mem: number;
  disk: number;
  rx: number;
  tx: number;
  load1: number;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  labels: Record<string, string>;
  ports: { private: number; public?: number; type: string }[];
  networks: string[];
  coolifyUuid: string | null;
}

export interface ContainerStat {
  id: string;
  cpu: number;
  memUsed: number;
  memLimit: number;
  memPct: number;
  rx: number;
  tx: number;
  pids: number;
}

export interface Connection {
  id: string;
  name: string;
  kind: "postgres" | "mysql" | "redis" | "mongodb" | null;
  engine: string;
  source: "coolify" | "manual";
  status?: string;
  hasUrl: boolean;
  resourceUuid?: string;
}

export interface SystemStatus {
  coolify: { configured: boolean; reachable: boolean; version?: string; error?: string; url: string | null; dbAccess: string };
  docker: { available: boolean; version?: string; containers?: number; running?: number; error?: string };
  host: HostSample | null;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  command?: string;
  durationMs: number;
}

export interface SetupStatus {
  needsSetup: boolean;
  coolifyFromEnv: boolean;
  defaultCoolifyUrl: string;
}

export interface SettingsView {
  adminUser: string;
  coolify: { url: string; tokenHint: string | null; dbAccess: "internal" | "external" };
  locked: { admin: boolean; coolifyUrl: boolean; coolifyToken: boolean; dbAccess: boolean };
}
