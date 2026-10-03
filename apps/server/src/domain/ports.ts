/**
 * Puertos: contratos que necesitan los servicios y que implementa la capa infra.
 * Los servicios dependen de estas interfaces, nunca de las implementaciones (DIP).
 */
import type { ContainerAction, ContainerEvent, ContainerInfo, ContainerStat } from "./container.js";
import type { DbKind, Driver, ManualConnection } from "./database.js";
import type { CoolifyDbKind, Environment, ProjectTree, Resource, ResourceAction, ResourceType } from "./project.js";
import type { StoredSettings } from "./settings.js";
import type { HostSample, MinuteSample } from "./telemetry.js";

export type Unsubscribe = () => void;

// --- Coolify ---

export interface CoolifyGateway {
  isConfigured(): boolean;
  version(): Promise<string>;
  servers(): Promise<any[]>;

  tree(): Promise<ProjectTree[]>;
  /** Lanza un AppError 404 si no existe */
  project(uuid: string): Promise<ProjectTree>;
  allResources(): Promise<Resource[]>;
  createProject(name: string, description?: string): Promise<{ uuid: string }>;
  updateProject(uuid: string, body: { name?: string; description?: string }): Promise<unknown>;
  deleteProject(uuid: string): Promise<unknown>;

  createEnvironment(projectUuid: string, name: string): Promise<{ uuid: string }>;
  deleteEnvironment(projectUuid: string, env: string): Promise<unknown>;
  /** Asegura que el entorno tenga uuid (versiones antiguas de Coolify no lo devuelven en el listado). */
  environmentUuid(projectUuid: string, env: Environment): Promise<string>;

  resourceAction(type: ResourceType, uuid: string, action: ResourceAction): Promise<unknown>;
  deploy(uuid: string, force?: boolean): Promise<unknown>;
  deleteResource(type: ResourceType, uuid: string, deleteVolumes: boolean): Promise<unknown>;
  moveResource(type: ResourceType, uuid: string, environmentUuid: string): Promise<unknown>;
  logs(type: "application" | "database", uuid: string, lines?: number): Promise<{ logs: string }>;
  envs(type: ResourceType, uuid: string): Promise<any[]>;

  createDatabase(kind: CoolifyDbKind, body: Record<string, unknown>): Promise<{ uuid: string }>;
}

// --- Docker ---

export interface ContainerRuntime {
  available(): boolean;
  info(): Promise<{ version: string; containers: number; running: number }>;
  list(): Promise<ContainerInfo[]>;
  action(id: string, action: ContainerAction): Promise<void>;
  remove(id: string): Promise<void>;
  /** Stream de logs (stdout+stderr) en vivo */
  streamLogs(id: string, tail?: number): Promise<{ stream: NodeJS.ReadableStream; stop: () => void }>;
}

/** Estadísticas en vivo; sólo sondea mientras haya suscriptores. */
export interface ContainerStatsFeed {
  latest(): ContainerStat[];
  subscribe(fn: (stats: ContainerStat[]) => void): Unsubscribe;
}

export interface ContainerEventFeed {
  start(): void;
  subscribe(fn: (event: ContainerEvent) => void): Unsubscribe;
}

// --- Telemetría ---

export interface HostSampler {
  sample(): HostSample;
}

// --- Persistencia ---

export interface ConnectionRepository {
  list(): ManualConnection[];
  get(id: string): ManualConnection | undefined;
  create(name: string, kind: DbKind, url: string): ManualConnection;
  remove(id: string): void;
}

export interface MetricsRepository {
  insert(m: MinuteSample): void;
  range(sinceMs: number): MinuteSample[];
}

export interface AuditLog {
  log(action: string, target?: string, detail?: unknown): void;
  recent(limit?: number): unknown[];
}

export interface SettingsRepository {
  load(): StoredSettings;
  save(patch: Partial<StoredSettings>): void;
}

/** Comprueba unas credenciales de Coolify sin guardarlas; devuelve la versión o lanza un error. */
export type CoolifyProbe = (url: string, token: string) => Promise<string>;

// --- Bases de datos ---

export interface DriverFactory {
  create(kind: DbKind, url: string): Driver;
}
