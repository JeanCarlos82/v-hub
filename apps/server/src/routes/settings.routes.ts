import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Services } from "../container.js";

export function settingsRoutes({ settings }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/settings", () => settings.view());

    app.put("/api/settings/coolify", async (req) => {
      const body = z
        .object({
          url: z.string().optional(),
          token: z.string().optional(),
          dbAccess: z.enum(["internal", "external"]).optional(),
        })
        .parse(req.body);
      await settings.updateCoolify(body);
      return settings.view();
    });

    app.put("/api/settings/password", async (req) => {
      const { current, next } = z.object({ current: z.string(), next: z.string() }).parse(req.body);
      settings.changePassword(current, next);
      return { ok: true };
    });
  };
}
