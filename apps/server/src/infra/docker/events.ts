import type Docker from "dockerode";
import { EventEmitter } from "node:events";
import type { ContainerEvent } from "../../domain/container.js";
import type { ContainerEventFeed } from "../../domain/ports.js";

/** Eventos de docker (start/stop/die/destroy...) para refrescar la UI al instante. */
export class DockerEventFeed implements ContainerEventFeed {
  private readonly emitter = new EventEmitter();

  constructor(private readonly docker: Docker, private readonly available: () => boolean) {}

  subscribe(fn: (e: ContainerEvent) => void) {
    this.emitter.on("event", fn);
    return () => void this.emitter.off("event", fn);
  }

  start() {
    void this.watch();
  }

  private async watch() {
    if (!this.available()) return;
    const retry = (ms: number) => setTimeout(() => void this.watch(), ms);
    try {
      const stream = await this.docker.getEvents({ filters: { type: ["container"] } });
      stream.on("data", (buf: Buffer) => {
        for (const line of buf.toString().split("\n").filter(Boolean)) {
          try {
            const e = JSON.parse(line);
            this.emitter.emit("event", {
              action: e.Action ?? e.status,
              id: e.id,
              name: e.Actor?.Attributes?.name,
              ts: (e.time ?? 0) * 1000,
            } satisfies ContainerEvent);
          } catch {}
        }
      });
      stream.on("end", () => retry(5000));
      stream.on("error", () => retry(5000));
    } catch {
      retry(10_000);
    }
  }
}
