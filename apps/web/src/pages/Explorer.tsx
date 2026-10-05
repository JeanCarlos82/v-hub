import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Columns3, KeyRound, Play, RefreshCw, Search, Table2, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { DataGrid } from "../components/DataGrid";
import { Badge, Button, Card, ErrorBox, IconButton, Input, Loading, Select, Spinner } from "../components/ui";
import { api, type QueryResult } from "../lib/api";
import { bytes, number } from "../lib/format";

interface Info { name: string; kind: "postgres" | "mysql" | "redis" | "mongodb"; version: string; size?: number | null; extra?: Record<string, unknown> }
interface TableInfo { name: string; type?: string; rows?: number | null; size?: number | null }
interface ColumnInfo { name: string; type: string; nullable?: boolean; default?: string | null; primaryKey?: boolean }

const PAGE = 50;

const QUERY_HINT: Record<Info["kind"], { placeholder: string; label: string }> = {
  postgres: { label: "SQL", placeholder: "SELECT * FROM users ORDER BY created_at DESC LIMIT 20;" },
  mysql: { label: "SQL", placeholder: "SELECT * FROM users ORDER BY created_at DESC LIMIT 20;" },
  redis: { label: "Comando", placeholder: "GET sesion:123     ·     HGETALL user:1     ·     KEYS cache:*" },
  mongodb: { label: "JSON", placeholder: '{ "collection": "users", "find": { "active": true }, "sort": { "_id": -1 }, "limit": 20 }' },
};

const SEARCH_HINT: Record<Info["kind"], string | null> = {
  postgres: null,
  mysql: null,
  redis: "Patrón de clave, p. ej. user:",
  mongodb: 'Filtro JSON, p. ej. {"status":"active"}',
};

