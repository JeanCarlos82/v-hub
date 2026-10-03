import type Docker from "dockerode";
import { EventEmitter } from "node:events";
import type { ContainerStat } from "../../domain/container.js";
import type { ContainerStatsFeed } from "../../domain/ports.js";

/** Sondeo de estadísticas de todos los contenedores en marcha, sólo mientras haya suscriptores. */
export class DockerStatsFeed implements ContainerStatsFeed {
  private readonly emitter = new EventEmitter();
  private readonly current = new Map<string, ContainerStat>();
  private prev = new Map<string, { cpu: number; sys: number; rx: number; tx: number; ts: number }>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private readonly docker: Docker, private readonly available: () => boolean) {}

  latest() {
    return [...this.current.values()];
  }

  subscribe(fn: (stats: ContainerStat[]) => void) {
    this.emitter.on("stats", fn);
    this.ensureRunning();
    return () => {
      this.emitter.off("stats", fn);
      this.stopIfIdle();
    };
  }

  private ensureRunning() {
    if (this.timer || !this.available()) return;
    this.timer = setInterval(() => this.poll(), 3000);
    this.poll();
  }

  private stopIfIdle() {
    if (this.emitter.listenerCount("stats") === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const running = await this.docker.listContainers();
      const now = Date.now();
      const results = await Promise.all(
        running.map(async (c) => {
          try {
            const s: any = await this.docker.getContainer(c.Id).stats({ stream: false, "one-shot": true });
            const cpuTotal = s.cpu_stats?.cpu_usage?.total_usage ?? 0;
            const sysTotal = s.cpu_stats?.system_cpu_usage ?? 0;
            const cores = s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
            let rx = 0;
            let tx = 0;
            for (const n of Object.values<any>(s.networks ?? {})) {
              rx += n.rx_bytes;
              tx += n.tx_bytes;
            }
            const prev = this.prev.get(c.Id);
            let cpu = 0;
            let rxRate = 0;
            let txRate = 0;
            if (prev) {
              const dCpu = cpuTotal - prev.cpu;
              const dSys = sysTotal - prev.sys;
              cpu = dSys > 0 ? (dCpu / dSys) * cores * 100 : 0;
              const secs = (now - prev.ts) / 1000;
              rxRate = Math.max(0, (rx - prev.rx) / secs);
              txRate = Math.max(0, (tx - prev.tx) / secs);
            }
            this.prev.set(c.Id, { cpu: cpuTotal, sys: sysTotal, rx, tx, ts: now });
            const cache = s.memory_stats?.stats?.inactive_file ?? s.memory_stats?.stats?.cache ?? 0;
            const memUsed = Math.max(0, (s.memory_stats?.usage ?? 0) - cache);
            const memLimit = s.memory_stats?.limit ?? 0;
            const stat: ContainerStat = {
              id: c.Id,
              cpu: Math.max(0, cpu),
              memUsed,
              memLimit,
              memPct: memLimit ? (memUsed / memLimit) * 100 : 0,
              rx: rxRate,
              tx: txRate,
              pids: s.pids_stats?.current ?? 0,
            };
            return stat;
          } catch {
            return null;
          }
        }),
      );
      this.current.clear();
      for (const r of results) if (r) this.current.set(r.id, r);
      for (const id of this.prev.keys()) if (!this.current.has(id)) this.prev.delete(id);
      this.emitter.emit("stats", this.latest());
    } finally {
      this.busy = false;
    }
  }
}
