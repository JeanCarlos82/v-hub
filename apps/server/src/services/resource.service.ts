import type { AuditLog, CoolifyGateway } from "../domain/ports.js";
import type { ResourceType } from "../domain/project.js";
import type { ProjectService } from "./project.service.js";

/** Apps, bases de datos y servicios de Coolify. */
export class ResourceService {
  constructor(
    private readonly coolify: CoolifyGateway,
    private readonly audit: AuditLog,
    private readonly projects: ProjectService,
  ) {}

  async action(type: ResourceType, uuid: string, action: "start" | "stop" | "restart" | "deploy" | "redeploy") {
    const res =
      action === "deploy" || action === "redeploy"
        ? await this.coolify.deploy(uuid, action === "redeploy")
        : await this.coolify.resourceAction(type, uuid, action);
    this.audit.log(`resource.${action}`, `${type}:${uuid}`);
    return res;
  }

  async delete(type: ResourceType, uuid: string, deleteVolumes: boolean) {
    const res = await this.coolify.deleteResource(type, uuid, deleteVolumes);
    this.audit.log("resource.delete", `${type}:${uuid}`);
    return res;
  }

  /** Mueve el recurso al entorno indicado (se crea si no existe). No hay redespliegue. */
  async move(type: ResourceType, uuid: string, projectUuid: string, environmentName: string) {
    const project = await this.coolify.project(projectUuid);
    const { envUuid } = await this.projects.ensureEnvironment(project, environmentName);
    const res = await this.coolify.moveResource(type, uuid, envUuid);
    this.audit.log("resource.move", `${type}:${uuid}`, { projectUuid, environmentName });
    return res;
  }

  logs(type: "application" | "database", uuid: string, lines: number) {
    return this.coolify.logs(type, uuid, lines);
  }

  envs(type: ResourceType, uuid: string) {
    return this.coolify.envs(type, uuid);
  }
}
