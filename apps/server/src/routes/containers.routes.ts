import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

export function containerRoutes({ containers }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/containers", () => containers.list());

    app.post<{ Params: { id: string; action: string } }>("/api/containers/:id/:action", async (req) => {
      const action = z.enum(["start", "stop", "restart", "pause", "unpause"]).parse(req.params.action);
      await containers.action(req.params.id, action);
      return { ok: true };
    });

    app.delete<{ Params: { id: string } }>("/api/containers/:id", async (req) => {
      await containers.remove(req.params.id);
      return { ok: true };
    });
  };
}
