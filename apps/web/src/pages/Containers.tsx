import { useMutation } from "@tanstack/react-query";
import { Container, Pause, Play, RotateCw, ScrollText, Search, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { EntityRow, NoUsage, Usage } from "../components/EntityRow";
import { LogDrawer } from "../components/LogViewer";
import { Badge, Button, Card, ConfirmDelete, ConfirmDialog, Empty, ErrorBox, Input, Loading, Menu, PageHeader, Segmented, Spinner, StatusBadge, useToast } from "../components/ui";
import { api, type ContainerInfo } from "../lib/api";
import { dockerStatusText } from "../lib/format";
import { useContainers, useResourceIndex } from "../lib/hooks";

type Filter = "all" | "running" | "stopped";

export function Containers() {
  const { containers, stats, available, isLoading, error, refetch } = useContainers();
  const index = useResourceIndex();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [logs, setLogs] = useState<{ id: string; title: string } | null>(null);
  const [removing, setRemoving] = useState<ContainerInfo | null>(null);
  const [stopping, setStopping] = useState<ContainerInfo | null>(null);

  const action = useMutation({
    mutationFn: ({ c, a }: { c: ContainerInfo; a: string }) => api(`/api/containers/${c.id}/${a}`, { method: "POST" }),
    onSuccess: () => {
      setStopping(null);
      refetch();
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (c: ContainerInfo) => api(`/api/containers/${c.id}`, { method: "DELETE" }),
    onSuccess: (_d, c) => {
      toast("ok", `Contenedor «${c.name}» eliminado`);
      setRemoving(null);
      refetch();
    },
  });

  const runningCount = containers.filter((c) => c.state === "running").length;

  // Nombre legible: el del recurso de Coolify si lo hay; si no, el del contenedor
  const display = (c: ContainerInfo) => {
    const ref = c.coolifyUuid ? index.get(c.coolifyUuid) : undefined;
    return { ref, name: ref?.resource.name ?? c.name };
  };

  const list = useMemo(() => {
    const term = q.toLowerCase();
    return containers
      .filter((c) => (filter === "all" ? true : filter === "running" ? c.state === "running" : c.state !== "running"))
      .filter((c) => {
        if (!term) return true;
        const ref = c.coolifyUuid ? index.get(c.coolifyUuid) : undefined;
        return [c.name, c.image, ref?.resource.name, ref?.project.name].some((v) => v?.toLowerCase().includes(term));
      })
      .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === "running" ? -1 : 1));
  }, [containers, q, filter, index]);

  return (
    <>
      <PageHeader title="Contenedores" subtitle={available ? "Todo lo que corre en Docker, con su consumo en tiempo real." : undefined} />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !available ? (
        <Empty icon={<Container className="size-8" />} title="Docker no disponible">
          V-HUB necesita acceso al socket <code>/var/run/docker.sock</code>. Si lo instalaste con el instalador, ya lo tiene: revisa que el contenedor esté en marcha.
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: `Todos · ${containers.length}` },
                { id: "running", label: `En marcha · ${runningCount}` },
                { id: "stopped", label: `Parados · ${containers.length - runningCount}` },
              ]}
            />
            <div className="relative w-72 max-sm:w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, imagen o proyecto…" className="pl-8" />
            </div>
          </div>
          <Card>
            {list.map((c) => {
              const s = stats.get(c.id);
              const running = c.state === "running";
              const paused = c.state === "paused";
              const { ref, name } = display(c);
              const busy = action.isPending && action.variables?.c.id === c.id;
              const ports = [...new Set(c.ports.filter((p) => p.public).map((p) => `${p.public}→${p.private}`))];
              return (
                <EntityRow
                  key={c.id}
                  icon={<Container />}
                  muted={!running && !paused}
                  title={
                    <>
                      <span className="truncate">{name}</span>
                      {c.labels["coolify.managed"] === "true" && <Badge tone="violet">Coolify</Badge>}
                    </>
                  }
                  subtitle={
                    <>
                      {ref ? `${ref.project.name} · ${ref.environment} · ` : ""}
                      <span className="font-mono">{ref ? c.name : c.image}</span>
                      {ports.length > 0 && ` · puertos ${ports.join(", ")}`}
                    </>
                  }
                  status={
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={c.state} />
                      <span className="text-[11px] text-faint">{dockerStatusText(c.status)}</span>
                    </div>
                  }
                  metrics={running ? (s ? <Usage cpu={s.cpu} mem={s.memUsed} memPct={s.memPct} /> : <span className="text-xs text-faint">Midiendo…</span>) : <NoUsage />}
                  actions={
                    <>
                      {busy && <Spinner className="mr-1" />}
                      {running ? (
                        <Button size="sm" icon={<RotateCw className="size-3.5" />} disabled={busy} onClick={() => action.mutate({ c, a: "restart" })}>Reiniciar</Button>
                      ) : paused ? (
                        <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={busy} onClick={() => action.mutate({ c, a: "unpause" })}>Reanudar</Button>
                      ) : (
                        <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={busy} onClick={() => action.mutate({ c, a: "start" })}>Iniciar</Button>
                      )}
                      <Button size="sm" icon={<ScrollText className="size-3.5" />} onClick={() => setLogs({ id: c.id, title: name })}>Logs</Button>
                      <Menu
                        title={name}
                        items={[
                          { label: "Parar…", icon: <Square />, onSelect: () => setStopping(c), hidden: !running && !paused },
                          { label: "Pausar", icon: <Pause />, onSelect: () => action.mutate({ c, a: "pause" }), hidden: !running },
                          { label: "Eliminar…", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(c) },
                        ]}
                      />
                    </>
                  }
                />
              );
            })}
            {list.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-muted">
                {q ? `Ningún contenedor coincide con «${q}».` : filter === "stopped" ? "No hay contenedores parados." : "No hay contenedores en marcha."}
              </div>
            )}
          </Card>
        </>
      )}
      <LogDrawer containerId={logs?.id ?? null} title={logs?.title ?? ""} onClose={() => setLogs(null)} />
      <ConfirmDialog
        open={!!stopping}
        onClose={() => setStopping(null)}
        onConfirm={() => stopping && action.mutate({ c: stopping, a: "stop" })}
        loading={action.isPending}
        title={`¿Parar «${stopping ? display(stopping).name : ""}»?`}
        confirmLabel="Parar"
        danger
      >
        <p className="text-[13px] text-muted">
          Dejará de funcionar hasta que lo inicies de nuevo.
          {stopping?.labels["coolify.managed"] === "true" && " Lo gestiona Coolify: es mejor pararlo desde su proyecto para que Coolify sepa que está parado."}
        </p>
      </ConfirmDialog>
      <ConfirmDelete
        open={!!removing}
        onClose={() => { setRemoving(null); remove.reset(); }}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        name={removing?.name ?? ""}
        title="Eliminar contenedor"
      >
        <p className="text-[13px] text-muted">
          Se elimina el contenedor aunque esté en marcha. Si lo gestiona Coolify, es mejor borrar el recurso desde su proyecto: si no, Coolify lo volverá a crear en el siguiente despliegue.
        </p>
        <ErrorBox error={remove.error} />
      </ConfirmDelete>
    </>
  );
}