export function Explorer() {
  const id = decodeURIComponent(useParams().id!);
  const base = `/api/explorer/${encodeURIComponent(id)}`;
  const [ns, setNs] = useState<string>("");
  const [table, setTable] = useState<string | null>(null);
  const [tab, setTab] = useState<"data" | "structure" | "query">("data");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("");

  const info = useQuery({ queryKey: ["explorer", id, "info"], queryFn: () => api<Info>(`${base}/info`), retry: false });
  const namespaces = useQuery({ queryKey: ["explorer", id, "ns"], queryFn: () => api<string[]>(`${base}/namespaces`), enabled: info.isSuccess });

  useEffect(() => {
    if (!namespaces.data?.length || ns) return;
    const preferred = (info.data?.extra?.database as string) ?? "";
    setNs(namespaces.data.includes("public") ? "public" : namespaces.data.includes(preferred) ? preferred : namespaces.data[0]);
  }, [namespaces.data, ns, info.data]);

  const tables = useQuery({
    queryKey: ["explorer", id, "tables", ns],
    queryFn: () => api<TableInfo[]>(`${base}/tables?ns=${encodeURIComponent(ns)}`),
    enabled: !!ns,
  });

  useEffect(() => {
    setTable(info.data?.kind === "redis" ? "keys" : null);
    setPage(0);
  }, [ns, info.data?.kind]);
  useEffect(() => {
    setPage(0);
    setSearch("");
    setAppliedSearch("");
  }, [table]);

  const rows = useQuery({
    queryKey: ["explorer", id, "rows", ns, table, page, appliedSearch],
    queryFn: () =>
      api<{ columns: string[]; rows: Record<string, unknown>[]; total: number | null }>(
        `${base}/rows?ns=${encodeURIComponent(ns)}&table=${encodeURIComponent(table!)}&limit=${PAGE}&offset=${page * PAGE}&search=${encodeURIComponent(appliedSearch)}`,
      ),
    enabled: !!table && tab === "data",
    placeholderData: (prev) => prev,
  });

  const structure = useQuery({
    queryKey: ["explorer", id, "structure", ns, table],
    queryFn: () => api<ColumnInfo[]>(`${base}/structure?ns=${encodeURIComponent(ns)}&table=${encodeURIComponent(table!)}`),
    enabled: !!table && tab === "structure",
  });

  const visibleTables = useMemo(
    () => (tables.data ?? []).filter((t) => !tableFilter || t.name.toLowerCase().includes(tableFilter.toLowerCase())),
    [tables.data, tableFilter],
  );

  if (info.isLoading) return <Loading label="Conectando a la base de datos…" />;
  if (info.error)
    return (
      <div className="space-y-4">
        <Link to="/databases" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg"><ChevronLeft className="size-4" />Bases de datos</Link>
        <ErrorBox error={info.error} />
      </div>
    );
  const kind = info.data!.kind;
  const total = rows.data?.total;
  const lastPage = total !== null && total !== undefined ? Math.max(0, Math.ceil(total / PAGE) - 1) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-4 py-3">
        <Link to="/databases" title="Volver a bases de datos" className="-ml-1 rounded-md p-1 text-muted hover:text-fg pointer-coarse:p-2"><ChevronLeft className="size-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{info.data!.name}</div>
          <div className="text-xs text-muted">
            {info.data!.version}
            {info.data!.size ? ` · ${bytes(info.data!.size)}` : ""}
            {info.data!.extra?.connections !== undefined ? ` · ${info.data!.extra.connections} conexiones` : ""}
          </div>
        </div>
        <label className="flex items-center gap-2 max-sm:w-full">
          <span className="shrink-0 text-xs text-muted max-md:w-[5.5rem]">{kind === "postgres" ? "Esquema" : "Base de datos"}</span>
          <Select value={ns} onChange={(e) => setNs(e.target.value)} className="w-44 max-sm:w-full">
            {namespaces.data?.map((n) => <option key={n}>{n}</option>)}
          </Select>
        </label>
        {/* Móvil: la lista lateral no cabe, así que la tabla se elige aquí */}
        {kind !== "redis" && (
          <label className="flex w-full items-center gap-2 md:hidden">
            <span className="w-[5.5rem] shrink-0 text-xs text-muted">{kind === "mongodb" ? "Colección" : "Tabla"}</span>
            <Select value={table ?? ""} onChange={(e) => { setTable(e.target.value || null); if (tab === "query") setTab("data"); }} className="w-full">
              <option value="">{tables.isLoading ? "Cargando…" : `Elige una ${kind === "mongodb" ? "colección" : "tabla"}…`}</option>
              {tables.data?.map((t) => (
                <option key={t.name} value={t.name}>{t.name}{t.rows !== null && t.rows !== undefined ? ` (${number(t.rows)})` : ""}</option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {kind !== "redis" && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel max-md:hidden">
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 size-4 text-faint" />
                <Input value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} placeholder={kind === "mongodb" ? "Colecciones…" : "Tablas…"} className="pl-8" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {tables.isLoading && <div className="p-3"><Spinner /></div>}
              <ErrorBox error={tables.error} />
              {visibleTables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => { setTable(t.name); if (tab === "query") setTab("data"); }}
                  className={clsx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", table === t.name ? "bg-line text-fg" : "text-muted hover:bg-panel-2 hover:text-fg")}
                >
                  <Table2 className="size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {t.rows !== null && t.rows !== undefined && <span className="text-[11px] tabular text-faint">{number(t.rows)}</span>}
                </button>
              ))}
              {tables.data && !tables.data.length && <div className="p-3 text-xs text-muted">Sin tablas en este {kind === "postgres" ? "esquema" : "base de datos"}.</div>}
            </div>
          </aside>
        )}

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-line px-3">
            {(
              [
                ["data", kind === "redis" ? "Claves" : "Datos", kind === "redis" ? KeyRound : Table2],
                ["structure", "Estructura", Columns3],
                ["query", QUERY_HINT[kind].label === "SQL" ? "Editor SQL" : "Consola", Terminal],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                disabled={k !== "query" && !table}
                className={clsx("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] disabled:opacity-40 pointer-coarse:py-3", tab === k ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg")}
              >
                <Icon className="size-3.5" />{label}
              </button>
            ))}
            {table && tab !== "query" && <Badge className="ml-2 max-md:hidden">{table}</Badge>}
          </div>

          {tab === "query" ? (
            <QueryConsole base={base} ns={ns} kind={kind} />
          ) : !table ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted">
              Elige una {kind === "mongodb" ? "colección" : "tabla"} <span className="max-md:hidden">&nbsp;de la izquierda</span><span className="md:hidden">&nbsp;arriba</span>&nbsp;para ver sus datos.
            </div>
          ) : tab === "structure" ? (
            <div className="flex-1 overflow-auto p-4">
              {structure.isLoading ? <Spinner /> : <ErrorBox error={structure.error} />}
              {structure.data && (
                <Card>
                  <table className="w-full text-[13px]">
                    <thead className="text-left text-xs text-faint">
                      <tr><th className="px-4 py-2 font-medium">Columna</th><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Nulo</th><th className="px-4 py-2 font-medium">Por defecto</th></tr>
                    </thead>
                    <tbody>
                      {structure.data.map((c) => (
                        <tr key={c.name} className="border-t border-line">
                          <td className="px-4 py-2 font-mono text-xs">{c.name} {c.primaryKey && <Badge tone="warn" className="ml-1">PK</Badge>}</td>
                          <td className="px-4 py-2 font-mono text-xs text-info">{c.type}</td>
                          <td className="px-4 py-2 text-muted">{c.nullable === undefined ? "—" : c.nullable ? "sí" : "no"}</td>
                          <td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-muted">{c.default ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                {SEARCH_HINT[kind] && (
                  <form className="flex gap-2 max-sm:w-full" onSubmit={(e) => { e.preventDefault(); setPage(0); setAppliedSearch(search); }}>
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={SEARCH_HINT[kind]!} className="w-80 font-mono text-xs max-sm:w-full" />
                    <Button size="sm" type="submit">Filtrar</Button>
                  </form>
                )}
                <div className="ml-auto flex items-center gap-2 text-xs text-muted tabular">
                  {rows.isFetching && <Spinner className="size-3.5" />}
                  <span>
                    {rows.data ? `${number(page * PAGE + (rows.data.rows.length ? 1 : 0))}–${number(page * PAGE + rows.data.rows.length)}` : ""}
                    {total !== null && total !== undefined ? ` de ${number(total)}` : ""}
                  </span>
                  <IconButton title="Anterior" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></IconButton>
                  <IconButton title="Siguiente" disabled={lastPage !== null ? page >= lastPage : (rows.data?.rows.length ?? 0) < PAGE} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></IconButton>
                  <IconButton title="Recargar" onClick={() => rows.refetch()}><RefreshCw className="size-3.5" /></IconButton>
                </div>
              </div>
              <ErrorBox error={rows.error} className="m-3" />
              <div className="flex min-h-0 flex-1 flex-col">{rows.data && <DataGrid columns={rows.data.columns} rows={rows.data.rows} offset={page * PAGE} />}</div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function QueryConsole({ base, ns, kind }: { base: string; ns: string; kind: Info["kind"] }) {
  const storageKey = `vhub:query:${base}`;
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, text); } catch {}
  }, [text, storageKey]);

  const run = useMutation({ mutationFn: (q: string) => api<QueryResult>(`${base}/query`, { method: "POST", json: { text: q, ns } }) });
  const exec = () => text.trim() && run.mutate(text);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); exec(); }
          }}
          spellCheck={false}
          placeholder={QUERY_HINT[kind].placeholder}
          className="block h-48 w-full resize-y bg-bg p-4 font-mono text-[13px] leading-6 text-fg outline-none placeholder:text-faint max-sm:h-36 max-sm:text-base"
        />
        <div className="flex items-center gap-3 border-t border-line bg-panel px-3 py-2">
          <Button variant="primary" size="sm" icon={<Play className="size-3.5" />} loading={run.isPending} onClick={exec}>Ejecutar</Button>
          <span className="text-xs text-faint"><span className="pointer-coarse:hidden">⌘/Ctrl + Enter · </span>en <span className="text-muted">{ns}</span></span>
          {run.data && (
            <span className="ml-auto text-xs text-muted tabular">
              {run.data.command && <Badge className="mr-2">{run.data.command}</Badge>}
              {number(run.data.rowCount)} fila{run.data.rowCount !== 1 ? "s" : ""} · {run.data.durationMs.toFixed(1)} ms
            </span>
          )}
        </div>
      </div>
      <ErrorBox error={run.error} className="m-3" />
      <div className="flex min-h-0 flex-1 flex-col">
        {run.data && (run.data.columns.length ? <DataGrid columns={run.data.columns} rows={run.data.rows} /> : <div className="p-4 text-[13px] text-brand">Consulta ejecutada · {run.data.rowCount} filas afectadas</div>)}
      </div>
    </div>
  );
}
