import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AppError, BadRequestError } from "../domain/errors.js";
import type { AuditLog, CoolifyProbe, SettingsRepository } from "../domain/ports.js";
import type { DbAccess, EnvSettings, StoredSettings } from "../domain/settings.js";

/** URL de Coolify vista desde el contenedor de V-HUB en la red "coolify" */
const DEFAULT_COOLIFY_URL = "http://coolify:8080";
const MIN_PASSWORD = 8;

/** Comparación en tiempo constante (también para longitudes distintas). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyHash(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Código de 8 caracteres fácil de copiar (sin 0/O ni 1/I/L). */
function newSetupCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const chars = [...randomBytes(8)].map((b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export interface SetupInput {
  code: string;
  username: string;
  password: string;
  coolifyUrl?: string;
  coolifyToken?: string;
}

/**
 * Configuración de V-HUB. Combina las variables de entorno (prioritarias y de solo lectura)
 * con lo guardado desde el panel. También gestiona el asistente de primera instalación.
 */
export class SettingsService {
  private stored: StoredSettings;
  /** Sólo existe mientras falta la instalación inicial; se muestra en los logs del contenedor. */
  private setupCode: string | null = null;

  constructor(
    private readonly repo: SettingsRepository,
    private readonly env: EnvSettings,
    private readonly probe: CoolifyProbe,
    private readonly audit: AuditLog,
  ) {
    this.stored = repo.load();
    if (!this.isSetupComplete()) {
      this.setupCode = newSetupCode();
      console.log(`[V-HUB] Instalación pendiente. Código de instalación: ${this.setupCode}`);
    }
  }

  private save(patch: Partial<StoredSettings>) {
    this.repo.save(patch);
    this.stored = { ...this.stored, ...patch };
  }

  // --- Lecturas que usan otros servicios ---

  coolify() {
    return {
      url: this.env.coolifyUrl || this.stored.coolifyUrl || DEFAULT_COOLIFY_URL,
      token: this.env.coolifyToken || this.stored.coolifyToken || "",
    };
  }

  dbAccess(): DbAccess {
    return this.env.dbAccess ?? this.stored.dbAccess ?? "internal";
  }

  adminUser() {
    return this.env.adminUser || this.stored.adminUser || "admin";
  }

  isSetupComplete() {
    return Boolean(this.env.adminPassword || this.stored.adminPasswordHash);
  }

  verifyAdmin(username: string, password: string): boolean {
    if (!safeEqual(username, this.adminUser())) return false;
    if (this.env.adminPassword) return safeEqual(password, this.env.adminPassword);
    return this.stored.adminPasswordHash ? verifyHash(password, this.stored.adminPasswordHash) : false;
  }

  // --- Asistente de instalación ---

  setupStatus() {
    return {
      needsSetup: !this.isSetupComplete(),
      // Si el token viene del entorno, el asistente no lo pide
      coolifyFromEnv: Boolean(this.env.coolifyToken),
      defaultCoolifyUrl: this.coolify().url,
    };
  }

  /** Crea el administrador y guarda Coolify. Devuelve el usuario para iniciar sesión. */
  async completeSetup(input: SetupInput): Promise<string> {
    if (this.isSetupComplete() || !this.setupCode) throw new AppError(409, "V-HUB ya está configurado");
    if (!safeEqual(input.code.trim().toUpperCase(), this.setupCode)) {
      this.audit.log("setup.failed", input.username);
      throw new AppError(401, "Código de instalación incorrecto. Lo encontrarás al final de la instalación o con: docker logs vhub");
    }
    if (input.password.length < MIN_PASSWORD) throw new BadRequestError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);

    const patch: Partial<StoredSettings> = {
      adminUser: input.username,
      adminPasswordHash: hashPassword(input.password),
    };
    if (!this.env.coolifyToken) {
      const url = (input.coolifyUrl || DEFAULT_COOLIFY_URL).trim();
      const token = (input.coolifyToken ?? "").trim();
      if (!token) throw new BadRequestError("Falta el token de Coolify");
      await this.probe(url, token);
      patch.coolifyUrl = url;
      patch.coolifyToken = token;
    }
    this.save(patch);
    this.setupCode = null;
    this.audit.log("setup.complete", input.username);
    return input.username;
  }

  // --- Página de Ajustes ---

  view() {
    const { url, token } = this.coolify();
    return {
      adminUser: this.adminUser(),
      coolify: {
        url,
        // Nunca devolvemos el token: sólo si existe y, si es largo, sus últimos caracteres
        tokenHint: token ? (token.length > 16 ? `…${token.slice(-4)}` : "configurado") : null,
        dbAccess: this.dbAccess(),
      },
      locked: {
        admin: Boolean(this.env.adminPassword),
        coolifyUrl: Boolean(this.env.coolifyUrl),
        coolifyToken: Boolean(this.env.coolifyToken),
        dbAccess: Boolean(this.env.dbAccess),
      },
    };
  }

  async updateCoolify(input: { url?: string; token?: string; dbAccess?: DbAccess }) {
    const patch: Partial<StoredSettings> = {};
    if (input.url !== undefined && !this.env.coolifyUrl) patch.coolifyUrl = input.url.trim();
    if (input.token && !this.env.coolifyToken) patch.coolifyToken = input.token.trim();
    if (input.dbAccess && !this.env.dbAccess) patch.dbAccess = input.dbAccess;

    // Probamos la combinación resultante antes de guardar
    if (patch.coolifyUrl !== undefined || patch.coolifyToken !== undefined) {
      const current = this.coolify();
      await this.probe(patch.coolifyUrl || current.url, patch.coolifyToken ?? current.token);
    }
    this.save(patch);
    this.audit.log("settings.coolify", undefined, { url: patch.coolifyUrl, token: patch.coolifyToken ? "cambiado" : undefined, dbAccess: patch.dbAccess });
  }

  changePassword(current: string, next: string) {
    if (this.env.adminPassword) throw new BadRequestError("La contraseña está fijada en el .env (ADMIN_PASSWORD); cámbiala allí");
    if (!this.verifyAdmin(this.adminUser(), current)) throw new BadRequestError("La contraseña actual no es correcta");
    if (next.length < MIN_PASSWORD) throw new BadRequestError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
    this.save({ adminPasswordHash: hashPassword(next) });
    this.audit.log("settings.password", this.adminUser());
  }
}
