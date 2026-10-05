import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, ExternalLink, FolderKanban, GitMerge, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CreateProjectModal, MergeModal, StepList } from "../components/projects";
import { Button, ButtonLink, Card, Checkbox, ConfirmDelete, Empty, ErrorBox, Input, Loading, Menu, PageHeader, StatusDot, useToast } from "../components/ui";
import { api, type Project, type StepResult } from "../lib/api";
import { statusTone } from "../lib/format";

/** "2 apps · 1 base de datos" (sin los tipos que no hay) */
function contents(p: Project) {
  const res = p.environments.flatMap((e) => e.resources);
  const n = (t: string) => res.filter((r) => r.type === t).length;
  const parts = [
    [n("application"), "app", "apps"],
    [n("database"), "base de datos", "bases de datos"],
    [n("service"), "servicio", "servicios"],
  ] as const;
  const text = parts.filter(([c]) => c > 0).map(([c, one, many]) => `${c} ${c === 1 ? one : many}`).join(" · ");
  return text || "Sin recursos todavía";
}

function health(p: Project) {
  const res = p.environments.flatMap((e) => e.resources);
  const running = res.filter((r) => statusTone(r.status) === "ok").length;
  const down = res.filter((r) => statusTone(r.status) === "down").length;
  const warn = res.filter((r) => statusTone(r.status) === "warn").length;
  return { res, running, down, warn };
}

export function Projects() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), refetchInterval: 20_000 });
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const navigate = useNavigate();
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
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  return (
    <>
      <PageHeader
        title="Proyectos"
        subtitle="Tus proyectos de Coolify con sus apps, bases de datos y servicios."
        actions={
          !selecting && (
            <>
              <Button icon={<GitMerge className="size-4" />} disabled={(data?.length ?? 0) < 2} onClick={() => setSelecting(true)}>
                Unir proyectos
              </Button>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Nuevo proyecto</Button>
            </>
          )
        }
      />

      {error ? (
        <ErrorBox error={error} action={<ButtonLink to="/settings" size="sm">Ir a Ajustes</ButtonLink>} />
      ) : isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <Empty
          icon={<FolderKanban className="size-8" />}
          title="Todavía no hay proyectos"
          action={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Crear el primero</Button>}
        >
          Un proyecto agrupa las apps, bases de datos y servicios de una misma aplicación.
        </Empty>
      ) : (
        <>
          {selecting && (
            <Card className="mb-4 flex items-center gap-3 border-brand/30 bg-brand/[0.05] px-4 py-3 text-[13px]">
              <GitMerge className="size-4 shrink-0 text-brand" />
              <span className="flex-1">
                <b className="font-medium">Toca los proyectos que quieres unir.</b>{" "}
                <span className="text-muted">Después eliges en cuál se juntan; los recursos se mueven sin redesplegar.</span>
              </span>
            </Card>
          )}
          {data.length > 4 && (
            <div className="relative mb-4 w-72 max-sm:w-full">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proyecto…" className="pl-8" />
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-md:grid-cols-1">
            {filtered.map((p) => {
              const h = health(p);
              const isSel = selected.includes(p.uuid);
              const body = (
                <>
                  <div className="flex items-start gap-3 pr-10">
                    {selecting && (
                      <span className={clsx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", isSel ? "border-brand bg-brand text-[#06140d]" : "border-line-strong")}>
                        {isSel && <Check className="size-3.5" />}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted">{p.description || contents(p)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1">
                      {h.res.slice(0, 10).map((r) => <StatusDot key={r.uuid} status={r.status} className="size-1.5 shadow-none" />)}
                    </span>
                    <span className="text-muted">
                      {h.res.length === 0 ? "Vacío" : [h.running && `${h.running} en marcha`, h.warn && `${h.warn} con fallos`, h.down && `${h.down} parado${h.down > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || `${h.res.length} recursos`}
                    </span>
                  </div>
                  {p.description && <div className="mt-1 text-xs text-faint">{contents(p)}</div>}
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.environments.map((e) => (
                      <span key={e.id} className="rounded bg-panel-2 px-1.5 py-0.5 text-[11px] text-muted">{e.name}</span>
                    ))}
                  </div>
                </>
              );
              return (
                <Card
                  key={p.uuid}
                  className={clsx(
                    "relative transition-colors",
                    selecting ? "cursor-pointer" : "hover:border-line-strong",
                    isSel && "border-brand/60 bg-brand/[0.04]",
                    h.down > 0 && !isSel && "border-danger/25",
                  )}
                >
                  {selecting ? (
                    <button className="block w-full p-4 text-left" onClick={() => toggle(p.uuid)} aria-pressed={isSel}>{body}</button>
                  ) : (
                    <Link to={`/projects/${p.uuid}`} className="block p-4">{body}</Link>
                  )}
                  {!selecting && (
                    <div className="absolute right-2 top-2">
                      <Menu
                        title={p.name}
                        items={[
                          { label: "Abrir", icon: <ExternalLink />, onSelect: () => navigate(`/projects/${p.uuid}`) },
                          { label: "Unir con otros…", icon: <GitMerge />, onSelect: () => { setSelecting(true); setSelected([p.uuid]); }, hidden: data.length < 2 },
                          { label: "Borrar proyecto", icon: <Trash2 />, danger: true, onSelect: () => { setDeleteSteps(null); setDeleteVolumes(false); setToDelete(p); } },
                        ]}
                      />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="py-8 text-center text-[13px] text-muted">Ningún proyecto coincide con «{q}».</p>}
          {selecting && <div className="h-20" />}
        </>
      )}

      {/* Barra de acción del modo «unir» (en el móvil, encima de las pestañas) */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-panel-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:left-60">
          <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-3">
            <span className="flex-1 text-[13px] text-muted">
              {selected.length === 0 ? "Ninguno seleccionado" : selected.length === 1 ? "1 seleccionado · elige al menos otro" : `${selected.length} seleccionados`}
            </span>
            <Button variant="ghost" icon={<X className="size-4" />} onClick={stopSelecting}>Cancelar</Button>
            <Button variant="primary" icon={<GitMerge className="size-4" />} disabled={selected.length < 2} onClick={() => setMerging(true)}>Unir</Button>
          </div>
        </div>
      )}

      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
      <MergeModal open={merging} onClose={() => setMerging(false)} projects={data ?? []} selected={selected} onDone={stopSelecting} />
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
