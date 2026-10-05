import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plug, Plus, Table2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CreateDatabaseModal } from "../components/projects";
import { Badge, Button, ButtonLink, Card, ConfirmDialog, Empty, ErrorBox, Field, Input, Loading, Menu, Modal, PageHeader, Select, StatusBadge, useToast } from "../components/ui";
import { api, type Connection, type Project } from "../lib/api";
import { bytes } from "../lib/format";

export const ENGINE_COLORS: Record<string, string> = {
  postgresql: "#5b9cf5", postgres: "#5b9cf5", mysql: "#f5a524", mariadb: "#c58b5c", redis: "#f0525c",
  keydb: "#f0525c", dragonfly: "#a78bfa", mongodb: "#3ecf8e", clickhouse: "#f5d524",
};

const PLACEHOLDERS: Record<string, string> = {
  postgres: "postgres://usuario:contraseña@host:5432/basedatos",
  mysql: "mysql://usuario:contraseña@host:3306/basedatos",
  redis: "redis://:contraseña@host:6379/0",
  mongodb: "mongodb://usuario:contraseña@host:27017/basedatos?authSource=admin",
};

export function Databases() {
  const connections = useQuery({ queryKey: ["connections"], queryFn: () => api<Connection[]>("/api/connections"), refetchInterval: 20_000 });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), retry: false });
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast("ok", "Conexión quitada");
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const projectOf = (uuid?: string) =>
    projects.data?.find((p) => p.environments.some((e) => e.resources.some((r) => r.uuid === uuid)));

  const coolifyDbs = connections.data?.filter((c) => c.source === "coolify") ?? [];
  const manual = connections.data?.filter((c) => c.source === "manual") ?? [];

  return (
    <>
      <PageHeader
        title="Bases de datos"
        subtitle="Abre cualquier base de datos para ver sus tablas y hacer consultas."
        actions={
          <>
            <Button icon={<Plug className="size-4" />} onClick={() => setAdding(true)}>Conectar una externa</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} disabled={!projects.data?.length} onClick={() => setCreating(true)}>Nueva base de datos</Button>
          </>
        }
      />
      {connections.isLoading ? (
        <Loading />
      ) : connections.error ? (
        <ErrorBox error={connections.error} />
      ) : !connections.data?.length ? (
        <Empty
          icon={<Database className="size-8" />}
          title="Todavía no hay bases de datos"
          action={projects.error ? <ButtonLink to="/settings">Conectar Coolify</ButtonLink> : undefined}
        >
          Crea una nueva en Coolify con el botón de arriba, o conecta una que ya tengas en otro sitio.
        </Empty>
      ) : (
        <div className="space-y-6">
          {coolifyDbs.length > 0 && (
            <Section title="En Coolify">
              {coolifyDbs.map((c) => {
                const p = projectOf(c.resourceUuid);
                return (
                  <DbCard key={c.id} c={c} subtitle={p ? `Proyecto ${p.name}` : undefined}>
                    {c.status && <StatusBadge status={c.status} />}
                  </DbCard>
                );
              })}
            </Section>
          )}
          {manual.length > 0 && (
            <Section title="Conexiones externas">
              {manual.map((c) => (
                <DbCard
                  key={c.id}
                  c={c}
                  subtitle="Conexión externa"
                  menu={
                    <Menu
                      title={c.name}
                      items={[
                        { label: "Abrir explorador", icon: <Table2 />, onSelect: () => navigate(`/databases/${encodeURIComponent(c.id)}`) },
                        { label: "Quitar conexión…", icon: <Trash2 />, danger: true, onSelect: () => setRemoving(c) },
                      ]}
                    />
                  }
                />
              ))}
            </Section>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        title={`¿Quitar «${removing?.name}»?`}
        confirmLabel="Quitar conexión"
        danger
      >
        <p className="text-[13px] text-muted">Sólo se olvida la conexión en V-HUB: la base de datos y sus datos no se tocan.</p>
        <ErrorBox error={remove.error} />
      </ConfirmDialog>
      <AddConnectionModal open={adding} onClose={() => setAdding(false)} />
      <CreateDatabaseModal open={creating} onClose={() => setCreating(false)} projects={projects.data ?? []} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">{title}</h2>
      <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">{children}</div>
    </div>
  );
}

function DbCard({ c, subtitle, children, menu }: { c: Connection; subtitle?: string; children?: React.ReactNode; menu?: React.ReactNode }) {
  const color = ENGINE_COLORS[c.engine] ?? "#8b9096";
  const supported = !!c.kind;
  const body = (
    <div className={`flex items-center gap-3 p-4 ${menu ? "pr-12" : ""}`}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md" style={{ background: `${color}1f`, color }}>
        <Database className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Badge>{c.engine}</Badge>
          <span className="truncate">{supported ? subtitle : "El explorador aún no soporta este motor"}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
  return (
    <Card className={supported ? "relative transition-colors hover:border-line-strong" : "relative opacity-60"}>
      {supported ? <Link to={`/databases/${encodeURIComponent(c.id)}`} className="block">{body}</Link> : body}
      {menu && <div className="absolute right-2 top-1/2 -translate-y-1/2">{menu}</div>}
    </Card>
  );
}

function AddConnectionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("postgres");
  const [url, setUrl] = useState("");
  useEffect(() => {
    setName("");
    setUrl("");
  }, [open]);
  const test = useMutation({ mutationFn: () => api<{ version: string; size?: number }>("/api/connections/test", { method: "POST", json: { kind, url } }) });
  const save = useMutation({
    mutationFn: () => api("/api/connections", { method: "POST", json: { name, kind, url } }),
    onSuccess: () => {
      toast("ok", "Conexión guardada");
      qc.invalidateQueries({ queryKey: ["connections"] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Conectar base de datos externa"
      footer={
        <>
          <Button variant="ghost" onClick={() => test.mutate()} loading={test.isPending} disabled={!url}>Probar</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!url || !name}>Guardar</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Producción" /></Field>
        <Field label="Motor">
          <Select value={kind} onChange={(e) => { setKind(e.target.value); test.reset(); }}>
            <option value="postgres">PostgreSQL</option>
            <option value="mysql">MySQL / MariaDB</option>
            <option value="redis">Redis</option>
            <option value="mongodb">MongoDB</option>
          </Select>
        </Field>
      </div>
      <Field label="URL de conexión" hint="Se guarda cifrada (AES-256-GCM) en el servidor de V-HUB.">
        <Input value={url} onChange={(e) => { setUrl(e.target.value); test.reset(); }} placeholder={PLACEHOLDERS[kind]} className="font-mono text-xs" />
      </Field>
      {test.data && (
        <div className="rounded-md border border-brand/30 bg-brand/8 px-3 py-2 text-[13px] text-brand">
          Conexión correcta · {test.data.version}{test.data.size ? ` · ${bytes(test.data.size)}` : ""}
        </div>
      )}
      <ErrorBox error={test.error ?? save.error} />
    </Modal>
  );
}
