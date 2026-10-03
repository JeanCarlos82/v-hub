import clsx from "clsx";
import { Container, Database, FolderKanban, History, LayoutDashboard, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { api } from "../lib/api";
import { realtime } from "../lib/realtime";

const nav = [
  { to: "/", label: "Resumen", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Proyectos", icon: FolderKanban },
  { to: "/databases", label: "Bases de datos", icon: Database },
  { to: "/containers", label: "Contenedores", icon: Container },
  { to: "/activity", label: "Actividad", icon: History },
];

export function Layout({ user, onLogout }: { user: string; onLogout: () => void }) {
  const [wsStatus, setWsStatus] = useState(realtime.status);
  useEffect(() => realtime.onStatus(setWsStatus), []);

  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel max-md:w-14">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4 max-md:justify-center max-md:px-0">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="font-semibold tracking-tight max-md:hidden">V-HUB</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                clsx(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors max-md:justify-center",
                  isActive ? "bg-line text-fg" : "text-muted hover:bg-panel-2 hover:text-fg",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="max-md:hidden">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted max-md:justify-center max-md:px-0" title={`Tiempo real: ${wsStatus}`}>
            <span className={clsx("size-1.5 rounded-full", wsStatus === "open" ? "bg-brand" : wsStatus === "connecting" ? "bg-warn" : "bg-faint")} />
            <span className="max-md:hidden">{user}</span>
          </div>
          <button
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              onLogout();
            }}
            title="Cerrar sesión"
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted hover:bg-panel-2 hover:text-fg max-md:justify-center"
          >
            <LogOut className="size-4" />
            <span className="max-md:hidden">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] p-6 max-sm:p-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
