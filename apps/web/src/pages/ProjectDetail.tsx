import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AppWindow, ArrowRightLeft, Boxes, ChevronLeft, Database, ExternalLink, Play, Plus, RotateCw, Rocket, ScrollText, Square, Table2, Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { LogDrawer } from "../components/LogViewer";
import { CreateDatabaseModal, MoveResourceModal } from "../components/projects";
import {
  Badge, Button, Card, Checkbox, ConfirmDelete, Empty, ErrorBox, Field, IconButton, Input, Loading, Modal, PageHeader, StatusBadge, useToast,
} from "../components/ui";
import { api, type ContainerInfo, type Project, type Resource } from "../lib/api";
import { bytes, pct, statusTone } from "../lib/format";
import { useContainers } from "../lib/hooks";

const TYPE_META = {
  application: { label: "Aplicación", icon: AppWindow },
  database: { label: "Base de datos", icon: Database },
  service: { label: "Servicio", icon: Boxes },
} as const;

export function ProjectDetail() {
  const { uuid } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), refetchInterval: 10_000 });
  const project = projects.data?.find((p) => p.uuid === uuid);
  const [envName, setEnvName] = useState<string | null>(null);
  const env = project?.environments.find((e) => e.name === envName) ?? project?.environments[0];
  const { byResource, stats } = useContainers();

  const [newDb, setNewDb] = useState(false);
  const [newEnv, setNewEnv] = useState(false);
  const [moving, setMoving] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [logs, setLogs] = useState<{ id: string; title: string } | null>(null);
  const [pickLogs, setPickLogs] = useState<{ resource: Resource; containers: ContainerInfo[] } | null>(null);

  const action = useMutation({
    mutationFn: ({ r, a }: { r: Resource; a: string }) => api(`/api/resources/${r.type}/${r.uuid}/${a}`, { method: "POST" }),
    onSuccess: (_d, { r, a }) => {
      const verbs: Record<string, string> = { start: "iniciando", stop: "parando", restart: "reiniciando", deploy: "desplegando", redeploy: "redesplegando" };
      toast("ok", `«${r.name}»: ${verbs[a] ?? a}…`);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["projects"] }), 2500);
    },
    onError: (e) => toast("error", (e as Error).message),
  });

  const del = useMutation({
    mutationFn: (r: Resource) => api(`/api/resources/${r.type}/${r.uuid}?volumes=${deleteVolumes}`, { method: "DELETE" }),
    onSuccess: (_d, r) => {
      toast("ok", `«${r.name}» se está borrando`);
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const openLogs = (r: Resource) => {
    const cs = byResource.get(r.uuid) ?? [];
    if (!cs.length) return toast("error", "No se encontró ningún contenedor para este recurso.");
    if (cs.length === 1) setLogs({ id: cs[0].id, title: cs[0].name });
    else setPickLogs({ resource: r, containers: cs });
  };

  const usage = useMemo(() => {
    const m = new Map<string, { cpu: number; mem: number; count: number }>();
    for (const [rUuid, cs] of byResource) {
      let cpu = 0, mem = 0, count = 0;
      for (const c of cs) {
        const s = stats.get(c.id);
        if (s) { cpu += s.cpu; mem += s.memUsed; count++; }
      }
      m.set(rUuid, { cpu, mem, count });
    }
    return m;
  }, [byResource, stats]);

  if (projects.isLoading) return <Loading />;
  if (projects.error) return <ErrorBox error={projects.error} />;
  if (!project) return <Empty title="Proyecto no encontrado"><Link className="text-brand" to="/projects">Volver a proyectos</Link></Empty>;

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ChevronLeft className="size-4" />Proyectos</Link>
      <PageHeader
        title={project.name}
        subtitle={project.description ?? `uuid ${project.uuid}`}
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setNewEnv(true)}>Entorno</Button>
            <Button variant="primary" icon={<Database className="size-4" />} onClick={() => setNewDb(true)}>Nueva base de datos</Button>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-line">
        {project.environments.map((e) => (
          <button
            key={e.id}
            onClick={() => setEnvName(e.name)}
            className={clsx("-mb-px border-b-2 px-3 py-2 text-[13px]", env?.id === e.id ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {e.name} <span className="ml-1 text-faint">{e.resources.length}</span>
          </button>
        ))}
      </div>

      {!env?.resources.length ? (
        <Empty icon={<Boxes className="size-8" />} title="Este entorno está vacío">
          Crea una base de datos desde aquí, o despliega apps y servicios desde Coolify y aparecerán automáticamente.
        </Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="text-left text-xs text-faint">
              <tr>
                <th className="px-4 py-2.5 font-medium">Recurso</th>
                <th className="px-2 py-2.5 font-medium">Estado</th>
                <th className="px-2 py-2.5 font-medium">CPU</th>
                <th className="px-2 py-2.5 font-medium">Memoria</th>
                <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {env.resources.map((r) => {
                const Meta = TYPE_META[r.type];
                const u = usage.get(r.uuid);
                const running = statusTone(r.status) === "ok" || statusTone(r.status) === "warn";
                const busy = action.isPending && action.variables?.r.uuid === r.uuid;
                return (
                  <tr key={r.uuid} className="border-t border-line hover:bg-panel-2/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-panel-2 text-muted"><Meta.icon className="size-4" /></div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            {r.name}
                            {r.subtype && <Badge>{r.subtype}</Badge>}
                          </div>
                          {r.fqdn ? (
                            <a href={r.fqdn.split(",")[0]} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
                              {r.fqdn.split(",")[0].replace(/^https?:\/\//, "")}<ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <div className="mt-0.5 text-xs text-faint">{Meta.label}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-2 py-3 tabular text-muted">{u?.count ? pct(u.cpu) : "—"}</td>
                    <td className="px-2 py-3 tabular text-muted">{u?.count ? bytes(u.mem) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        {r.type === "database" && (
                          <IconButton title="Abrir explorador" onClick={() => navigate(`/databases/${encodeURIComponent(`coolify:${r.uuid}`)}`)}><Table2 className="size-4" /></IconButton>
                        )}
                        <IconButton title="Logs en vivo" onClick={() => openLogs(r)}><ScrollText className="size-4" /></IconButton>
                        {r.type === "application" && (
                          <IconButton title="Desplegar" disabled={busy} onClick={() => action.mutate({ r, a: "deploy" })}><Rocket className="size-4" /></IconButton>
                        )}
                        {running ? (
                          <>
                            <IconButton title="Reiniciar" disabled={busy} onClick={() => action.mutate({ r, a: "restart" })}><RotateCw className="size-4" /></IconButton>
                            <IconButton title="Parar" disabled={busy} onClick={() => action.mutate({ r, a: "stop" })}><Square className="size-4" /></IconButton>
                          </>
                        ) : (
                          <IconButton title="Iniciar" disabled={busy} onClick={() => action.mutate({ r, a: "start" })}><Play className="size-4" /></IconButton>
                        )}
                        <IconButton title="Mover a otro proyecto" onClick={() => setMoving(r)}><ArrowRightLeft className="size-4" /></IconButton>
                        <IconButton title="Borrar" className="hover:text-danger" onClick={() => { setDeleteVolumes(false); setDeleting(r); }}><Trash2 className="size-4" /></IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <CreateDatabaseModal open={newDb} onClose={() => setNewDb(false)} projects={projects.data ?? []} defaultProject={project.uuid} defaultEnv={env?.name} />
      <NewEnvModal open={newEnv} onClose={() => setNewEnv(false)} projectUuid={project.uuid} onCreated={setEnvName} />
      <MoveResourceModal resource={moving} onClose={() => setMoving(null)} currentProject={project.uuid} />
      <ConfirmDelete
        open={!!deleting}
        onClose={() => { setDeleting(null); del.reset(); }}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        name={deleting?.name ?? ""}
        title={`Borrar «${deleting?.name}»`}
      >
        <p className="text-[13px] text-muted">Se borrarán los contenedores, la configuración y las redes del recurso en Coolify.</p>
        <Checkbox label="Borrar también los volúmenes (datos)" checked={deleteVolumes} onChange={setDeleteVolumes} />
        <ErrorBox error={del.error} />
      </ConfirmDelete>
      <Modal open={!!pickLogs} onClose={() => setPickLogs(null)} title={`Logs de «${pickLogs?.resource.name}»`}>
        <div className="space-y-1">
          {pickLogs?.containers.map((c) => (
            <button key={c.id} onClick={() => { setLogs({ id: c.id, title: c.name }); setPickLogs(null); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] hover:bg-panel-2">
              <span className="font-mono text-xs">{c.name}</span>
              <StatusBadge status={c.state} />
            </button>
          ))}
        </div>
      </Modal>
      <LogDrawer containerId={logs?.id ?? null} title={logs?.title ?? ""} onClose={() => setLogs(null)} />
    </>
  );
}

function NewEnvModal({ open, onClose, projectUuid, onCreated }: { open: boolean; onClose: () => void; projectUuid: string; onCreated: (name: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: () => api(`/api/projects/${projectUuid}/environments`, { method: "POST", json: { name } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      onCreated(name);
      setName("");
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo entorno"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!name.trim()} loading={m.isPending} onClick={() => m.mutate()}>Crear</Button></>}
    >
      <Field label="Nombre"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="staging" /></Field>
      <ErrorBox error={m.error} />
    </Modal>
  );
}
