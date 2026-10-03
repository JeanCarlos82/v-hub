import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBox, Loading, PageHeader, StatusDot } from "../components/ui";
import { api, type SystemStatus } from "../lib/api";
import { ago } from "../lib/format";

interface AuditRow { id: number; ts: number; action: string; target: string | null; detail: string | null }

export function Activity() {
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<SystemStatus>("/api/system/status") });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api<AuditRow[]>("/api/system/audit"), refetchInterval: 15_000 });

  return (
    <>
      <PageHeader title="Actividad" subtitle="Estado de las integraciones y registro de todo lo que se hace desde V-HUB." />
      <div className="mb-6 grid grid-cols-2 gap-3 max-md:grid-cols-1">
        <Card className="p-4 text-[13px]">
          <div className="mb-2 font-medium">Coolify</div>
          {status.data && (
            <div className="space-y-1.5 text-muted">
              <div className="flex items-center gap-2"><StatusDot status={status.data.coolify.reachable ? "running" : "exited"} />{status.data.coolify.url ?? "Sin configurar"}</div>
              {status.data.coolify.version && <div>Versión {status.data.coolify.version}</div>}
              <div>Acceso a BD: <span className="text-fg">{status.data.coolify.dbAccess === "internal" ? "red interna de Docker" : "URL pública"}</span></div>
              <ErrorBox error={status.data.coolify.error} />
            </div>
          )}
        </Card>
        <Card className="p-4 text-[13px]">
          <div className="mb-2 font-medium">Docker</div>
          {status.data && (
            <div className="space-y-1.5 text-muted">
              <div className="flex items-center gap-2"><StatusDot status={status.data.docker.available && !status.data.docker.error ? "running" : "exited"} />{status.data.docker.available ? `Docker ${status.data.docker.version ?? ""}` : "Socket no encontrado"}</div>
              <ErrorBox error={status.data.docker.error} />
            </div>
          )}
        </Card>
      </div>
      <Card>
        <div className="border-b border-line px-4 py-3 font-medium">Registro de auditoría</div>
        {audit.isLoading ? <Loading /> : <ErrorBox error={audit.error} className="m-3" />}
        <ul>
          {audit.data?.map((a) => (
            <li key={a.id} className="flex items-start gap-4 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
              <span className="w-28 shrink-0 text-xs text-faint" title={new Date(a.ts).toLocaleString("es-ES")}>{ago(a.ts)}</span>
              <span className={`w-48 shrink-0 font-mono text-xs ${a.action.startsWith("auth.failed") || a.action.includes("delete") ? "text-danger" : "text-brand"}`}>{a.action}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={a.detail ?? undefined}>{a.target}</span>
            </li>
          ))}
          {audit.data && !audit.data.length && <li className="px-4 py-8 text-center text-[13px] text-muted">Sin actividad todavía.</li>}
        </ul>
      </Card>
    </>
  );
}
