import type { ContainerAction, ContainerEvent, ContainerStat } from "../domain/container.js";
import type { AuditLog, ContainerEventFeed, ContainerRuntime, ContainerStatsFeed } from "../domain/ports.js";

export class ContainerService {
  constructor(
    private readonly runtime: ContainerRuntime,
    private readonly stats: ContainerStatsFeed,
    private readonly events: ContainerEventFeed,
    private readonly audit: AuditLog,
  ) {}

  async list() {
    if (!this.runtime.available()) return { available: false, containers: [], stats: [] };
    return { available: true, containers: await this.runtime.list(), stats: this.stats.latest() };
  }

  async action(id: string, action: ContainerAction) {
    await this.runtime.action(id, action);
    this.audit.log(`container.${action}`, id);
  }

  async remove(id: string) {
    await this.runtime.remove(id);
    this.audit.log("container.remove", id);
  }

  latestStats() {
    return this.stats.latest();
  }

  subscribeStats(fn: (stats: ContainerStat[]) => void) {
    return this.stats.subscribe(fn);
  }

  subscribeEvents(fn: (event: ContainerEvent) => void) {
    return this.events.subscribe(fn);
  }

  streamLogs(id: string) {
    return this.runtime.streamLogs(id);
  }

  /** Empieza a escuchar los eventos de Docker (al arrancar el servidor). */
  startEventFeed() {
    this.events.start();
  }
}
