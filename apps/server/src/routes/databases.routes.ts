import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";
import { COOLIFY_DB_KINDS } from "../domain/project.js";

const kindSchema = z.enum(["postgres", "mysql", "redis", "mongodb"]);

/** Conexiones del explorador y creación de BD en Coolify. */
export function databaseRoutes({ connections, databases }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/connections", () => connections.list());

    app.post("/api/connections/test", async (req) => {
      const { kind, url } = z.object({ kind: kindSchema, url: z.string().min(1) }).parse(req.body);
      return connections.test(kind, url);
    });

    app.post("/api/connections", async (req) => {
      const body = z.object({ name: z.string().min(1), kind: kindSchema, url: z.string().min(1) }).parse(req.body);
      return connections.create(body.name, body.kind, body.url);
    });

    app.delete<{ Params: { id: string } }>("/api/connections/:id", async (req) => {
      await connections.remove(req.params.id);
      return { ok: true };
    });

    app.post("/api/databases", async (req) => {
      const body = z
        .object({
          kind: z.enum(COOLIFY_DB_KINDS),
          projectUuid: z.string(),
          environmentName: z.string().default("production"),
          name: z.string().min(1),
          serverUuid: z.string().optional(),
          isPublic: z.boolean().default(false),
          publicPort: z.number().int().optional(),
          instantDeploy: z.boolean().default(true),
        })
        .parse(req.body);
      return databases.create(body);
    });
  };
}
