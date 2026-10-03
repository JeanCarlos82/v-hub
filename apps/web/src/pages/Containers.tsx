import { useMutation } from "@tanstack/react-query";
import { Container, Play, RotateCw, ScrollText, Search, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Meter } from "../components/Chart";
import { LogDrawer } from "../components/LogViewer";
import { Badge, Card, Checkbox, ConfirmDelete, Empty, ErrorBox, IconButton, Input, Loading, PageHeader, StatusBadge, useToast } from "../components/ui";
import { api, type ContainerInfo } from "../lib/api";
import { bytes, pct, rate } from "../lib/format";
import { useContainers } from "../lib/hooks";

export function Containers() {
  const { containers, stats, available, isLoading, error, refetch } = useContainers();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [onlyRunning, setOnlyRunning] = useState(false);
  const [logs, setLogs] = useState<ContainerInfo | null>(null);
  const [removing, setRemoving] = useState<ContainerInfo | null>(null);

  const action = useMutation({
    mutationFn: ({ c, a }: { c: ContainerInfo; a: string }) => api(`/api/containers/${c.id}/${a}`, { method: "POST" }),
    onSuccess: () => refetch(),
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

  const list = useMemo(() => {
    const term = q.toLowerCase();
    return containers
      .filter((c) => (!onlyRunning || c.state === "running") && (!term || c.name.toLowerCase().includes(term) || c.image.toLowerCase().includes(term)))
      .sort((a, b) => (a.state === b.state ? a.name.localeCompare(b.name) : a.state === "running" ? -1 : 1));
  }, [containers, q, onlyRunning]);

  return (
    <>
      <PageHeader
        title="Contenedores"
        subtitle={available ? `${containers.filter((c) => c.state === "running").length} en marcha de ${containers.length} · métricas cada 3 s` : undefined}
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : !available ? (
        <Empty icon={<Container className="size-8" />} title="Docker no disponible">
          Monta el socket <code>/var/run/docker.sock</code> en el contenedor de V-HUB.
        </Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="relative w-72 max-sm:w-full">
              <Search className="absolute left-2.5 top-2 size-4 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o imagen…" className="pl-8" />
            </div>
            <Checkbox label="Sólo en marcha" checked={onlyRunning} onChange={setOnlyRunning} />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="text-left text-xs text-faint">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Contenedor</th>
                  <th className="px-2 py-2.5 font-medium">Estado</th>
                  <th className="px-2 py-2.5 font-medium">CPU</th>
                  <th className="px-2 py-2.5 font-medium">Memoria</th>
                  <th className="px-2 py-2.5 font-medium">Red ↓ / ↑</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const s = stats.get(c.id);
                  const running = c.state === "running";
                  return (
                    <tr key={c.id} className="border-t border-line hover:bg-panel-2/50">
                      <td className="max-w-[360px] px-4 py-2.5">
                        <div className="flex items-center gap-2 truncate font-mono text-xs">
                          {c.name}
                          {c.labels["coolify.managed"] === "true" && <Badge tone="violet">coolify</Badge>}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-faint">
                          {c.image}
                          {c.ports.filter((p) => p.public).length > 0 && ` · ${[...new Set(c.ports.filter((p) => p.public).map((p) => `${p.public}→${p.private}`))].join(", ")}`}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={c.state} />
                        <div className="mt-1 text-[11px] text-faint">{c.status}</div>
                      </td>
                      <td className="w-36 px-2 py-2.5 tabular">
                        {s ? <div className="flex items-center gap-2"><span className="w-12">{pct(s.cpu)}</span><div className="w-14"><Meter value={Math.min(100, s.cpu)} /></div></div> : <span className="text-faint">—</span>}
                      </td>
                      <td className="w-40 px-2 py-2.5 tabular">
                        {s ? <><div>{bytes(s.memUsed)}</div><div className="text-[11px] text-faint">{pct(s.memPct)} del límite</div></> : <span className="text-faint">—</span>}
                      </td>
                      <td className="w-44 px-2 py-2.5 tabular text-muted">{s ? `${rate(s.rx)} / ${rate(s.tx)}` : "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <IconButton title="Logs en vivo" onClick={() => setLogs(c)}><ScrollText className="size-4" /></IconButton>
                          {running ? (
                            <>
                              <IconButton title="Reiniciar" onClick={() => action.mutate({ c, a: "restart" })}><RotateCw className="size-4" /></IconButton>
                              <IconButton title="Parar" onClick={() => action.mutate({ c, a: "stop" })}><Square className="size-4" /></IconButton>
                            </>
                          ) : (
                            <IconButton title="Iniciar" onClick={() => action.mutate({ c, a: "start" })}><Play className="size-4" /></IconButton>
                          )}
                          <IconButton title="Eliminar" className="hover:text-danger" onClick={() => setRemoving(c)}><Trash2 className="size-4" /></IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <LogDrawer containerId={logs?.id ?? null} title={logs?.name ?? ""} onClose={() => setLogs(null)} />
      <ConfirmDelete
        open={!!removing}
        onClose={() => { setRemoving(null); remove.reset(); }}
        onConfirm={() => removing && remove.mutate(removing)}
        loading={remove.isPending}
        name={removing?.name ?? ""}
        title="Eliminar contenedor"
      >
        <p className="text-[13px] text-muted">
          Se elimina el contenedor (forzado). Si lo gestiona Coolify, es mejor borrar el recurso desde su proyecto; si no, Coolify lo volverá a crear en el siguiente despliegue.
        </p>
        <ErrorBox error={remove.error} />
      </ConfirmDelete>
    </>
  );
}
