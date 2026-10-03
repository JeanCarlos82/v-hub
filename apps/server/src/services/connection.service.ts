import type { ConnectionSummary, DbKind, Driver } from "../domain/database.js";
import { BadRequestError, NotFoundError } from "../domain/errors.js";
import type { AuditLog, ConnectionRepository, CoolifyGateway, DriverFactory } from "../domain/ports.js";
import type { Resource } from "../domain/project.js";
import type { DbAccess } from "../domain/settings.js";

const KIND_BY_ENGINE: Record<string, DbKind> = {
  postgresql: "postgres",
  postgres: "postgres",
  mysql: "mysql",
  mariadb: "mysql",
  redis: "redis",
  keydb: "redis",
  dragonfly: "redis",
  mongodb: "mongodb",
};

const IDLE_MS = 5 * 60_000;

/**
 * Conexiones del explorador: las BD de Coolify (`coolify:<uuid>`) más las manuales (`manual:<id>`).
 * Mantiene una caché de drivers abiertos que se cierran tras 5 minutos sin uso.
 */
export class ConnectionService {
  private readonly cache = new Map<string, { driver: Driver; lastUsed: number; name: string }>();

  constructor(
    private readonly coolify: CoolifyGateway,
    private readonly repo: ConnectionRepository,
    private readonly drivers: DriverFactory,
    private readonly audit: AuditLog,
    /** "internal": red docker de Coolify · "external": URL pública de la BD (puede cambiar desde Ajustes) */
    private readonly dbAccess: () => DbAccess,
  ) {
    setInterval(() => {
      for (const [id, e] of this.cache) if (Date.now() - e.lastUsed > IDLE_MS) void this.dropDriver(id);
    }, 60_000).unref();
  }

  private coolifyUrl(r: Resource): string | null {
    const preferred = this.dbAccess() === "external" ? r.externalUrl : r.internalUrl;
    return preferred ?? r.internalUrl ?? r.externalUrl ?? null;
  }

  async list(): Promise<ConnectionSummary[]> {
    const out: ConnectionSummary[] = [];
    if (this.coolify.isConfigured()) {
      const resources = await this.coolify.allResources().catch(() => []);
      for (const r of resources.filter((x) => x.type === "database")) {
        out.push({
          id: `coolify:${r.uuid}`,
          name: r.name,
          kind: KIND_BY_ENGINE[r.subtype ?? ""] ?? null,
          engine: r.subtype ?? "?",
          source: "coolify",
          status: r.status,
          hasUrl: Boolean(this.coolifyUrl(r)),
          resourceUuid: r.uuid,
        });
      }
    }
    for (const c of this.repo.list()) {
      out.push({ id: `manual:${c.id}`, name: c.name, kind: c.kind, engine: c.kind, source: "manual", hasUrl: true });
    }
    return out;
  }

  /** Abre una conexión de prueba y devuelve la información del servidor. */
  async test(kind: DbKind, url: string) {
    const driver = this.drivers.create(kind, url);
    try {
      return await driver.info();
    } catch (e: any) {
      throw new BadRequestError(`No se pudo conectar: ${e.message}`);
    } finally {
      await driver.close().catch(() => {});
    }
  }

  async create(name: string, kind: DbKind, url: string) {
    await this.test(kind, url); // no guardamos conexiones que no funcionan
    const c = this.repo.create(name, kind, url);
    this.audit.log("connection.create", name);
    return { id: `manual:${c.id}` };
  }

  async remove(id: string) {
    if (!id.startsWith("manual:")) throw new BadRequestError("Sólo se pueden quitar conexiones manuales");
    await this.dropDriver(id);
    this.repo.remove(id.slice(7));
    this.audit.log("connection.delete", id);
  }

  async getDriver(id: string) {
    const hit = this.cache.get(id);
    if (hit) {
      hit.lastUsed = Date.now();
      return hit;
    }
    const { kind, url, name } = await this.resolve(id);
    const entry = { driver: this.drivers.create(kind, url), lastUsed: Date.now(), name };
    this.cache.set(id, entry);
    return entry;
  }

  private async dropDriver(id: string) {
    const hit = this.cache.get(id);
    this.cache.delete(id);
    await hit?.driver.close().catch(() => {});
  }

  private async resolve(id: string): Promise<{ kind: DbKind; url: string; name: string }> {
    if (id.startsWith("manual:")) {
      const c = this.repo.get(id.slice(7));
      if (!c) throw new NotFoundError("Conexión no encontrada");
      return { kind: c.kind, url: c.url, name: c.name };
    }
    if (id.startsWith("coolify:")) {
      const uuid = id.slice(8);
      const r = (await this.coolify.allResources()).find((x) => x.uuid === uuid && x.type === "database");
      if (!r) throw new NotFoundError("Base de datos no encontrada en Coolify");
      const kind = KIND_BY_ENGINE[r.subtype ?? ""];
      if (!kind) throw new BadRequestError(`El explorador aún no soporta ${r.subtype}`);
      const url = this.coolifyUrl(r);
      if (!url)
        throw new BadRequestError(
          "Coolify no devolvió la URL de conexión. Crea el token de API con el permiso 'read:sensitive' (o root).",
        );
      return { kind, url, name: r.name };
    }
    throw new BadRequestError("Identificador de conexión inválido");
  }
}
