import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Variable de entorno o undefined si no está definida o está vacía. */
const env = (name: string) => process.env[name] || undefined;

const isProd = process.env.NODE_ENV === "production";
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
mkdirSync(dataDir, { recursive: true });

/** APP_SECRET o, si no se define, uno generado una vez y guardado en el volumen de datos. */
function loadSecret(): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  const file = join(dataDir, ".secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir,
  // Clave para firmar JWT y cifrar credenciales guardadas
  secret: loadSecret(),
  /**
   * Ajustes opcionales por entorno. Si faltan, se configuran desde el asistente web
   * y se guardan en SQLite; si existen, tienen prioridad y no se pueden cambiar desde el panel.
   */
  env: {
    adminUser: env("ADMIN_USER"),
    adminPassword: env("ADMIN_PASSWORD"),
    coolifyUrl: env("COOLIFY_URL"),
    coolifyToken: env("COOLIFY_TOKEN"),
    // "internal": conecta a las BD por la red docker de coolify (V-HUB en el mismo VPS)
    // "external": usa la URL pública de la BD (útil en desarrollo local)
    dbAccess: env("COOLIFY_DB_ACCESS") as "internal" | "external" | undefined,
  },
  dockerSocket: process.env.DOCKER_SOCKET ?? "/var/run/docker.sock",
  // Ruta donde está montado /proc del host (en docker-compose: /proc:/host/proc:ro)
  hostProc: process.env.HOST_PROC ?? "/proc",
  // Ruta donde está montado / del host para medir disco (en docker-compose: /:/hostfs:ro)
  hostRoot: process.env.HOST_ROOT ?? "/",
  telemetryIntervalMs: Number(process.env.TELEMETRY_INTERVAL_MS ?? 2000),
  webDist: resolve(process.env.WEB_DIST ?? "../web/dist"),
};
