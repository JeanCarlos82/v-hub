import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

export function projectRoutes({ projects }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/projects", () => projects.tree());
    app.get<{ Params: { uuid: string } }>("/api/projects/:uuid", (req) => projects.get(req.params.uuid));

    app.post("/api/projects", async (req) => {
      const body = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body);
      return projects.create(body.name, body.description);
    });

    app.patch<{ Params: { uuid: string } }>("/api/projects/:uuid", async (req) => {
      const body = z.object({ name: z.string().min(1).optional(), description: z.string().optional() }).parse(req.body);
      await projects.update(req.params.uuid, body);
      return { ok: true };
    });

    app.delete<{ Params: { uuid: string }; Querystring: { cascade?: string; volumes?: string } }>(
      "/api/projects/:uuid",
      (req) =>
        projects.delete(req.params.uuid, {
          cascade: req.query.cascade === "true",
          deleteVolumes: req.query.volumes === "true",
        }),
    );

    app.post("/api/projects/merge", async (req) => {
      const body = z
        .object({ sources: z.array(z.string()).min(1), target: z.string(), deleteSources: z.boolean().default(true) })
        .parse(req.body);
      return { steps: await projects.merge(body.sources, body.target, body.deleteSources) };
    });

    app.post<{ Params: { uuid: string } }>("/api/projects/:uuid/environments", async (req) => {
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body);
      return projects.createEnvironment(req.params.uuid, name);
    });

    app.delete<{ Params: { uuid: string; env: string } }>("/api/projects/:uuid/environments/:env", async (req) => {
      await projects.deleteEnvironment(req.params.uuid, req.params.env);
      return { ok: true };
    });
  };
}
