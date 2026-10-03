import { AppError } from "../domain/errors.js";
import type { AuditLog, CoolifyGateway } from "../domain/ports.js";
import type { ProjectTree, StepResult } from "../domain/project.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ProjectService {
  constructor(
    private readonly coolify: CoolifyGateway,
    private readonly audit: AuditLog,
  ) {}

  tree() {
    return this.coolify.tree();
  }

  get(uuid: string) {
    return this.coolify.project(uuid);
  }

  async create(name: string, description?: string) {
    const res = await this.coolify.createProject(name, description);
    this.audit.log("project.create", name, res);
    return res;
  }

  async update(uuid: string, body: { name?: string; description?: string }) {
    await this.coolify.updateProject(uuid, body);
    this.audit.log("project.update", uuid, body);
  }

  /** Sin `cascade` Coolify rechaza el borrado si el proyecto tiene recursos. */
  async delete(uuid: string, opts: { cascade: boolean; deleteVolumes: boolean }) {
    if (opts.cascade) {
      const result = await this.deleteCascade(uuid, opts.deleteVolumes);
      this.audit.log("project.delete.cascade", uuid, result);
      return result;
    }
    await this.coolify.deleteProject(uuid);
    this.audit.log("project.delete", uuid);
    return { steps: [] as StepResult[], pending: false };
  }

  async createEnvironment(projectUuid: string, name: string) {
    const res = await this.coolify.createEnvironment(projectUuid, name);
    this.audit.log("environment.create", `${projectUuid}/${name}`);
    return res;
  }

  async deleteEnvironment(projectUuid: string, env: string) {
    await this.coolify.deleteEnvironment(projectUuid, env);
    this.audit.log("environment.delete", `${projectUuid}/${env}`);
  }

  /**
   * Devuelve el uuid del entorno `name` del proyecto, creándolo si no existe.
   * También devuelve el proyecto actualizado, por si hubo que crear el entorno.
   */
  async ensureEnvironment(project: ProjectTree, name: string): Promise<{ envUuid: string; project: ProjectTree }> {
    let env = project.environments.find((e) => e.name === name);
    if (!env) {
      await this.coolify.createEnvironment(project.uuid, name);
      project = await this.coolify.project(project.uuid);
      env = project.environments.find((e) => e.name === name)!;
    }
    return { envUuid: await this.coolify.environmentUuid(project.uuid, env), project };
  }

  /**
   * Une varios proyectos en uno: mueve todos los recursos de cada entorno origen al entorno
   * del mismo nombre en el destino (creándolo si no existe) y, si todo fue bien, borra el origen.
   */
  async merge(sourceUuids: string[], targetUuid: string, deleteSources: boolean) {
    const steps: StepResult[] = [];
    let target = await this.coolify.project(targetUuid);

    for (const sourceUuid of sourceUuids) {
      if (sourceUuid === targetUuid) continue;
      const source = await this.coolify.project(sourceUuid);
      let failed = false;

      for (const env of source.environments) {
        const ensured = await this.ensureEnvironment(target, env.name);
        target = ensured.project;
        for (const r of env.resources) {
          try {
            await this.coolify.moveResource(r.type, r.uuid, ensured.envUuid);
            steps.push({ resource: r.name, type: r.type, ok: true });
          } catch (e: any) {
            failed = true;
            steps.push({ resource: r.name, type: r.type, ok: false, error: e.message });
          }
        }
      }

      if (deleteSources && !failed) {
        try {
          await this.coolify.deleteProject(sourceUuid);
          steps.push({ resource: source.name, type: "project", ok: true });
        } catch (e: any) {
          steps.push({ resource: source.name, type: "project", ok: false, error: e.message });
        }
      }
    }
    this.audit.log("project.merge", targetUuid, { sources: sourceUuids, steps });
    return steps;
  }

  /** Borra un proyecto y todos sus recursos. Coolify borra en segundo plano, así que esperamos a que se vacíe. */
  private async deleteCascade(uuid: string, deleteVolumes: boolean) {
    const steps: StepResult[] = [];
    const project = await this.coolify.project(uuid);
    for (const env of project.environments) {
      for (const r of env.resources) {
        try {
          await this.coolify.deleteResource(r.type, r.uuid, deleteVolumes);
          steps.push({ resource: r.name, type: r.type, ok: true });
        } catch (e: any) {
          steps.push({ resource: r.name, type: r.type, ok: false, error: e.message });
        }
      }
    }

    const deadline = Date.now() + 90_000;
    let lastError = "";
    while (Date.now() < deadline) {
      try {
        await this.coolify.deleteProject(uuid);
        steps.push({ resource: project.name, type: "project", ok: true });
        return { steps, pending: false };
      } catch (e: any) {
        lastError = e.message;
        if (e instanceof AppError && e.status === 404) return { steps, pending: false };
        await sleep(3000);
      }
    }
    steps.push({ resource: project.name, type: "project", ok: false, error: lastError });
    return { steps, pending: true };
  }
}
