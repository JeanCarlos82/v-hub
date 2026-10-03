import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../domain/errors.js";
import type { AuditLog } from "../domain/ports.js";

/** Comparación en tiempo constante (también para longitudes distintas). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export class AuthService {
  constructor(
    private readonly audit: AuditLog,
    private readonly admin: { user: string; password: string },
  ) {}

  /** Devuelve el usuario si las credenciales son válidas; si no, audita el intento y lanza 401. */
  login(username: string | undefined, password: string | undefined, ip: string): string {
    if (!username || !password || !safeEqual(username, this.admin.user) || !safeEqual(password, this.admin.password)) {
      this.audit.log("auth.failed", username ?? "", { ip });
      throw new AppError(401, "Usuario o contraseña incorrectos");
    }
    this.audit.log("auth.login", username, { ip });
    return username;
  }
}
