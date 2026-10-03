/**
 * Composition root: el único sitio que conoce las implementaciones de infra.
 * Crea los adaptadores y se los inyecta a los servicios a través de sus puertos.
 */
import Docker from "dockerode";
import { config } from "./config.js";
import { CoolifyClient } from "./infra/coolify/client.js";
import { createCipher } from "./infra/crypto.js";
import { SqliteAuditLog } from "./infra/db/audit.repository.js";
import { SqliteConnectionRepository } from "./infra/db/connection.repository.js";
import { SqliteMetricsRepository } from "./infra/db/metrics.repository.js";
import { openDatabase } from "./infra/db/sqlite.js";
import { DockerRuntime } from "./infra/docker/client.js";
import { DockerEventFeed } from "./infra/docker/events.js";
import { DockerStatsFeed } from "./infra/docker/stats.js";
import { driverFactory } from "./infra/drivers/registry.js";
import { ProcHostSampler } from "./infra/telemetry/host-sampler.js";
import { AuthService } from "./services/auth.service.js";
import { ConnectionService } from "./services/connection.service.js";
import { ContainerService } from "./services/container.service.js";
import { DatabaseService } from "./services/database.service.js";
import { ExplorerService } from "./services/explorer.service.js";
import { ProjectService } from "./services/project.service.js";
import { ResourceService } from "./services/resource.service.js";
import { SystemService } from "./services/system.service.js";
import { TelemetryService } from "./services/telemetry.service.js";

export function createContainer() {
  // --- infra ---
  const db = openDatabase(config.dataDir);
  const audit = new SqliteAuditLog(db);
  const metrics = new SqliteMetricsRepository(db);
  const connectionRepo = new SqliteConnectionRepository(db, createCipher(config.secret));
  const coolify = new CoolifyClient(config.coolify.url, config.coolify.token);
  const docker = new Docker({ socketPath: config.dockerSocket });
  const runtime = new DockerRuntime(docker, config.dockerSocket);
  const dockerAvailable = () => runtime.available();

  // --- servicios ---
  const telemetry = new TelemetryService(
    new ProcHostSampler(config.hostProc, config.hostRoot),
    metrics,
    config.telemetryIntervalMs,
  );
  const projects = new ProjectService(coolify, audit);
  const connections = new ConnectionService(coolify, connectionRepo, driverFactory, audit, config.coolify.dbAccess);

  return {
    auth: new AuthService(audit, { user: config.adminUser, password: config.adminPassword }),
    projects,
    resources: new ResourceService(coolify, audit, projects),
    databases: new DatabaseService(coolify, audit),
    connections,
    explorer: new ExplorerService(connections, audit),
    containers: new ContainerService(
      runtime,
      new DockerStatsFeed(docker, dockerAvailable),
      new DockerEventFeed(docker, dockerAvailable),
      audit,
    ),
    telemetry,
    system: new SystemService(coolify, runtime, telemetry, metrics, audit, {
      coolifyUrl: config.coolify.url,
      dbAccess: config.coolify.dbAccess,
    }),
  };
}

export type Services = ReturnType<typeof createContainer>;
