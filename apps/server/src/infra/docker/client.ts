import type Docker from "dockerode";
import { existsSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { ContainerAction, ContainerInfo } from "../../domain/container.js";
import type { ContainerRuntime } from "../../domain/ports.js";

function coolifyUuidFromLabels(labels: Record<string, string>, name: string): string | null {
  // Coolify nombra los contenedores con el uuid del recurso: "<uuid>", "<uuid>-<timestamp>" o "<servicio>-<uuid>"
  const fromLabel = labels["coolify.resourceUuid"] ?? labels["coolify.serviceUuid"] ?? labels["coolify.databaseUuid"];
  if (fromLabel) return fromLabel;
  if (labels["coolify.managed"] !== "true") return null;
  const m = name.match(/^([a-z0-9]{20,32})(?:-\d+)?$/) ?? name.match(/-([a-z0-9]{20,32})$/);
  return m ? m[1] : null;
}

/** Acceso a Docker a través del socket (dockerode). */
export class DockerRuntime implements ContainerRuntime {
  constructor(private readonly docker: Docker, private readonly socketPath: string) {}

  available() {
    return existsSync(this.socketPath);
  }

  async info() {
    const info = await this.docker.info();
    return { version: info.ServerVersion, containers: info.Containers, running: info.ContainersRunning };
  }

  async list(): Promise<ContainerInfo[]> {
    const list = await this.docker.listContainers({ all: true });
    return list.map((c) => {
      const name = (c.Names[0] ?? c.Id).replace(/^\//, "");
      return {
        id: c.Id,
        name,
        image: c.Image,
        state: c.State,
        status: c.Status,
        created: c.Created * 1000,
        labels: c.Labels ?? {},
        ports: (c.Ports ?? []).map((p) => ({ private: p.PrivatePort, public: p.PublicPort, type: p.Type })),
        networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
        coolifyUuid: coolifyUuidFromLabels(c.Labels ?? {}, name),
      };
    });
  }

  async action(id: string, action: ContainerAction) {
    const c = this.docker.getContainer(id);
    if (action === "stop") await c.stop();
    else if (action === "start") await c.start();
    else if (action === "restart") await c.restart();
    else if (action === "pause") await c.pause();
    else await c.unpause();
  }

  async remove(id: string) {
    await this.docker.getContainer(id).remove({ force: true });
  }

  /** Stream de logs (stdout+stderr demultiplexados) de un contenedor. */
  async streamLogs(id: string, tail = 200) {
    const container = this.docker.getContainer(id);
    const info = await container.inspect();
    const raw = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })) as unknown as NodeJS.ReadableStream & { destroy: () => void };
    const out = new PassThrough();
    if (info.Config.Tty) raw.pipe(out);
    else this.docker.modem.demuxStream(raw, out, out);
    raw.on("end", () => out.end());
    return { stream: out, stop: () => raw.destroy() };
  }
}
