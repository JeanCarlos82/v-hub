import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { existsSync } from "node:fs";
import { config } from "./config.js";
import { createContainer } from "./container.js";
import { authRoutes, SESSION_COOKIE } from "./routes/auth.routes.js";
import { containerRoutes } from "./routes/containers.routes.js";
import { databaseRoutes } from "./routes/databases.routes.js";
import { explorerRoutes } from "./routes/explorer.routes.js";
import { registerAuthGuard } from "./routes/plugins/auth-guard.js";
import { registerErrorHandler } from "./routes/plugins/error-handler.js";
import { projectRoutes } from "./routes/projects.routes.js";
import { realtimeRoutes } from "./routes/realtime.routes.js";
import { resourceRoutes } from "./routes/resources.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { setupRoutes } from "./routes/setup.routes.js";
import { systemRoutes } from "./routes/system.routes.js";

const services = createContainer();
const app = Fastify({ logger: { level: config.isProd ? "info" : "warn" }, trustProxy: true });

await app.register(cookie);
await app.register(jwt, { secret: config.secret, cookie: { cookieName: SESSION_COOKIE, signed: false } });
await app.register(rateLimit, { global: false });
await app.register(websocket);

registerAuthGuard(app);
registerErrorHandler(app);

for (const routes of [
  authRoutes,
  setupRoutes,
  settingsRoutes,
  systemRoutes,
  containerRoutes,
  projectRoutes,
  resourceRoutes,
  databaseRoutes,
  explorerRoutes,
  realtimeRoutes,
]) {
  await app.register(routes(services));
}

// Frontend compilado (SPA)
if (existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0];
    // Rutas de la SPA -> index.html; ficheros inexistentes (/assets/x.js) -> 404
    if (req.method === "GET" && !path.startsWith("/api/") && !/\.[a-z0-9]+$/i.test(path)) return reply.sendFile("index.html");
    return reply.code(404).send({ error: "No encontrado" });
  });
}

services.telemetry.start();
services.containers.startEventFeed();

await app.listen({ port: config.port, host: config.host });
console.log(`V-HUB escuchando en http://${config.host}:${config.port}`);
