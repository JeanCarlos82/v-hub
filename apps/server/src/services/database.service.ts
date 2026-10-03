import { randomBytes } from "node:crypto";
import { BadRequestError } from "../domain/errors.js";
import type { AuditLog, CoolifyGateway } from "../domain/ports.js";
import type { CoolifyDbKind } from "../domain/project.js";

export interface CreateDatabaseInput {
  kind: CoolifyDbKind;
  projectUuid: string;
  environmentName: string;
  name: string;
  serverUuid?: string;
  isPublic: boolean;
  publicPort?: number;
  instantDeploy: boolean;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "app";
}

const secret = () => randomBytes(18).toString("base64url");

/** Credenciales iniciales que Coolify espera para cada motor. */
function initialCredentials(kind: CoolifyDbKind, name: string): Record<string, string> {
  const password = secret();
  const credentials: Record<CoolifyDbKind, Record<string, string>> = {
    postgresql: { postgres_user: "vhub", postgres_password: password, postgres_db: slug(name) },
    mysql: { mysql_user: "vhub", mysql_password: password, mysql_root_password: secret(), mysql_database: slug(name) },
    mariadb: { mariadb_user: "vhub", mariadb_password: password, mariadb_root_password: secret(), mariadb_database: slug(name) },
    redis: { redis_password: password },
    keydb: { keydb_password: password },
    dragonfly: { dragonfly_password: password },
    mongodb: { mongo_initdb_root_username: "vhub" },
    clickhouse: {},
  };
  return credentials[kind];
}

/** Creación de bases de datos nuevas en Coolify. */
export class DatabaseService {
  constructor(
    private readonly coolify: CoolifyGateway,
    private readonly audit: AuditLog,
  ) {}

  async create(input: CreateDatabaseInput) {
    const project = await this.coolify.project(input.projectUuid);
    const env = project.environments.find((e) => e.name === input.environmentName);
    if (!env) throw new BadRequestError(`El entorno ${input.environmentName} no existe`);
    const serverUuid = input.serverUuid ?? (await this.coolify.servers())[0]?.uuid;
    if (!serverUuid) throw new BadRequestError("No hay servidores en Coolify");

    const res = await this.coolify.createDatabase(input.kind, {
      server_uuid: serverUuid,
      project_uuid: input.projectUuid,
      environment_name: env.name,
      environment_uuid: await this.coolify.environmentUuid(input.projectUuid, env),
      name: input.name,
      is_public: input.isPublic,
      public_port: input.publicPort,
      instant_deploy: input.instantDeploy,
      ...initialCredentials(input.kind, input.name),
    });
    this.audit.log("database.create", input.name, { kind: input.kind, project: input.projectUuid });
    return res;
  }
}
