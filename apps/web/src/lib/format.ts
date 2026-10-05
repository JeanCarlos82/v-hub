export function bytes(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
}

export const rate = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${bytes(n)}/s`);
export const pct = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : `${n.toFixed(digits)}%`;

export function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function number(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("es-ES").format(n);
}

export function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(ts).toLocaleString("es-ES");
}

/** Estados de Coolify: "running:healthy", "exited:unhealthy", "running"... */
export function statusTone(status: string | undefined): "ok" | "warn" | "down" | "idle" {
  const s = (status ?? "").toLowerCase();
  if (s.startsWith("running")) return s.includes("unhealthy") ? "warn" : "ok";
  if (s.includes("restarting") || s.includes("starting") || s.includes("degraded")) return "warn";
  if (s.startsWith("exited") || s.includes("dead") || s.includes("stopped")) return "down";
  return "idle";
}

/** Estado legible en español a partir del estado de Coolify ("running:healthy") o de Docker ("exited"). */
export function statusLabel(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (!s) return "Desconocido";
  if (s.startsWith("running")) return s.includes("unhealthy") ? "Con fallos" : "En marcha";
  if (s.includes("restarting")) return "Reiniciando";
  if (s.includes("starting") || s === "created") return s === "created" ? "Creado" : "Arrancando";
  if (s.includes("degraded")) return "Degradado";
  if (s.startsWith("paused")) return "En pausa";
  if (s.startsWith("exited") || s.includes("stopped")) return "Parado";
  if (s.includes("dead")) return "Caído";
  if (s.includes("removing")) return "Borrándose";
  return status ?? "Desconocido";
}

const DOCKER_UNITS: [RegExp, string][] = [
  [/^less than a second$/, "un momento"],
  [/^about a minute$/, "un minuto"],
  [/^about an hour$/, "una hora"],
  [/^(\d+) seconds?$/, "$1 s"],
  [/^(\d+) minutes?$/, "$1 min"],
  [/^(\d+) hours?$/, "$1 h"],
  [/^(\d+) days?$/, "$1 días"],
  [/^(\d+) weeks?$/, "$1 semanas"],
  [/^(\d+) months?$/, "$1 meses"],
  [/^(\d+) years?$/, "$1 años"],
];
const dockerSpan = (t: string) => {
  const v = t.trim().toLowerCase();
  for (const [re, out] of DOCKER_UNITS) if (re.test(v)) return v.replace(re, out);
  return t;
};

/** "Up 3 hours (healthy)" → "Activo hace 3 h" · "Exited (0) 2 days ago" → "Parado hace 2 días" */
export function dockerStatusText(status: string): string {
  let m = status.match(/^Up (.+?)(?: \((?:healthy|unhealthy|health: starting|Paused)\))?$/i);
  if (m) return `Activo hace ${dockerSpan(m[1])}`;
  m = status.match(/^Exited \((\d+)\) (.+) ago$/i);
  if (m) return `Parado hace ${dockerSpan(m[2])}${m[1] !== "0" ? ` · código ${m[1]}` : ""}`;
  if (/^Created$/i.test(status)) return "Creado, sin arrancar";
  m = status.match(/^Restarting \((\d+)\) (.+) ago$/i);
  if (m) return `Reiniciándose (código ${m[1]})`;
  return status;
}

/** Descripción humana de las acciones de la auditoría */
const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Inicio de sesión",
  "auth.failed": "Intento de acceso fallido",
  "setup.complete": "Instalación completada",
  "setup.failed": "Código de instalación incorrecto",
  "settings.coolify": "Conexión con Coolify cambiada",
  "settings.password": "Contraseña cambiada",
  "project.create": "Proyecto creado",
  "project.update": "Proyecto editado",
  "project.delete": "Proyecto borrado",
  "project.delete.cascade": "Proyecto borrado con sus recursos",
  "project.merge": "Proyectos unidos",
  "environment.create": "Entorno creado",
  "environment.delete": "Entorno borrado",
  "resource.start": "Recurso iniciado",
  "resource.stop": "Recurso parado",
  "resource.restart": "Recurso reiniciado",
  "resource.deploy": "Despliegue lanzado",
  "resource.redeploy": "Redespliegue lanzado",
  "resource.move": "Recurso movido",
  "resource.delete": "Recurso borrado",
  "database.create": "Base de datos creada",
  "connection.create": "Conexión externa añadida",
  "connection.delete": "Conexión externa quitada",
  "explorer.query": "Consulta en el explorador",
  "container.start": "Contenedor iniciado",
  "container.stop": "Contenedor parado",
  "container.restart": "Contenedor reiniciado",
  "container.pause": "Contenedor en pausa",
  "container.unpause": "Contenedor reanudado",
  "container.remove": "Contenedor eliminado",
};
export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action;
