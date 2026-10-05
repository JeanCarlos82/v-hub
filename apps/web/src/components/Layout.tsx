import clsx from "clsx";
import { Container, Database, FolderKanban, History, LayoutDashboard, LogOut, Menu as MenuIcon, Settings, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router";
import { api } from "../lib/api";
import { realtime, useTopic } from "../lib/realtime";
import { InstallButton, InstallInstructions } from "./InstallApp";
import { Modal } from "./ui";

interface NavItem { to: string; label: string; short?: string; icon: LucideIcon; end?: boolean }

const MAIN: NavItem[] = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Proyectos", icon: FolderKanban },
  { to: "/databases", label: "Bases de datos", short: "Bases", icon: Database },
  { to: "/containers", label: "Contenedores", icon: Container },
];
const SECONDARY: NavItem[] = [
  { to: "/activity", label: "Actividad", icon: History },
  { to: "/settings", label: "Ajustes", icon: Settings },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Resumen"],
  [/^\/projects\/.+/, "Proyecto"],
  [/^\/projects/, "Proyectos"],
  [/^\/databases\/.+/, "Explorador"],
  [/^\/databases/, "Bases de datos"],
  [/^\/containers/, "Contenedores"],
  [/^\/activity/, "Actividad"],
  [/^\/settings/, "Ajustes"],
];

type WsStatus = typeof realtime.status;
const WS_LABEL: Record<WsStatus, string> = { open: "En vivo", connecting: "Conectando…", closed: "Sin conexión" };

function LiveIndicator({ status, compact }: { status: WsStatus; compact?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={`Datos en tiempo real: ${WS_LABEL[status]}`}>
      <span
        className={clsx(
          "size-1.5 rounded-full",
          status === "open" ? "bg-brand shadow-[0_0_6px] shadow-brand" : status === "connecting" ? "animate-pulse bg-warn" : "bg-faint",
        )}
      />
      {!compact && WS_LABEL[status]}
    </span>
  );
}

const sideLink = ({ isActive }: { isActive: boolean }) =>
  clsx(
    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors",
    isActive ? "bg-line font-medium text-fg" : "text-muted hover:bg-panel-2 hover:text-fg",
  );

export function Layout({ user, onLogout }: { user: string; onLogout: () => void }) {
  const [wsStatus, setWsStatus] = useState(realtime.status);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // El explorador de BD ocupa toda la pantalla, sin márgenes
  const fullBleed = useMatch("/databases/:id");

  useEffect(() => realtime.onStatus(setWsStatus), []);
  // Suscripción ligera y permanente: mantiene viva la conexión en tiempo real en todas las pantallas
  // (si no, el indicador marcaría «Sin conexión» en las que no usan datos en vivo)
  useTopic("events", () => {});
  useEffect(() => {
    const title = TITLES.find(([re]) => re.test(location.pathname))?.[1];
    document.title = title ? `${title} · V-HUB` : "V-HUB";
    setMoreOpen(false);
  }, [location.pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  const secondaryActive = SECONDARY.some((i) => location.pathname.startsWith(i.to));

  return (
    <div className="flex h-full">
      {/* --- Escritorio: barra lateral --- */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel max-md:hidden">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="font-semibold tracking-tight">V-HUB</span>
          <span className="ml-auto"><LiveIndicator status={wsStatus} /></span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {MAIN.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={sideLink}>
              <Icon className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
          <div className="my-2 h-px bg-line" />
          {SECONDARY.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={sideLink}>
              <Icon className="size-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-2">
          <InstallButton className="w-full" />
          <div className="flex items-center gap-2 px-2.5 py-1">
            <span className="flex size-6 items-center justify-center rounded-full bg-line text-[11px] font-semibold uppercase text-fg">{user.slice(0, 1)}</span>
            <span className="min-w-0 flex-1 truncate text-[13px]">{user}</span>
            <button onClick={logout} title="Cerrar sesión" className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-fg">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* --- Móvil: cabecera --- */}
        <header className="sticky top-0 z-30 border-b border-line bg-panel/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-12 items-center gap-2 px-4">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="font-semibold tracking-tight">V-HUB</span>
            <span className="ml-auto"><LiveIndicator status={wsStatus} /></span>
          </div>
        </header>

        <main className={clsx("min-h-0 flex-1 overflow-y-auto", fullBleed && "max-md:pb-[calc(3.75rem+env(safe-area-inset-bottom))]")}>
          {fullBleed ? (
            <div className="h-full">
              <Outlet />
            </div>
          ) : (
            <div className="mx-auto max-w-[1400px] p-6 max-md:p-4 max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
              <Outlet />
            </div>
          )}
        </main>

        {/* --- Móvil: pestañas inferiores --- */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="grid h-[3.75rem] grid-cols-5">
            {MAIN.map(({ to, label, short, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx("flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", isActive ? "text-brand" : "text-muted active:text-fg")}
              >
                <Icon className="size-5" />
                {short ?? label}
              </NavLink>
            ))}
            <button
              onClick={() => setMoreOpen(true)}
              className={clsx("flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium", secondaryActive ? "text-brand" : "text-muted active:text-fg")}
            >
              <MenuIcon className="size-5" />
              Más
            </button>
          </div>
        </nav>
      </div>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Más">
        <div className="-mx-4 -mt-4">
          {SECONDARY.map(({ to, label, icon: Icon }) => (
            <button key={to} onClick={() => navigate(to)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left text-[15px] active:bg-panel-2">
              <Icon className="size-5 text-muted" />
              {label}
            </button>
          ))}
          <button onClick={logout} className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left text-[15px] text-danger active:bg-panel-2">
            <LogOut className="size-5" />
            Cerrar sesión <span className="ml-auto text-xs text-muted">{user}</span>
          </button>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-faint">Usar como app</div>
          <InstallInstructions />
        </div>
      </Modal>
    </div>
  );
}
