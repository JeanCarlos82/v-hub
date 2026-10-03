import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Project, type Resource, type StepResult } from "../lib/api";
import { Button, Checkbox, ErrorBox, Field, Input, Modal, Select, useToast } from "./ui";

export function StepList({ steps }: { steps: StepResult[] }) {
  if (!steps.length) return null;
  const label: Record<string, string> = { application: "App", database: "BD", service: "Servicio", project: "Proyecto" };
  return (
    <ul className="max-h-64 space-y-1 overflow-auto rounded-md border border-line bg-bg p-2 text-[13px]">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2">
          {s.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-brand" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />}
          <span>
            <span className="text-muted">{label[s.type] ?? s.type}</span> {s.resource}
            {s.error && <span className="block text-xs text-danger">{s.error}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    setName("");
    setDescription("");
  }, [open]);
  const m = useMutation({
    mutationFn: () => api("/api/projects", { method: "POST", json: { name, description: description || undefined } }),
    onSuccess: () => {
      toast("ok", `Proyecto «${name}» creado`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo proyecto"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim()} loading={m.isPending} onClick={() => m.mutate()}>Crear proyecto</Button>
        </>
      }
    >
      <Field label="Nombre"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="mi-app" /></Field>
      <Field label="Descripción (opcional)"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <p className="text-xs text-muted">Coolify crea automáticamente el entorno «production».</p>
      <ErrorBox error={m.error} />
    </Modal>
  );
}

export function MergeModal({ open, onClose, projects, selected, onDone }: { open: boolean; onClose: () => void; projects: Project[]; selected: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [deleteSources, setDeleteSources] = useState(true);
  const [steps, setSteps] = useState<StepResult[] | null>(null);
  useEffect(() => {
    setTarget(selected[0] ?? "");
    setSteps(null);
    setDeleteSources(true);
  }, [open, selected]);

  const sources = selected.filter((s) => s !== target);
  const m = useMutation({
    mutationFn: () => api<{ steps: StepResult[] }>("/api/projects/merge", { method: "POST", json: { sources, target, deleteSources } }),
    onSuccess: (r) => {
      setSteps(r.steps);
      qc.invalidateQueries({ queryKey: ["projects"] });
      onDone();
    },
  });
  const name = (uuid: string) => projects.find((p) => p.uuid === uuid)?.name ?? uuid;
  const count = (uuid: string) => projects.find((p) => p.uuid === uuid)?.environments.reduce((a, e) => a + e.resources.length, 0) ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unir proyectos"
      footer={
        steps ? (
          <Button variant="primary" onClick={onClose}>Cerrar</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" disabled={!target || !sources.length} loading={m.isPending} onClick={() => m.mutate()}>
              Unir {sources.length} en «{name(target)}»
            </Button>
          </>
        )
      }
    >
      {steps ? (
        <StepList steps={steps} />
      ) : (
        <>
          <Field label="Proyecto destino" hint="Los recursos se mueven al entorno con el mismo nombre en el destino (se crea si no existe).">
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              {selected.map((uuid) => <option key={uuid} value={uuid}>{name(uuid)}</option>)}
            </Select>
          </Field>
          <div className="space-y-1 text-[13px]">
            <div className="text-muted">Se moverán:</div>
            {sources.map((s) => (
              <div key={s} className="flex justify-between rounded bg-panel-2 px-2.5 py-1.5">
                <span>{name(s)}</span>
                <span className="text-muted">{count(s)} recursos</span>
              </div>
            ))}
          </div>
          <Checkbox label="Borrar los proyectos origen al terminar" hint="Sólo se borran si todos sus recursos se movieron bien." checked={deleteSources} onChange={setDeleteSources} />
          <ErrorBox error={m.error} />
        </>
      )}
    </Modal>
  );
}

export const DB_ENGINES = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql", label: "MySQL" },
  { id: "mariadb", label: "MariaDB" },
  { id: "redis", label: "Redis" },
  { id: "mongodb", label: "MongoDB" },
  { id: "keydb", label: "KeyDB" },
  { id: "dragonfly", label: "Dragonfly" },
  { id: "clickhouse", label: "ClickHouse" },
];

export function CreateDatabaseModal({ open, onClose, projects, defaultProject, defaultEnv }: { open: boolean; onClose: () => void; projects: Project[]; defaultProject?: string; defaultEnv?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState("postgresql");
  const [name, setName] = useState("");
  const [projectUuid, setProjectUuid] = useState("");
  const [environmentName, setEnvironmentName] = useState("production");
  const [isPublic, setIsPublic] = useState(false);
  const [publicPort, setPublicPort] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setProjectUuid(defaultProject ?? projects[0]?.uuid ?? "");
    setEnvironmentName(defaultEnv ?? "production");
    setIsPublic(false);
    setPublicPort("");
  }, [open, defaultProject, defaultEnv, projects]);

  const envs = projects.find((p) => p.uuid === projectUuid)?.environments ?? [];
  const m = useMutation({
    mutationFn: () =>
      api("/api/databases", {
        method: "POST",
        json: { kind, name, projectUuid, environmentName, isPublic, publicPort: publicPort ? Number(publicPort) : undefined },
      }),
    onSuccess: () => {
      toast("ok", `Base de datos «${name}» creada; Coolify la está arrancando`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["connections"] });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva base de datos"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" disabled={!name.trim() || !projectUuid} loading={m.isPending} onClick={() => m.mutate()}>Crear</Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {DB_ENGINES.map((e) => (
          <button
            key={e.id}
            onClick={() => setKind(e.id)}
            className={`rounded-md border px-2 py-2 text-xs ${kind === e.id ? "border-brand/60 bg-brand/10 text-fg" : "border-line-strong text-muted hover:text-fg"}`}
          >
            {e.label}
          </button>
        ))}
      </div>
      <Field label="Nombre"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="app-db" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Proyecto">
          <Select value={projectUuid} onChange={(e) => setProjectUuid(e.target.value)}>
            {projects.map((p) => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Entorno">
          <Select value={environmentName} onChange={(e) => setEnvironmentName(e.target.value)}>
            {envs.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </Select>
        </Field>
      </div>
      <Checkbox label="Exponer públicamente" hint="Publica un puerto en el VPS para conectarte desde fuera." checked={isPublic} onChange={setIsPublic} />
      {isPublic && <Field label="Puerto público"><Input type="number" value={publicPort} onChange={(e) => setPublicPort(e.target.value)} placeholder="5433" /></Field>}
      <p className="text-xs text-muted">Las credenciales se generan automáticamente y quedan guardadas en Coolify.</p>
      <ErrorBox error={m.error} />
    </Modal>
  );
}

export function MoveResourceModal({ resource, onClose, currentProject }: { resource: Resource | null; onClose: () => void; currentProject: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), enabled: !!resource });
  const [projectUuid, setProjectUuid] = useState("");
  const [env, setEnv] = useState("production");
  useEffect(() => {
    setProjectUuid(projects.data?.find((p) => p.uuid !== currentProject)?.uuid ?? currentProject);
    setEnv("production");
  }, [resource, projects.data, currentProject]);
  const envs = projects.data?.find((p) => p.uuid === projectUuid)?.environments ?? [];
  const m = useMutation({
    mutationFn: () => api(`/api/resources/${resource!.type}/${resource!.uuid}/move`, { method: "POST", json: { projectUuid, environmentName: env } }),
    onSuccess: () => {
      toast("ok", `«${resource!.name}» movido`);
      qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
  });
  return (
    <Modal
      open={!!resource}
      onClose={onClose}
      title={`Mover «${resource?.name}»`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={m.isPending} disabled={!projectUuid || !env} onClick={() => m.mutate()}>Mover</Button>
        </>
      }
    >
      <Field label="Proyecto destino">
        <Select value={projectUuid} onChange={(e) => setProjectUuid(e.target.value)}>
          {(projects.data ?? []).map((p) => <option key={p.uuid} value={p.uuid}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label="Entorno" hint="Si escribes uno que no existe, se crea.">
        <Input list="move-envs" value={env} onChange={(e) => setEnv(e.target.value)} />
        <datalist id="move-envs">{envs.map((e) => <option key={e.id} value={e.name} />)}</datalist>
      </Field>
      <ErrorBox error={m.error} />
    </Modal>
  );
}
