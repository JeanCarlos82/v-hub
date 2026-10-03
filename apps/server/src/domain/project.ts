export type ResourceType = "application" | "database" | "service";

export interface Resource {
  uuid: string;
  name: string;
  type: ResourceType;
  /** build_pack, database_type (postgresql, mysql...) o service_type */
  subtype: string | null;
  status: string;
  fqdn: string | null;
  environmentId: number;
  description: string | null;
  internalUrl?: string | null;
  externalUrl?: string | null;
  isPublic?: boolean;
}

export interface Environment {
  id: number;
  uuid: string | null;
  name: string;
  resources: Resource[];
}

export interface ProjectTree {
  uuid: string;
  name: string;
  description: string | null;
  environments: Environment[];
}

export interface StepResult {
  resource: string;
  type: ResourceType | "project";
  ok: boolean;
  error?: string;
}

export type ResourceAction = "start" | "stop" | "restart";

export const COOLIFY_DB_KINDS = ["postgresql", "mysql", "mariadb", "redis", "keydb", "dragonfly", "mongodb", "clickhouse"] as const;
export type CoolifyDbKind = (typeof COOLIFY_DB_KINDS)[number];
