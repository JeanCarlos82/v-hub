import { existsSync, readFileSync, statfsSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { HostSampler } from "../../domain/ports.js";
import type { HostSample } from "../../domain/telemetry.js";

function statDisk(path: string) {
  const s = statfsSync(path);
  const total = s.blocks * s.bsize;
  const used = total - s.bfree * s.bsize;
  const avail = s.bavail * s.bsize;
  return { total, used, pct: used + avail ? (used / (used + avail)) * 100 : 0 };
}

/**
 * Lee las métricas del host desde /proc (montado en `hostProc`) y el disco desde `hostRoot`.
 * Sin /proc (macOS) usa los datos de `os` y el tráfico de red sale a 0.
 */
export class ProcHostSampler implements HostSampler {
  private readonly isLinuxProc: boolean;
  private prevCpu: { idle: number; total: number } | null = null;
  private prevNet: { rx: number; tx: number; ts: number } | null = null;

  constructor(private readonly hostProc: string, private readonly hostRoot: string) {
    this.isLinuxProc = existsSync(this.procPath("stat")) && existsSync(this.procPath("meminfo"));
  }

  private procPath(p: string) {
    return join(this.hostProc, p);
  }

  private readCpu(): { idle: number; total: number; cores: number } {
    if (this.isLinuxProc) {
      const lines = readFileSync(this.procPath("stat"), "utf8").split("\n");
      const parts = lines[0].trim().split(/\s+/).slice(1).map(Number);
      const idle = parts[3] + (parts[4] ?? 0);
      const total = parts.reduce((a, b) => a + b, 0);
      const cores = lines.filter((l) => /^cpu\d+/.test(l)).length;
      return { idle, total, cores };
    }
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const c of cpus) {
      idle += c.times.idle;
      total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq;
    }
    return { idle, total, cores: cpus.length };
  }

  private readMem() {
    if (this.isLinuxProc) {
      const info: Record<string, number> = {};
      for (const line of readFileSync(this.procPath("meminfo"), "utf8").split("\n")) {
        const m = line.match(/^(\w+):\s+(\d+)/);
        if (m) info[m[1]] = Number(m[2]) * 1024;
      }
      const total = info.MemTotal;
      const used = total - (info.MemAvailable ?? info.MemFree);
      return {
        mem: { total, used, pct: (used / total) * 100 },
        swap: { total: info.SwapTotal ?? 0, used: (info.SwapTotal ?? 0) - (info.SwapFree ?? 0) },
      };
    }
    const total = os.totalmem();
    const used = total - os.freemem();
    return { mem: { total, used, pct: (used / total) * 100 }, swap: { total: 0, used: 0 } };
  }

  private readNet(): { rx: number; tx: number } {
    if (!this.isLinuxProc) return { rx: 0, tx: 0 };
    // /proc/1/net/dev = espacio de red del host (pid 1), no el del contenedor de V-HUB
    const file = [this.procPath("1/net/dev"), this.procPath("net/dev")].find((f) => existsSync(f));
    if (!file) return { rx: 0, tx: 0 };
    let rx = 0;
    let tx = 0;
    for (const line of readFileSync(file, "utf8").split("\n").slice(2)) {
      const [iface, rest] = line.split(":");
      if (!rest) continue;
      const name = iface.trim();
      if (name === "lo" || /^(veth|docker|br-|virbr|cni|flannel|cali)/.test(name)) continue;
      const cols = rest.trim().split(/\s+/).map(Number);
      rx += cols[0];
      tx += cols[8];
    }
    return { rx, tx };
  }

  /** Disco de la raíz o de /var/lib/docker (contenedores y volúmenes), el que tenga más capacidad. */
  private readDisk() {
    let best = { total: 0, used: 0, pct: 0 };
    for (const path of [this.hostRoot, join(this.hostRoot, "var/lib/docker")]) {
      try {
        const d = statDisk(path);
        if (d.total > best.total) best = d;
      } catch {}
    }
    return best;
  }

  private readLoadUptime(): { load: [number, number, number]; uptime: number } {
    if (this.isLinuxProc) {
      const l = readFileSync(this.procPath("loadavg"), "utf8").split(" ").map(Number);
      const up = Number(readFileSync(this.procPath("uptime"), "utf8").split(" ")[0]);
      return { load: [l[0], l[1], l[2]], uptime: up };
    }
    const l = os.loadavg();
    return { load: [l[0], l[1], l[2]], uptime: os.uptime() };
  }

  sample(): HostSample {
    const now = Date.now();
    const cpuNow = this.readCpu();
    let cpu = 0;
    if (this.prevCpu) {
      const dt = cpuNow.total - this.prevCpu.total;
      cpu = dt > 0 ? (1 - (cpuNow.idle - this.prevCpu.idle) / dt) * 100 : 0;
    }
    this.prevCpu = cpuNow;

    const netNow = this.readNet();
    let net = { rx: 0, tx: 0 };
    if (this.prevNet) {
      const secs = (now - this.prevNet.ts) / 1000;
      net = {
        rx: Math.max(0, (netNow.rx - this.prevNet.rx) / secs),
        tx: Math.max(0, (netNow.tx - this.prevNet.tx) / secs),
      };
    }
    this.prevNet = { ...netNow, ts: now };

    return {
      ts: now,
      cpu: Math.max(0, Math.min(100, cpu)),
      cores: cpuNow.cores,
      ...this.readMem(),
      disk: this.readDisk(),
      net,
      ...this.readLoadUptime(),
    };
  }
}
