import { Pause, Play, Trash2, X } from "lucide-react";
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
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => setLines([]), [containerId]);

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

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-line-strong bg-[#0b0c0d] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="size-2 animate-pulse rounded-full bg-brand" />
        <div className="min-w-0 flex-1 truncate font-mono text-[13px]">{title}</div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar…"
          className="h-7 w-40 rounded border border-line-strong bg-bg px-2 text-xs outline-none focus:border-brand/60"
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
        }}
        className="flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5"
      >
        {shown.length === 0 && <div className="text-faint">Esperando logs…</div>}
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
    </div>
  );
}
