import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";
import { startSession } from "./auth.routes.js";

/** Asistente de primera instalación (rutas públicas, protegidas por el código de instalación). */
export function setupRoutes({ settings }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/setup/status", () => settings.setupStatus());

    app.post("/api/setup", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
      const body = z
        .object({
          code: z.string().min(1),
          username: z.string().trim().min(1).default("admin"),
          password: z.string(),
          coolifyUrl: z.string().optional(),
          coolifyToken: z.string().optional(),
        })
        .parse(req.body);
      return startSession(app, reply, await settings.completeSetup(body));
    });
  };
}
