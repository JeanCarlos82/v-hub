import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

const resourceType = z.enum(["application", "database", "service"]);

/** Apps, bases de datos y servicios de Coolify. */
export function resourceRoutes({ resources }: Services) {
  return async (app: FastifyInstance) => {
    app.post<{ Params: { type: string; uuid: string; action: string } }>(
      "/api/resources/:type/:uuid/:action",
      async (req) => {
        const type = resourceType.parse(req.params.type);
        const action = z.enum(["start", "stop", "restart", "deploy", "redeploy"]).parse(req.params.action);
        return (await resources.action(type, req.params.uuid, action)) ?? { ok: true };
      },
    );

    app.delete<{ Params: { type: string; uuid: string }; Querystring: { volumes?: string } }>(
      "/api/resources/:type/:uuid",
      (req) => resources.delete(resourceType.parse(req.params.type), req.params.uuid, req.query.volumes === "true"),
    );

    app.post<{ Params: { type: string; uuid: string } }>("/api/resources/:type/:uuid/move", async (req) => {
      const type = resourceType.parse(req.params.type);
      const { projectUuid, environmentName } = z
        .object({ projectUuid: z.string(), environmentName: z.string() })
        .parse(req.body);
      return resources.move(type, req.params.uuid, projectUuid, environmentName);
    });

    app.get<{ Params: { type: string; uuid: string }; Querystring: { lines?: string } }>(
      "/api/resources/:type/:uuid/logs",
      async (req) => {
        const type = z.enum(["application", "database"]).parse(req.params.type);
        return resources.logs(type, req.params.uuid, Number(req.query.lines ?? 300));
      },
    );

    app.get<{ Params: { type: string; uuid: string } }>("/api/resources/:type/:uuid/envs", async (req) =>
      resources.envs(resourceType.parse(req.params.type), req.params.uuid),
    );
  };
}
