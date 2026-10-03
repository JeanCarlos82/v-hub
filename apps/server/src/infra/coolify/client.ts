import { AppError } from "../../domain/errors.js";
import type { CoolifyGateway } from "../../domain/ports.js";
import type {
  CoolifyDbKind,
  Environment,
  ProjectTree,
  Resource,
  ResourceAction,
  ResourceType,
} from "../../domain/project.js";

/** Error devuelto por Coolify. Un fallo 5xx de Coolify se expone como 502 (bad gateway). */
export class CoolifyError extends AppError {
  constructor(public upstreamStatus: number, message: string, public body?: unknown) {
    super(upstreamStatus >= 500 ? 502 : upstreamStatus, message);
  }
}

function normalizeDbType(t: string | undefined | null): string | null {
  if (!t) return null;
  return t.replace(/^standalone-/, "");
}

function toResource(type: ResourceType, r: any): Resource {
  return {
    uuid: r.uuid,
    name: r.name,
    type,
    subtype:
      type === "application" ? r.build_pack ?? null : type === "database" ? normalizeDbType(r.database_type) : r.service_type ?? null,
    status: r.status ?? "unknown",
    fqdn: r.fqdn ?? null,
    environmentId: Number(r.environment_id),
    description: r.description ?? null,
    internalUrl: r.internal_db_url ?? null,
    externalUrl: r.external_db_url ?? null,
    isPublic: r.is_public ?? undefined,
  };
}

const resourcePath: Record<ResourceType, string> = {
  application: "applications",
  database: "databases",
  service: "services",
};

/** Cliente de la API de Coolify (`/api/v1`). */
export class CoolifyClient implements CoolifyGateway {
  private readonly url: string;

  constructor(url: string, private readonly token: string) {
    this.url = url.replace(/\/+$/, "");
  }

  isConfigured() {
    return Boolean(this.url && this.token);
  }

  private async request<T = any>(
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {},
  ): Promise<T> {
    if (!this.isConfigured()) throw new CoolifyError(503, "Coolify no está configurado (COOLIFY_URL / COOLIFY_TOKEN)");
    const url = new URL(`${this.url}/api/v1${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {}
    if (!res.ok) {
      const msg = (data && typeof data === "object" && (data.message || data.error)) || text || res.statusText;
      throw new CoolifyError(res.status, `Coolify ${res.status}: ${msg}`, data);
    }
    return data as T;
  }

  version() {
    return this.request<string>("GET", "/version");
  }
  servers() {
    return this.request<any[]>("GET", "/servers");
  }

  private projects() {
    return this.request<{ uuid: string; name: string; description: string | null }[]>("GET", "/projects");
  }
  private environments(projectUuid: string) {
    return this.request<any[]>("GET", `/projects/${projectUuid}/environments`);
  }

  createProject(name: string, description?: string) {
    return this.request<{ uuid: string }>("POST", "/projects", { body: { name, description } });
  }
  updateProject(uuid: string, body: { name?: string; description?: string }) {
    return this.request("PATCH", `/projects/${uuid}`, { body });
  }
  deleteProject(uuid: string) {
    return this.request("DELETE", `/projects/${uuid}`);
  }
  createEnvironment(projectUuid: string, name: string) {
    return this.request<{ uuid: string }>("POST", `/projects/${projectUuid}/environments`, { body: { name } });
  }
  deleteEnvironment(projectUuid: string, env: string) {
    return this.request("DELETE", `/projects/${projectUuid}/environments/${env}`);
  }

  async allResources(): Promise<Resource[]> {
    const [apps, dbs, services] = await Promise.all([
      this.request<any[]>("GET", "/applications"),
      this.request<any[]>("GET", "/databases"),
      this.request<any[]>("GET", "/services"),
    ]);
    return [
      ...(apps ?? []).map((r) => toResource("application", r)),
      ...(dbs ?? []).map((r) => toResource("database", r)),
      ...(services ?? []).map((r) => toResource("service", r)),
    ];
  }

  async tree(): Promise<ProjectTree[]> {
    const [projects, resources] = await Promise.all([this.projects(), this.allResources()]);
    const byEnv = new Map<number, Resource[]>();
    for (const r of resources) {
      const list = byEnv.get(r.environmentId) ?? [];
      list.push(r);
      byEnv.set(r.environmentId, list);
    }
    return Promise.all(
      projects.map(async (p) => {
        const envs = await this.environments(p.uuid).catch(() => []);
        return {
          uuid: p.uuid,
          name: p.name,
          description: p.description ?? null,
          environments: envs.map((e: any) => ({
            id: e.id,
            uuid: e.uuid ?? null,
            name: e.name,
            resources: byEnv.get(e.id) ?? [],
          })),
        };
      }),
    );
  }

  async project(uuid: string): Promise<ProjectTree> {
    const tree = await this.tree();
    const p = tree.find((t) => t.uuid === uuid);
    if (!p) throw new CoolifyError(404, "Proyecto no encontrado");
    return p;
  }

  resourceAction(type: ResourceType, uuid: string, action: ResourceAction) {
    return this.request("POST", `/${resourcePath[type]}/${uuid}/${action}`);
  }
  deploy(uuid: string, force = false) {
    return this.request("POST", "/deploy", { query: { uuid, force } });
  }
  deleteResource(type: ResourceType, uuid: string, deleteVolumes: boolean) {
    return this.request("DELETE", `/${resourcePath[type]}/${uuid}`, {
      query: {
        delete_configurations: true,
        delete_volumes: deleteVolumes,
        docker_cleanup: true,
        delete_connected_networks: true,
      },
    });
  }
  moveResource(type: ResourceType, uuid: string, environmentUuid: string) {
    return this.request("POST", `/${resourcePath[type]}/${uuid}/move`, { body: { environment_uuid: environmentUuid } });
  }
  logs(type: "application" | "database", uuid: string, lines = 200) {
    return this.request<{ logs: string }>("GET", `/${resourcePath[type]}/${uuid}/logs`, { query: { lines } });
  }
  envs(type: ResourceType, uuid: string) {
    return this.request<any[]>("GET", `/${resourcePath[type]}/${uuid}/envs`);
  }

  createDatabase(kind: CoolifyDbKind, body: Record<string, unknown>) {
    return this.request<{ uuid: string }>("POST", `/databases/${kind}`, { body });
  }

  async environmentUuid(projectUuid: string, env: Environment): Promise<string> {
    if (env.uuid) return env.uuid;
    const detail = await this.request<any>("GET", `/projects/${projectUuid}/${encodeURIComponent(env.name)}`);
    if (!detail?.uuid) throw new CoolifyError(500, `No se pudo obtener el uuid del entorno ${env.name}`);
    return detail.uuid;
  }
}
