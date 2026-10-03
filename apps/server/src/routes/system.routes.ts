import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

export function systemRoutes({ system }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/system/status", () => system.status());

    app.get<{ Querystring: { range?: string } }>("/api/system/metrics", async (req) => {
      const range = z.enum(["live", "1h", "24h", "7d"]).parse(req.query.range ?? "live");
      return system.metricsFor(range);
    });

    app.get("/api/system/audit", () => system.recentAudit());

    app.get("/api/coolify/servers", () => system.coolifyServers());
  };
}
