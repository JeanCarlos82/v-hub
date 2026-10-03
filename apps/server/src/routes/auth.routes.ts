import type { FastifyInstance } from "fastify";
import type { Services } from "../container.js";

export const SESSION_COOKIE = "vhub_token";

export function authRoutes({ auth }: Services) {
  return async (app: FastifyInstance) => {
    app.get("/api/health", () => ({ ok: true }));

    app.post(
      "/api/auth/login",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
        const user = auth.login(username, password, req.ip);
        const token = app.jwt.sign({ sub: user }, { expiresIn: "7d" });
        return reply
          .setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", secure: "auto", maxAge: 7 * 86400 })
          .send({ user });
      },
    );
    app.post("/api/auth/logout", (_req, reply) => reply.clearCookie(SESSION_COOKIE, { path: "/" }).send({ ok: true }));
    app.get("/api/auth/me", (req) => ({ user: (req.user as any).sub }));
  };
}
