import { ArrowDown, Pause, Play, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTopic } from "../lib/realtime";
import { IconButton } from "./ui";

const MAX_LINES = 3000;

/** Panel lateral con logs en vivo de un contenedor (vía WebSocket). */
export function LogDrawer({ containerId, title, onClose }: { containerId: string | null; title: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    setLines([]);
    setFilter("");
    setPaused(false);
  }, [containerId]);

  useEffect(() => {
    if (!containerId) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [containerId, onClose]);

  useTopic<string[]>(containerId ? `logs:${containerId}` : null, (batch) => {
    if (pausedRef.current) return;
    setLines((prev) => {
      const next = prev.concat(batch);
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
  });

  useEffect(() => {
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  if (!containerId) return null;
  const shown = filter ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : lines;
  const toBottom = () => {
    stick.current = true;
    setAtBottom(true);
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  };

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-line-strong bg-[#0b0c0d] pt-[env(safe-area-inset-top)] shadow-2xl max-md:border-l-0"
      role="dialog"
      aria-label={`Logs de ${title}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className={paused ? "size-2 rounded-full bg-warn" : "size-2 animate-pulse rounded-full bg-brand"} title={paused ? "En pausa" : "En vivo"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{title}</div>
          <div className="text-[11px] text-faint">{paused ? "En pausa" : "Logs en vivo"} · {lines.length} líneas</div>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          className="order-last h-8 w-48 rounded-md border border-line-strong bg-bg px-2.5 text-xs outline-none focus:border-brand/60 max-sm:w-full max-sm:text-base sm:order-none pointer-coarse:h-10"
        />
        <IconButton title={paused ? "Reanudar" : "Pausar"} onClick={() => setPaused(!paused)}>
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </IconButton>
        <IconButton title="Limpiar" onClick={() => setLines([])}>
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton title="Cerrar" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          setAtBottom(stick.current);
        }}
        className="relative flex-1 overflow-auto px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] font-mono text-[12px] leading-5"
      >
        {shown.length === 0 && <div className="text-faint">{filter && lines.length ? `Ninguna línea contiene «${filter}».` : "Esperando logs…"}</div>}
        {shown.map((l, i) => {
          const m = l.match(/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s?(.*)$/);
          const text = m ? m[2] : l;
          const isErr = /\b(error|err|fatal|panic|exception)\b/i.test(text);
          const isWarn = /\b(warn|warning)\b/i.test(text);
          return (
            <div key={i} className="whitespace-pre-wrap break-all hover:bg-white/[0.03]">
              {m && <span className="mr-2 select-none text-faint">{new Date(m[1]).toLocaleTimeString("es-ES")}</span>}
              <span className={isErr ? "text-danger" : isWarn ? "text-warn" : "text-[#c9cdd2]"}>{text}</span>
            </div>
          );
        })}
      </div>
      {!atBottom && (
        <button
          onClick={toBottom}
          className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-panel-2 px-3 py-1.5 text-xs shadow-xl"
        >
          <ArrowDown className="size-3.5" /> Ir al final
        </button>
      )}
    </div>
  );
}
