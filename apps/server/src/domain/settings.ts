export type DbAccess = "internal" | "external";

/** Ajustes que se guardan desde el panel (asistente de instalación o Ajustes). */
export interface StoredSettings {
  adminUser?: string;
  /** scrypt: "salt:hash" en hex */
  adminPasswordHash?: string;
  coolifyUrl?: string;
  coolifyToken?: string;
  dbAccess?: DbAccess;
}

/**
 * Valores fijados por variables de entorno. Si existen, tienen prioridad sobre lo guardado
 * y no se pueden cambiar desde el panel.
 */
export interface EnvSettings {
  adminUser?: string;
  adminPassword?: string;
  coolifyUrl?: string;
  coolifyToken?: string;
  dbAccess?: DbAccess;
}
