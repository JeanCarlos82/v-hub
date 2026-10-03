import type { AuditLog, ContainerRuntime, CoolifyGateway, MetricsRepository } from "../domain/ports.js";
import type { TelemetryService } from "./telemetry.service.js";

export type MetricsRange = "live" | "1h" | "24h" | "7d";

const RANGE_MS: Record<Exclude<MetricsRange, "live">, number> = {
  "1h": 3600_000,
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
};

/** Estado de las dependencias (Coolify, Docker), métricas e historial de auditoría. */
export class SystemService {
  constructor(
    private readonly coolify: CoolifyGateway,
    private readonly runtime: ContainerRuntime,
    private readonly telemetry: TelemetryService,
    private readonly metrics: MetricsRepository,
    private readonly audit: AuditLog,
    private readonly info: () => { coolifyUrl: string; dbAccess: string },
  ) {}

  async status() {
    let coolifyStatus: { configured: boolean; reachable: boolean; version?: string; error?: string } = {
      configured: this.coolify.isConfigured(),
      reachable: false,
    };
    if (coolifyStatus.configured) {
      try {
        coolifyStatus = { ...coolifyStatus, reachable: true, version: String(await this.coolify.version()) };
      } catch (e: any) {
        coolifyStatus.error = e.message;
      }
    }
    let dockerInfo: { available: boolean; version?: string; containers?: number; running?: number; error?: string } = {
      available: this.runtime.available(),
    };
    if (dockerInfo.available) {
      try {
        dockerInfo = { ...dockerInfo, ...(await this.runtime.info()) };
      } catch (e: any) {
        dockerInfo.error = e.message;
      }
    }
    return {
      coolify: { ...coolifyStatus, url: this.info().coolifyUrl || null, dbAccess: this.info().dbAccess },
      docker: dockerInfo,
      host: this.telemetry.latest,
    };
  }

  metricsFor(range: MetricsRange) {
    if (range === "live") return { range, samples: this.telemetry.history };
    return { range, samples: this.metrics.range(Date.now() - RANGE_MS[range]) };
  }

  recentAudit() {
    return this.audit.recent(200);
  }

  coolifyServers() {
    return this.coolify.servers();
  }
}
