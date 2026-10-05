import clsx from "clsx";
import type { ReactNode } from "react";
import { bytes, pct } from "../lib/format";
import { Meter } from "./Chart";

/**
 * Fila de lista adaptable: en escritorio, columnas alineadas (nombre · estado · consumo · acciones);
 * en el móvil, dos líneas (nombre arriba; estado, consumo y acciones debajo) sin scroll horizontal.
 */
export function EntityRow({
  icon, title, subtitle, status, metrics, actions, muted, actionsWidth = "md:min-w-56",
}: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; status?: ReactNode; metrics?: ReactNode; actions?: ReactNode; muted?: boolean;
  /** Ancho mínimo de la columna de acciones en escritorio, para que las columnas queden alineadas entre filas */
  actionsWidth?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-line px-4 py-3 first:border-t-0 md:flex-nowrap", muted && "opacity-70")}>
      <div className="flex min-w-0 basis-full items-center gap-3 md:basis-0 md:flex-1">
        {icon && <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-panel-2 text-muted [&>svg]:size-4">{icon}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 font-medium">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
        </div>
      </div>
      {status !== undefined && <div className="shrink-0 md:w-40">{status}</div>}
      {metrics !== undefined && <div className="shrink-0 md:w-56">{metrics}</div>}
      {actions && <div className={clsx("ml-auto flex shrink-0 items-center justify-end gap-1.5", actionsWidth)}>{actions}</div>}
    </div>
  );
}

/** Hueco para filas sin consumo: alinea columnas en escritorio y no ocupa nada en el móvil */
export const NoUsage = () => <span className="text-xs text-faint max-md:hidden">—</span>;

/** CPU y memoria en una línea compacta */
export function Usage({ cpu, mem, memPct }: { cpu?: number; mem?: number; memPct?: number }) {
  if (cpu === undefined && mem === undefined) return <span className="text-xs text-faint">Sin datos de consumo</span>;
  return (
    <div className="flex items-center gap-3 whitespace-nowrap text-xs tabular text-muted">
      <span className="flex items-center gap-1.5" title="CPU (100% = un núcleo)">
        <span className="text-faint">CPU</span>
        <span className="w-11 text-fg">{pct(cpu)}</span>
        <span className="w-10 max-sm:hidden"><Meter value={Math.min(100, cpu ?? 0)} /></span>
      </span>
      <span className="flex items-center gap-1.5" title={memPct !== undefined ? `${pct(memPct)} del límite` : undefined}>
        <span className="text-faint">RAM</span>
        <span className="text-fg">{bytes(mem)}</span>
      </span>
    </div>
  );
}
