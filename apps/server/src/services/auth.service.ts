import { AppError } from "../domain/errors.js";
import type { AuditLog } from "../domain/ports.js";
import type { SettingsService } from "./settings.service.js";

export class AuthService {
  constructor(
    private readonly audit: AuditLog,
    private readonly settings: SettingsService,
  ) {}

  /** Devuelve el usuario si las credenciales son válidas; si no, audita el intento y lanza 401. */
  login(username: string | undefined, password: string | undefined, ip: string): string {
    if (!username || !password || !this.settings.verifyAdmin(username, password)) {
      this.audit.log("auth.failed", username ?? "", { ip });
      throw new AppError(401, "Usuario o contraseña incorrectos");
    }
    this.audit.log("auth.login", username, { ip });
    return username;
  }
}
