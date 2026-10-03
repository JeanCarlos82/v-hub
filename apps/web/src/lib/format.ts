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
