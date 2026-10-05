import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ButtonLink, Card, ErrorBox, Loading, PageHeader, Segmented, StatusDot } from "../components/ui";
import { api, type SystemStatus } from "../lib/api";
import { ago, auditLabel } from "../lib/format";
import { useState } from "react";

interface AuditRow { id: number; ts: number; action: string; target: string | null; detail: string | null }

const isDanger = (a: string) => a === "auth.failed" || a === "setup.failed" || a.includes("delete") || a.includes("remove");
const isSecurity = (a: string) => a.startsWith("auth.") || a.startsWith("setup.") || a.startsWith("settings.");

export function Activity() {
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<SystemStatus>("/api/system/status") });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api<AuditRow[]>("/api/system/audit"), refetchInterval: 15_000 });
  const [filter, setFilter] = useState<"all" | "changes" | "security">("all");

  const rows = (audit.data ?? []).filter((a) => (filter === "all" ? true : filter === "security" ? isSecurity(a.action) : !isSecurity(a.action)));

  return (
    <>
      <PageHeader title="Actividad" subtitle="Estado de las conexiones y registro de todo lo que se hace desde V-HUB." />
      <div className="mb-6 grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Card className="p-4 text-[13px]">
          <div className="mb-2 font-medium">Coolify</div>
          {status.data && (
            <div className="space-y-1.5 text-muted">
              <div className="flex items-center gap-2">
                <StatusDot status={status.data.coolify.reachable ? "running" : "exited"} />
                <span className="truncate">{status.data.coolify.configured ? status.data.coolify.url : "Sin conectar"}</span>
              </div>
              {status.data.coolify.version && <div>Versión {status.data.coolify.version}</div>}
              <div>Acceso a las BD: <span className="text-fg">{status.data.coolify.dbAccess === "internal" ? "red interna de Docker" : "URL pública"}</span></div>
              <ErrorBox error={status.data.coolify.error} />
              {(!status.data.coolify.configured || status.data.coolify.error) && <ButtonLink to="/settings" size="sm">Revisar en Ajustes</ButtonLink>}
            </div>
          )}
        </Card>
        <Card className="p-4 text-[13px]">
          <div className="mb-2 font-medium">Docker</div>
          {status.data && (
            <div className="space-y-1.5 text-muted">
              <div className="flex items-center gap-2"><StatusDot status={status.data.docker.available && !status.data.docker.error ? "running" : "exited"} />{status.data.docker.available ? `Docker ${status.data.docker.version ?? ""}` : "Sin acceso al socket de Docker"}</div>
              <ErrorBox error={status.data.docker.error} />
            </div>
          )}
        </Card>
      </div>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="font-medium">Registro</h2>
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "Todo" },
              { id: "changes", label: "Cambios" },
              { id: "security", label: "Accesos y ajustes" },
            ]}
          />
        </div>
        {audit.isLoading ? <Loading /> : <ErrorBox error={audit.error} className="m-3" />}
        <ul>
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-b border-line px-4 py-3 text-[13px] last:border-0">
              <span className={clsx("mt-1.5 size-1.5 shrink-0 rounded-full", isDanger(a.action) ? "bg-danger" : "bg-brand")} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className={clsx("font-medium", isDanger(a.action) && "text-danger")} title={a.action}>{auditLabel(a.action)}</span>
                  <span className="text-xs text-faint" title={new Date(a.ts).toLocaleString("es-ES")}>{ago(a.ts)}</span>
                </div>
                {a.target && <div className="mt-0.5 truncate font-mono text-xs text-muted" title={a.detail ?? undefined}>{a.target}</div>}
              </div>
            </li>
          ))}
          {audit.data && !rows.length && <li className="px-4 py-8 text-center text-[13px] text-muted">Nada que mostrar todavía.</li>}
        </ul>
      </Card>
    </>
  );
}
