import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Activity, Cpu, FolderKanban, HardDrive, MemoryStick, Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AreaChart, Meter } from "../components/Chart";
import { Badge, Card, ErrorBox, PageHeader, StatusDot } from "../components/ui";
import { api, type HostSample, type MinuteSample, type Project, type SystemStatus } from "../lib/api";
import { bytes, duration, pct, rate } from "../lib/format";
import { useContainers } from "../lib/hooks";
import { useTopic } from "../lib/realtime";

type Range = "live" | "1h" | "24h" | "7d";
const RANGES: { id: Range; label: string }[] = [
  { id: "live", label: "En vivo" },
  { id: "1h", label: "1 h" },
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 días" },
];

interface Point { ts: number; cpu: number; mem: number; rx: number; tx: number; load1: number }

export function Dashboard() {
  const [range, setRange] = useState<Range>("live");
  const [live, setLive] = useState<HostSample[]>([]);

  const status = useQuery({ queryKey: ["status"], queryFn: () => api<SystemStatus>("/api/system/status"), refetchInterval: 30_000 });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), retry: false });
  const history = useQuery({
    queryKey: ["metrics", range],
    queryFn: () => api<{ samples: (HostSample | MinuteSample)[] }>(`/api/system/metrics?range=${range}`),
    refetchInterval: range === "live" ? false : 60_000,
  });
  const { containers, stats } = useContainers();

  useEffect(() => {
    if (range === "live" && history.data) setLive(history.data.samples as HostSample[]);
  }, [range, history.data]);

  useTopic<HostSample>("host", (s) => setLive((prev) => [...prev.slice(-449), s]));

  const current = live.at(-1) ?? status.data?.host ?? null;

  const points: Point[] = useMemo(() => {
    if (range === "live")
      return live.map((s) => ({ ts: s.ts, cpu: s.cpu, mem: s.mem.pct, rx: s.net.rx, tx: s.net.tx, load1: s.load[0] }));
    return ((history.data?.samples ?? []) as MinuteSample[]).map((s) => ({ ts: s.ts, cpu: s.cpu, mem: s.mem, rx: s.rx, tx: s.tx, load1: s.load1 }));
  }, [range, live, history.data]);

  const ts = points.map((p) => p.ts);
  const counts = useMemo(() => {
    const all = (projects.data ?? []).flatMap((p) => p.environments.flatMap((e) => e.resources));
    return {
      projects: projects.data?.length ?? 0,
      resources: all.length,
      running: all.filter((r) => r.status.startsWith("running")).length,
      down: all.filter((r) => r.status.startsWith("exited")).length,
    };
  }, [projects.data]);

  const top = useMemo(() => {
    const names = new Map(containers.map((c) => [c.id, c.name]));
    return [...stats.values()]
      .map((s) => ({ ...s, name: names.get(s.id) ?? s.id.slice(0, 12) }))
      .sort((a, b) => b.cpu - a.cpu || b.memUsed - a.memUsed)
      .slice(0, 8);
  }, [stats, containers]);

  return (
    <>
      <PageHeader
        title="Resumen del servidor"
        subtitle={current ? `${current.cores} núcleos · encendido hace ${duration(current.uptime)} · carga ${current.load.map((l) => l.toFixed(2)).join(" / ")}` : "Conectando…"}
        actions={
          <div className="flex rounded-md border border-line-strong bg-panel p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={clsx("h-7 rounded px-2.5 text-xs font-medium", range === r.id ? "bg-line text-fg" : "text-muted hover:text-fg")}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1">
        <Stat icon={<Cpu className="size-4" />} label="CPU" value={pct(current?.cpu)} meter={current?.cpu ?? 0} />
        <Stat
          icon={<MemoryStick className="size-4" />}
          label="Memoria"
          value={pct(current?.mem.pct)}
          detail={current ? `${bytes(current.mem.used)} de ${bytes(current.mem.total)}` : undefined}
          meter={current?.mem.pct ?? 0}
        />
        <Stat
          icon={<HardDrive className="size-4" />}
          label="Disco"
          value={pct(current?.disk.pct)}
          detail={current ? `${bytes(current.disk.used)} de ${bytes(current.disk.total)}` : undefined}
          meter={current?.disk.pct ?? 0}
        />
        <Stat
          icon={<Network className="size-4" />}
          label="Red"
          value={current ? `↓ ${rate(current.net.rx)}` : "—"}
          detail={current ? `↑ ${rate(current.net.tx)}` : undefined}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <ChartCard title="CPU y memoria" legend={[["CPU", "var(--color-brand)"], ["Memoria", "var(--color-info)"]]}>
          <AreaChart
            timestamps={ts}
            max={100}
            format={(v) => `${v.toFixed(1)}%`}
            series={[
              { label: "CPU", color: "var(--color-brand)", values: points.map((p) => p.cpu) },
              { label: "Memoria", color: "var(--color-info)", values: points.map((p) => p.mem) },
            ]}
          />
        </ChartCard>
        <ChartCard title="Tráfico de red" legend={[["Entrada", "var(--color-violet)"], ["Salida", "var(--color-warn)"]]}>
          <AreaChart
            timestamps={ts}
            format={(v) => rate(v)}
            series={[
              { label: "Entrada", color: "var(--color-violet)", values: points.map((p) => p.rx) },
              { label: "Salida", color: "var(--color-warn)", values: points.map((p) => p.tx) },
            ]}
          />
        </ChartCard>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        <Card className="col-span-2 max-lg:col-span-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-medium">Contenedores con más consumo</h3>
            <Link to="/containers" className="text-xs text-muted hover:text-fg">Ver todos →</Link>
          </div>
          {top.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted">
              {status.data?.docker.available === false ? "Docker no está disponible para V-HUB." : "Recogiendo estadísticas…"}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-left text-xs text-faint">
                <tr>
                  <th className="px-4 py-2 font-medium">Contenedor</th>
                  <th className="px-2 py-2 font-medium">CPU</th>
                  <th className="px-2 py-2 font-medium">Memoria</th>
                  <th className="px-4 py-2 text-right font-medium">Red ↓/↑</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="max-w-0 truncate px-4 py-2 font-mono text-xs">{c.name}</td>
                    <td className="w-32 px-2 py-2 tabular">
                      <div className="flex items-center gap-2"><span className="w-12">{pct(c.cpu)}</span><div className="w-14"><Meter value={Math.min(100, c.cpu)} /></div></div>
                    </td>
                    <td className="w-28 px-2 py-2 tabular">{bytes(c.memUsed)}</td>
                    <td className="w-44 px-4 py-2 text-right tabular text-muted">{rate(c.rx)} / {rate(c.tx)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 font-medium"><FolderKanban className="size-4 text-muted" />Coolify</div>
            {status.data && !status.data.coolify.configured && (
              <p className="text-[13px] text-muted">Configura <code className="text-fg">COOLIFY_URL</code> y <code className="text-fg">COOLIFY_TOKEN</code> para gestionar proyectos.</p>
            )}
            {status.data?.coolify.configured && (
              <div className="space-y-2 text-[13px]">
                <div className="flex items-center gap-2">
                  <StatusDot status={status.data.coolify.reachable ? "running" : "exited"} />
                  {status.data.coolify.reachable ? <>Conectado <Badge>v{status.data.coolify.version}</Badge></> : "Sin conexión"}
                </div>
                <ErrorBox error={status.data.coolify.error} />
                {projects.data && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Mini label="Proyectos" value={counts.projects} />
                    <Mini label="Recursos" value={counts.resources} />
                    <Mini label="En marcha" value={counts.running} tone="ok" />
                    <Mini label="Parados" value={counts.down} tone={counts.down ? "down" : undefined} />
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 font-medium"><Activity className="size-4 text-muted" />Docker</div>
            {status.data?.docker.available ? (
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <Mini label="Contenedores" value={status.data.docker.containers ?? 0} />
                <Mini label="En marcha" value={status.data.docker.running ?? 0} tone="ok" />
                <div className="col-span-2 text-xs text-faint">Docker {status.data.docker.version}</div>
              </div>
            ) : (
              <p className="text-[13px] text-muted">No se encontró el socket de Docker.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ icon, label, value, detail, meter }: { icon: React.ReactNode; label: string; value: string; detail?: string; meter?: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[13px] text-muted">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular tracking-tight">{value}</div>
      <div className="mt-1 h-4 text-xs text-muted tabular">{detail}</div>
      {meter !== undefined && <div className="mt-2"><Meter value={meter} /></div>}
    </Card>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend: [string, string][]; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        <div className="flex gap-3 text-xs text-muted">
          {legend.map(([l, c]) => (
            <span key={l} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>
          ))}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "ok" | "down" }) {
  return (
    <div className="rounded-md bg-panel-2 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx("text-lg font-semibold tabular", tone === "ok" && "text-brand", tone === "down" && "text-danger")}>{value}</div>
    </div>
  );
}
