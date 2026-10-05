import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Activity, CircleAlert, CircleCheck, Container, Cpu, FolderKanban, HardDrive, MemoryStick, Network, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { AreaChart, Meter } from "../components/Chart";
import { EntityRow, Usage } from "../components/EntityRow";
import { Badge, ButtonLink, Card, PageHeader, Segmented, StatusDot } from "../components/ui";
import { api, type HostSample, type MinuteSample, type Project, type SystemStatus } from "../lib/api";
import { bytes, duration, pct, rate, statusTone } from "../lib/format";
import { useContainers, useResourceIndex } from "../lib/hooks";
import { useTopic } from "../lib/realtime";

type Range = "live" | "1h" | "24h" | "7d";
const RANGES: { id: Range; label: string }[] = [
  { id: "live", label: "En vivo" },
  { id: "1h", label: "1 hora" },
  { id: "24h", label: "24 horas" },
  { id: "7d", label: "7 días" },
];

interface Point { ts: number; cpu: number; mem: number; rx: number; tx: number }
interface Issue { tone: "down" | "warn"; text: string; to?: string; action?: string }

export function Dashboard() {
  const [range, setRange] = useState<Range>("live");
  const [live, setLive] = useState<HostSample[]>([]);

  const status = useQuery({ queryKey: ["status"], queryFn: () => api<SystemStatus>("/api/system/status"), refetchInterval: 30_000 });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), retry: false, refetchInterval: 30_000 });
  const history = useQuery({
    queryKey: ["metrics", range],
    queryFn: () => api<{ samples: (HostSample | MinuteSample)[] }>(`/api/system/metrics?range=${range}`),
    refetchInterval: range === "live" ? false : 60_000,
  });
  const { containers, stats } = useContainers();
  const index = useResourceIndex();

  useEffect(() => {
    if (range === "live" && history.data) setLive(history.data.samples as HostSample[]);
  }, [range, history.data]);

  useTopic<HostSample>("host", (s) => setLive((prev) => [...prev.slice(-449), s]));

  const current = live.at(-1) ?? status.data?.host ?? null;

  const points: Point[] = useMemo(() => {
    if (range === "live") return live.map((s) => ({ ts: s.ts, cpu: s.cpu, mem: s.mem.pct, rx: s.net.rx, tx: s.net.tx }));
    return ((history.data?.samples ?? []) as MinuteSample[]).map((s) => ({ ts: s.ts, cpu: s.cpu, mem: s.mem, rx: s.rx, tx: s.tx }));
  }, [range, live, history.data]);
  const ts = points.map((p) => p.ts);

  const resources = useMemo(() => (projects.data ?? []).flatMap((p) => p.environments.flatMap((e) => e.resources)), [projects.data]);
  const counts = {
    projects: projects.data?.length ?? 0,
    resources: resources.length,
    running: resources.filter((r) => statusTone(r.status) === "ok").length,
    unhealthy: resources.filter((r) => statusTone(r.status) === "warn"),
    down: resources.filter((r) => statusTone(r.status) === "down"),
  };

  // Lo que conviene revisar, de más a menos grave
  const issues: Issue[] = [];
  if (status.data) {
    const c = status.data.coolify;
    if (!c.configured) issues.push({ tone: "warn", text: "Coolify no está conectado, así que no verás tus proyectos.", to: "/settings", action: "Conectar" });
    else if (!c.reachable) issues.push({ tone: "down", text: `No se puede contactar con Coolify${c.error ? `: ${c.error}` : "."}`, to: "/settings", action: "Revisar" });
    if (!status.data.docker.available) issues.push({ tone: "warn", text: "V-HUB no tiene acceso a Docker: no hay métricas ni logs de contenedores." });
  }
  const names = (list: { name: string }[]) => list.slice(0, 3).map((r) => r.name).join(", ") + (list.length > 3 ? ` y ${list.length - 3} más` : "");
  if (counts.down.length)
    issues.push({ tone: "down", text: `${counts.down.length === 1 ? "1 recurso parado" : `${counts.down.length} recursos parados`}: ${names(counts.down)}`, to: "/projects", action: "Ver" });
  if (counts.unhealthy.length)
    issues.push({ tone: "warn", text: `${counts.unhealthy.length === 1 ? "1 recurso con fallos" : `${counts.unhealthy.length} recursos con fallos`}: ${names(counts.unhealthy)}`, to: "/projects", action: "Ver" });
  if (current) {
    if (current.disk.pct > 90) issues.push({ tone: "down", text: `El disco está casi lleno (${pct(current.disk.pct, 0)}).` });
    if (current.mem.pct > 90) issues.push({ tone: "warn", text: `La memoria está casi llena (${pct(current.mem.pct, 0)}).`, to: "/containers", action: "Ver consumo" });
    if (current.cpu > 90) issues.push({ tone: "warn", text: `La CPU está al ${pct(current.cpu, 0)}.`, to: "/containers", action: "Ver consumo" });
  }
  issues.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "down" ? -1 : 1));

  const top = useMemo(() => {
    const byId = new Map(containers.map((c) => [c.id, c]));
    return [...stats.values()]
      .map((s) => ({ ...s, info: byId.get(s.id) }))
      .sort((a, b) => b.cpu - a.cpu || b.memUsed - a.memUsed)
      .slice(0, 6);
  }, [stats, containers]);

  const running = containers.filter((c) => c.state === "running").length;

  return (
    <>
      <PageHeader
        title="Resumen"
        subtitle={
          current ? (
            <>
              {current.cores} núcleos · encendido hace {duration(current.uptime)}
              <span className="max-sm:hidden"> · carga {current.load.map((l) => l.toFixed(2)).join(" / ")}</span>
            </>
          ) : (
            "Conectando con el servidor…"
          )
        }
      />

      <HealthBanner loading={status.isLoading} issues={issues} summary={`${counts.running} recursos en marcha · ${running} contenedores activos`} />

      <div className="mt-4 grid grid-cols-4 gap-3 max-xl:grid-cols-2 max-sm:gap-2">
        <Stat icon={<Cpu />} label="CPU" value={pct(current?.cpu)} meter={current?.cpu} />
        <Stat icon={<MemoryStick />} label="Memoria" value={pct(current?.mem.pct)} detail={current && `${bytes(current.mem.used)} de ${bytes(current.mem.total)}`} meter={current?.mem.pct} />
        <Stat icon={<HardDrive />} label="Disco" value={pct(current?.disk.pct)} detail={current && `${bytes(current.disk.used)} de ${bytes(current.disk.total)}`} meter={current?.disk.pct} />
        <Stat icon={<Network />} label="Red" value={current ? `↓ ${rate(current.net.rx)}` : "—"} detail={current && `↑ ${rate(current.net.tx)} de subida`} />
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Historial</h2>
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </div>
      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
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

      <div className="mt-6 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
        <Card className="col-span-2 max-lg:col-span-1">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-medium">Lo que más consume</h3>
            <Link to="/containers" className="text-xs text-muted hover:text-fg pointer-coarse:py-1">Ver contenedores →</Link>
          </div>
          {top.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-muted">
              {status.data?.docker.available === false ? "Docker no está disponible para V-HUB." : running === 0 && containers.length ? "No hay contenedores en marcha." : "Recogiendo estadísticas…"}
            </div>
          ) : (
            top.map((c) => {
              const ref = c.info?.coolifyUuid ? index.get(c.info.coolifyUuid) : undefined;
              return (
                <EntityRow
                  key={c.id}
                  icon={<Container />}
                  title={<span className="truncate">{ref?.resource.name ?? c.info?.name ?? c.id.slice(0, 12)}</span>}
                  subtitle={ref ? `${ref.project.name} · ${ref.environment}` : c.info?.image}
                  metrics={<Usage cpu={c.cpu} mem={c.memUsed} memPct={c.memPct} />}
                />
              );
            })
          )}
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 font-medium"><FolderKanban className="size-4 text-muted" />Coolify</div>
            {status.data && !status.data.coolify.configured ? (
              <div className="space-y-3">
                <p className="text-[13px] text-muted">Conecta tu Coolify para ver y gestionar tus proyectos.</p>
                <ButtonLink to="/settings" variant="primary" size="sm">Conectar Coolify</ButtonLink>
              </div>
            ) : status.data ? (
              <div className="space-y-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <StatusDot status={status.data.coolify.reachable ? "running" : "exited"} />
                  {status.data.coolify.reachable ? <>Conectado <Badge>v{status.data.coolify.version}</Badge></> : "Sin conexión"}
                </div>
                {projects.data && (
                  <div className="grid grid-cols-2 gap-2">
                    <Mini label="Proyectos" value={counts.projects} to="/projects" />
                    <Mini label="Recursos" value={counts.resources} to="/projects" />
                    <Mini label="En marcha" value={counts.running} tone="ok" />
                    <Mini label="Parados" value={counts.down.length} tone={counts.down.length ? "down" : undefined} />
                  </div>
                )}
              </div>
            ) : null}
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 font-medium"><Activity className="size-4 text-muted" />Docker</div>
            {status.data?.docker.available ? (
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <Mini label="Contenedores" value={status.data.docker.containers ?? 0} to="/containers" />
                <Mini label="En marcha" value={status.data.docker.running ?? 0} tone="ok" />
                <div className="col-span-2 text-xs text-faint">Docker {status.data.docker.version}</div>
              </div>
            ) : (
              <p className="text-[13px] text-muted">V-HUB no tiene acceso al socket de Docker.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/** Estado general: verde si todo va bien, o la lista de cosas que revisar. */
function HealthBanner({ loading, issues, summary }: { loading: boolean; issues: Issue[]; summary: string }) {
  if (loading) return <Card className="h-[58px] animate-pulse" />;
  if (!issues.length)
    return (
      <Card className="flex items-center gap-3 border-brand/25 bg-brand/[0.05] px-4 py-3">
        <CircleCheck className="size-5 shrink-0 text-brand" />
        <div className="min-w-0">
          <div className="font-medium">Todo funciona correctamente</div>
          <div className="text-xs text-muted">{summary}</div>
        </div>
      </Card>
    );
  const worst = issues[0].tone;
  return (
    <Card className={clsx("overflow-hidden", worst === "down" ? "border-danger/30" : "border-warn/30")}>
      <div className={clsx("flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium", worst === "down" ? "bg-danger/8 text-danger" : "bg-warn/8 text-warn")}>
        {worst === "down" ? <CircleAlert className="size-4" /> : <TriangleAlert className="size-4" />}
        {issues.length === 1 ? "Hay 1 cosa que revisar" : `Hay ${issues.length} cosas que revisar`}
      </div>
      {issues.map((i) => (
        <div key={i.text} className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[13px]">
          <span className={clsx("size-1.5 shrink-0 rounded-full", i.tone === "down" ? "bg-danger" : "bg-warn")} />
          <span className="min-w-0 flex-1">{i.text}</span>
          {i.to && <ButtonLink to={i.to} size="sm" className="shrink-0">{i.action ?? "Ver"}</ButtonLink>}
        </div>
      ))}
    </Card>
  );
}

function Stat({ icon, label, value, detail, meter }: { icon: React.ReactNode; label: string; value: string; detail?: string | null; meter?: number }) {
  return (
    <Card className="p-4 max-sm:p-3">
      <div className="flex items-center gap-2 text-[13px] text-muted [&>svg]:size-4">{icon}{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular tracking-tight max-sm:mt-1.5 max-sm:text-xl">{value}</div>
      <div className="mt-1 h-4 truncate text-xs text-muted tabular">{detail}</div>
      {meter !== undefined && <div className="mt-2"><Meter value={meter} /></div>}
    </Card>
  );
}

function ChartCard({ title, legend, children }: { title: string; legend: [string, string][]; children: React.ReactNode }) {
  return (
    <Card className="p-4 max-sm:p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium">{title}</h3>
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

function Mini({ label, value, tone, to }: { label: string; value: number; tone?: "ok" | "down"; to?: string }) {
  const body = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx("text-lg font-semibold tabular", tone === "ok" && "text-brand", tone === "down" && "text-danger")}>{value}</div>
    </>
  );
  return to ? (
    <Link to={to} className="rounded-md bg-panel-2 px-3 py-2 transition-colors hover:bg-line">{body}</Link>
  ) : (
    <div className="rounded-md bg-panel-2 px-3 py-2">{body}</div>
  );
}

