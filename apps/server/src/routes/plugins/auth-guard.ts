import type { FastifyInstance } from "fastify";

const PUBLIC = new Set(["/api/auth/login", "/api/health", "/api/setup/status", "/api/setup"]);

/** Toda ruta `/api/*` exige un JWT válido, salvo las públicas. */
export function registerAuthGuard(app: FastifyInstance) {
  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/") || PUBLIC.has(path)) return;
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "No autenticado" });
    }
  });
}
