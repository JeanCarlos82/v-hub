import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AppWindow, ArrowRightLeft, Boxes, Database, ExternalLink, Play, Plus, RotateCw, Rocket, ScrollText, Square, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { EntityRow, NoUsage, Usage } from "../components/EntityRow";
import { LogDrawer } from "../components/LogViewer";
import { CreateDatabaseModal, MoveResourceModal } from "../components/projects";
import {
  Badge, Button, Card, Checkbox, ConfirmDelete, ConfirmDialog, Empty, ErrorBox, Field, Input, Loading, Menu, Modal, PageHeader, Spinner, StatusBadge, useToast,
} from "../components/ui";
import { api, type ContainerInfo, type Project, type Resource } from "../lib/api";
import { statusTone } from "../lib/format";
import { useContainers } from "../lib/hooks";

const TYPE_META = {
  application: { label: "Aplicación", icon: AppWindow },
  database: { label: "Base de datos", icon: Database },
  service: { label: "Servicio", icon: Boxes },
} as const;

type Action = "start" | "stop" | "restart" | "deploy" | "redeploy";
const VERBS: Record<Action, string> = { start: "iniciando", stop: "parando", restart: "reiniciando", deploy: "desplegando", redeploy: "redesplegando" };

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
  const [stopping, setStopping] = useState<Resource | null>(null);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [logs, setLogs] = useState<{ id: string; title: string } | null>(null);
  const [pickLogs, setPickLogs] = useState<{ resource: Resource; containers: ContainerInfo[] } | null>(null);

  const action = useMutation({
    mutationFn: ({ r, a }: { r: Resource; a: Action }) => api(`/api/resources/${r.type}/${r.uuid}/${a}`, { method: "POST" }),
    onSuccess: (_d, { r, a }) => {
      toast("ok", `«${r.name}»: ${VERBS[a]}…`);
      setStopping(null);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["projects"] }), 2500);
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const run = (r: Resource, a: Action) => action.mutate({ r, a });

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
    if (cs.length === 1) setLogs({ id: cs[0].id, title: r.name });
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
  if (!project)
    return (
      <Empty title="Proyecto no encontrado" action={<Link className="text-brand" to="/projects">Volver a proyectos</Link>}>
        Puede que se haya borrado o unido a otro proyecto.
      </Empty>
    );

  const total = project.environments.reduce((a, e) => a + e.resources.length, 0);

  return (
    <>
      <PageHeader
        back={{ to: "/projects", label: "Proyectos" }}
        title={project.name}
        subtitle={project.description || `${project.environments.length} entorno${project.environments.length !== 1 ? "s" : ""} · ${total} recurso${total !== 1 ? "s" : ""}`}
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => setNewEnv(true)}>Nuevo entorno</Button>
            <Button variant="primary" icon={<Database className="size-4" />} onClick={() => setNewDb(true)}>Nueva base de datos</Button>
          </>
        }
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" role="tablist">
        {project.environments.map((e) => {
          const down = e.resources.filter((r) => statusTone(r.status) === "down").length;
          return (
            <button
              key={e.id}
              role="tab"
              aria-selected={env?.id === e.id}
              onClick={() => setEnvName(e.name)}
              className={clsx(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] pointer-coarse:py-3",
                env?.id === e.id ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {e.name}
              <span className="rounded bg-line px-1.5 text-[11px] text-muted">{e.resources.length}</span>
              {down > 0 && <span className="size-1.5 rounded-full bg-danger" title={`${down} parado${down > 1 ? "s" : ""}`} />}
            </button>
          );
        })}
      </div>

      {!env?.resources.length ? (
        <Empty
          icon={<Boxes className="size-8" />}
          title="Este entorno está vacío"
          action={<Button icon={<Database className="size-4" />} onClick={() => setNewDb(true)}>Crear una base de datos</Button>}
        >
          Las apps y servicios que despliegues desde Coolify aparecerán aquí solos.
        </Empty>
      ) : (
        <Card>
          {env.resources.map((r) => {
            const Meta = TYPE_META[r.type];
            const u = usage.get(r.uuid);
            const tone = statusTone(r.status);
            const running = tone === "ok" || tone === "warn";
            const busy = action.isPending && action.variables?.r.uuid === r.uuid;
            const url = r.fqdn?.split(",")[0];
            return (
              <EntityRow
                key={r.uuid}
                icon={<Meta.icon />}
                title={
                  <>
                    <span className="truncate">{r.name}</span>
                    {r.subtype && <Badge className="max-sm:hidden">{r.subtype}</Badge>}
                  </>
                }
                subtitle={
                  url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-brand">
                      {url.replace(/^https?:\/\//, "")}<ExternalLink className="size-3" />
                    </a>
                  ) : (
                    `${Meta.label}${r.subtype ? ` · ${r.subtype}` : ""}`
                  )
                }
                status={<StatusBadge status={r.status} />}
                metrics={running && u?.count ? <Usage cpu={u.cpu} mem={u.mem} /> : running ? <span className="text-xs text-faint">Sin datos de consumo</span> : <NoUsage />}
                actionsWidth="md:min-w-80"
                actions={
                  <>
                    {busy && <Spinner className="mr-1" />}
                    {!running && (
                      <Button size="sm" variant="primary" icon={<Play className="size-3.5" />} disabled={busy} onClick={() => run(r, "start")}>Iniciar</Button>
                    )}
                    {r.type === "database" && (
                      <Button size="sm" icon={<Table2 className="size-3.5" />} onClick={() => navigate(`/databases/${encodeURIComponent(`coolify:${r.uuid}`)}`)}>Explorar</Button>
                    )}
                    {r.type === "application" && running && (
                      <Button size="sm" icon={<Rocket className="size-3.5" />} disabled={busy} onClick={() => run(r, "deploy")}>Desplegar</Button>
                    )}
                    <Button size="sm" icon={<ScrollText className="size-3.5" />} onClick={() => openLogs(r)}>Logs</Button>
                    <Menu
                      title={r.name}
                      items={[
                        { label: "Reiniciar", icon: <RotateCw />, onSelect: () => run(r, "restart"), hidden: !running, disabled: busy },
                        { label: "Parar…", icon: <Square />, onSelect: () => setStopping(r), hidden: !running, disabled: busy },
                        { label: "Desplegar", icon: <Rocket />, onSelect: () => run(r, "deploy"), hidden: r.type !== "application" || running },
                        { label: "Mover a otro proyecto…", icon: <ArrowRightLeft />, onSelect: () => setMoving(r) },
                        { label: "Borrar…", icon: <Trash2 />, danger: true, onSelect: () => { setDeleteVolumes(false); setDeleting(r); } },
                      ]}
                    />
                  </>
                }
              />
            );
          })}
        </Card>
      )}

      <CreateDatabaseModal open={newDb} onClose={() => setNewDb(false)} projects={projects.data ?? []} defaultProject={project.uuid} defaultEnv={env?.name} />
      <NewEnvModal open={newEnv} onClose={() => setNewEnv(false)} projectUuid={project.uuid} onCreated={setEnvName} />
      <MoveResourceModal resource={moving} onClose={() => setMoving(null)} currentProject={project.uuid} />
      <ConfirmDialog
        open={!!stopping}
        onClose={() => setStopping(null)}
        onConfirm={() => stopping && run(stopping, "stop")}
        loading={action.isPending}
        title={`¿Parar «${stopping?.name}»?`}
        confirmLabel="Parar"
        danger
      >
        <p className="text-[13px] text-muted">Dejará de funcionar hasta que lo vuelvas a iniciar. Los datos no se pierden.</p>
      </ConfirmDialog>
      <ConfirmDelete
        open={!!deleting}
        onClose={() => { setDeleting(null); del.reset(); }}
        onConfirm={() => deleting && del.mutate(deleting)}
        loading={del.isPending}
        name={deleting?.name ?? ""}
        title={`Borrar «${deleting?.name}»`}
      >
        <p className="text-[13px] text-muted">Se borrarán los contenedores, la configuración y las redes del recurso en Coolify. No se puede deshacer.</p>
        <Checkbox label="Borrar también los volúmenes (datos)" hint="Si no lo marcas, los datos se conservan en el VPS." checked={deleteVolumes} onChange={setDeleteVolumes} />
        <ErrorBox error={del.error} />
      </ConfirmDelete>
      <Modal open={!!pickLogs} onClose={() => setPickLogs(null)} title={`Logs de «${pickLogs?.resource.name}»`}>
        <p className="text-[13px] text-muted">Este recurso tiene varios contenedores. ¿De cuál quieres ver los logs?</p>
        <div className="space-y-1">
          {pickLogs?.containers.map((c) => (
            <button
              key={c.id}
              onClick={() => { setLogs({ id: c.id, title: c.name }); setPickLogs(null); }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-[13px] hover:bg-panel-2 active:bg-panel-2"
            >
              <span className="truncate font-mono text-xs">{c.name}</span>
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
