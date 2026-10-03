import { EventEmitter } from "node:events";
import type { HostSampler, MetricsRepository } from "../domain/ports.js";
import type { HostSample } from "../domain/telemetry.js";

/** Muestreo continuo del host: buffer en memoria (15 min) + agregados por minuto en el repositorio (7 días). */
export class TelemetryService {
  history: HostSample[] = [];
  private readonly emitter = new EventEmitter();
  private readonly maxHistory: number;
  private minuteBucket: HostSample[] = [];
  private currentMinute = 0;

  constructor(
    private readonly sampler: HostSampler,
    private readonly metrics: MetricsRepository,
    private readonly intervalMs: number,
  ) {
    this.maxHistory = Math.ceil((15 * 60_000) / intervalMs);
  }

  start() {
    this.sampler.sample(); // inicializa los deltas
    setInterval(() => this.tick(), this.intervalMs).unref();
  }

  subscribe(fn: (sample: HostSample) => void) {
    this.emitter.on("sample", fn);
    return () => void this.emitter.off("sample", fn);
  }

  get latest() {
    return this.history.at(-1) ?? null;
  }

  private tick() {
    const s = this.sampler.sample();
    this.history.push(s);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.emitter.emit("sample", s);

    const minute = Math.floor(s.ts / 60_000) * 60_000;
    if (this.currentMinute && minute !== this.currentMinute && this.minuteBucket.length) {
      const b = this.minuteBucket;
      const avg = (f: (x: HostSample) => number) => b.reduce((a, x) => a + f(x), 0) / b.length;
      this.metrics.insert({
        ts: this.currentMinute,
        cpu: avg((x) => x.cpu),
        mem: avg((x) => x.mem.pct),
        disk: avg((x) => x.disk.pct),
        rx: avg((x) => x.net.rx),
        tx: avg((x) => x.net.tx),
        load1: avg((x) => x.load[0]),
      });
      this.minuteBucket = [];
    }
    this.currentMinute = minute;
    this.minuteBucket.push(s);
  }
}
