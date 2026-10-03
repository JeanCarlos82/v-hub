import { useMemo, useRef, useState } from "react";

export interface Series {
  label: string;
  color: string;
  values: number[];
}

/** Gráfica de área SVG ligera con tooltip; pensada para series en vivo. */
export function AreaChart({
  series, timestamps, height = 140, max, format = (v) => v.toFixed(1),
}: { series: Series[]; timestamps: number[]; height?: number; max?: number; format?: (v: number) => string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const n = timestamps.length;
  const top = useMemo(() => {
    if (max !== undefined) return max;
    const m = Math.max(1, ...series.flatMap((s) => s.values));
    return m * 1.15;
  }, [series, max]);

  const x = (i: number) => (n <= 1 ? width : (i / (n - 1)) * width);
  const y = (v: number) => height - (Math.min(v, top) / top) * (height - 4) - 2;

  const paths = series.map((s) => {
    if (!s.values.length) return { line: "", area: "" };
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const line = `M${pts.join("L")}`;
    return { line, area: `${line}L${x(s.values.length - 1)},${height}L0,${height}Z` };
  });

  function onMove(e: React.MouseEvent) {
    const rect = ref.current!.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={width} y1={height * f} y2={height * f} stroke="var(--color-line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        {paths.map((p, i) => (
          <g key={series[i].label}>
            <path d={p.area} fill={series[i].color} opacity={0.12} />
            <path d={p.line} fill="none" stroke={series[i].color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--color-muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && timestamps[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-md border border-line-strong bg-panel-2/95 px-2 py-1.5 text-xs shadow-lg"
          style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%`, transform: hover > n / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)" }}
        >
          <div className="mb-1 text-faint">{new Date(timestamps[hover]).toLocaleTimeString("es-ES")}</div>
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 tabular whitespace-nowrap">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              <span className="text-muted">{s.label}</span>
              <span className="ml-auto pl-3 font-medium">{format(s.values[hover] ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barra de uso horizontal */
export function Meter({ value, tone }: { value: number; tone?: "auto" | "brand" }) {
  const color =
    tone === "brand" ? "var(--color-brand)" : value > 90 ? "var(--color-danger)" : value > 75 ? "var(--color-warn)" : "var(--color-brand)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}
