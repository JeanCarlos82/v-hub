import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AppWindow, Boxes, Database, FolderKanban, GitMerge, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CreateProjectModal, MergeModal, StepList } from "../components/projects";
import { Button, Card, Checkbox, ConfirmDelete, Empty, ErrorBox, IconButton, Input, Loading, PageHeader, StatusDot, useToast } from "../components/ui";
import { api, type Project, type StepResult } from "../lib/api";

export function Projects() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), refetchInterval: 20_000 });
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [deleteVolumes, setDeleteVolumes] = useState(false);
  const [deleteSteps, setDeleteSteps] = useState<StepResult[] | null>(null);
  const [q, setQ] = useState("");

  const del = useMutation({
    mutationFn: (p: Project) =>
      api<{ steps: StepResult[]; pending: boolean }>(`/api/projects/${p.uuid}?cascade=true&volumes=${deleteVolumes}`, { method: "DELETE" }),
    onSuccess: (r, p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (r.pending) {
        setDeleteSteps(r.steps);
        toast("info", "Los recursos se están borrando; el proyecto se podrá borrar cuando Coolify termine.");
      } else {
        toast("ok", `Proyecto «${p.name}» borrado`);
        setToDelete(null);
      }
      setSelected((s) => s.filter((x) => x !== p.uuid));
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.description?.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );

  const toggle = (uuid: string) => setSelected((s) => (s.includes(uuid) ? s.filter((x) => x !== uuid) : [...s, uuid]));

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Proyectos de Coolify con sus entornos, aplicaciones, bases de datos y servicios."
        actions={
          <>
            {selected.length >= 2 && (
              <Button icon={<GitMerge className="size-4" />} onClick={() => setMerging(true)}>
                Unir {selected.length} proyectos
              </Button>
            )}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nuevo proyecto</Button>
          </>
        }
      />

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty icon={<FolderKanban className="size-8" />} title="Todavía no hay proyectos">Crea el primero o revisa la conexión con Coolify.</Empty>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-72 max-sm:w-full">
              <Search className="absolute left-2.5 top-2 size-4 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proyecto…" className="pl-8" />
            </div>
            {selected.length > 0 && (
              <span className="text-[13px] text-muted">
                {selected.length} seleccionado{selected.length > 1 ? "s" : ""} ·{" "}
                <button className="hover:text-fg" onClick={() => setSelected([])}>quitar selección</button>
                {selected.length === 1 && " · selecciona otro para unirlos"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
            {filtered.map((p) => {
              const res = p.environments.flatMap((e) => e.resources);
              const by = (t: string) => res.filter((r) => r.type === t).length;
              const isSel = selected.includes(p.uuid);
              return (
                <Card key={p.uuid} className={clsx("group relative transition-colors hover:border-line-strong", isSel && "border-brand/50 bg-brand/[0.03]")}>
                  <Link to={`/projects/${p.uuid}`} className="block p-4">
                    <div className="flex items-start justify-between gap-2 pr-14">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="mt-0.5 truncate text-xs text-muted">{p.description || `${p.environments.length} entorno${p.environments.length !== 1 ? "s" : ""}`}</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                      <span className="flex items-center gap-1.5"><AppWindow className="size-3.5" />{by("application")}</span>
                      <span className="flex items-center gap-1.5"><Database className="size-3.5" />{by("database")}</span>
                      <span className="flex items-center gap-1.5"><Boxes className="size-3.5" />{by("service")}</span>
                      <span className="ml-auto flex items-center gap-1">
                        {res.slice(0, 12).map((r) => <StatusDot key={r.uuid} status={r.status} className="size-1.5 shadow-none" />)}
                        {res.length > 12 && <span className="text-faint">+{res.length - 12}</span>}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.environments.map((e) => (
                        <span key={e.id} className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted">{e.name}</span>
                      ))}
                    </div>
                  </Link>
                  <div className="absolute right-3 top-3 flex items-center gap-1">
                    <IconButton title="Borrar proyecto" className="opacity-0 group-hover:opacity-100 hover:text-danger" onClick={() => { setDeleteSteps(null); setDeleteVolumes(false); setToDelete(p); }}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                    <label className="flex size-7 cursor-pointer items-center justify-center" title="Seleccionar para unir">
                      <input type="checkbox" checked={isSel} onChange={() => toggle(p.uuid)} className="accent-[var(--color-brand)]" />
                    </label>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
      <MergeModal open={merging} onClose={() => setMerging(false)} projects={data ?? []} selected={selected} onDone={() => setSelected([])} />
      <ConfirmDelete
        open={!!toDelete}
        onClose={() => { setToDelete(null); del.reset(); }}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        loading={del.isPending}
        name={toDelete?.name ?? ""}
        title={`Borrar proyecto «${toDelete?.name}»`}
      >
        {toDelete && (
          <>
            <p className="text-[13px] text-muted">
              Se borrarán <b className="text-fg">{toDelete.environments.reduce((a, e) => a + e.resources.length, 0)} recursos</b> (apps, bases de datos y servicios), sus contenedores y su configuración. No se puede deshacer.
            </p>
            <Checkbox label="Borrar también los volúmenes (datos)" hint="Si no lo marcas, los volúmenes de Docker se conservan en el VPS." checked={deleteVolumes} onChange={setDeleteVolumes} />
            {deleteSteps && <StepList steps={deleteSteps} />}
            <ErrorBox error={del.error} />
          </>
        )}
      </ConfirmDelete>
    </>
  );
}
