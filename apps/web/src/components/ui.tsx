import clsx from "clsx";
import { CircleAlert, LoaderCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { statusTone } from "../lib/format";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-brand text-[#06140d] hover:bg-brand/90",
        variant === "secondary" && "border border-line-strong bg-panel-2 text-fg hover:bg-line",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-fg",
        variant === "danger" && "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ title, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      {...rest}
      title={title}
      aria-label={title}
      className={clsx(
        "inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg disabled:opacity-40",
        className,
      )}
    />
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={clsx("rounded-lg border border-line bg-panel", className)}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "ok" | "warn" | "down" | "info" | "violet"; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
        tone === "neutral" && "bg-line text-muted",
        tone === "ok" && "bg-brand/12 text-brand",
        tone === "warn" && "bg-warn/12 text-warn",
        tone === "down" && "bg-danger/12 text-danger",
        tone === "info" && "bg-info/12 text-info",
        tone === "violet" && "bg-violet/12 text-violet",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ status, className }: { status?: string; className?: string }) {
  const tone = statusTone(status);
  return (
    <span
      title={status}
      className={clsx(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "ok" && "bg-brand shadow-[0_0_8px] shadow-brand/60",
        tone === "warn" && "bg-warn",
        tone === "down" && "bg-danger",
        tone === "idle" && "bg-faint",
        className,
      )}
    />
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const tone = statusTone(status);
  const label = (status ?? "desconocido").replace(":", " · ");
  return (
    <Badge tone={tone === "idle" ? "neutral" : tone}>
      <StatusDot status={status} className="size-1.5 shadow-none" />
      {label}
    </Badge>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("size-4 animate-spin text-muted", className)} />;
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 justify-center text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return (
    <div className={clsx("flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-[13px] text-danger", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="break-words">{error instanceof Error ? error.message : String(error)}</span>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        className={clsx("w-full rounded-xl border border-line-strong bg-panel shadow-2xl", wide ? "max-w-2xl" : "max-w-md")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton title="Cerrar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="space-y-4 p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full h-8 rounded-md border border-line-strong bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, "pr-7", props.className)} />;
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--color-brand)]" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-[13px] text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Confirmación fuerte: exige escribir el nombre del objeto que se va a borrar. */
export function ConfirmDelete({
  open, onClose, onConfirm, name, title, children, loading,
}: { open: boolean; onClose: () => void; onConfirm: () => void; name: string; title: string; children?: ReactNode; loading?: boolean }) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="danger" disabled={typed !== name} loading={loading} onClick={onConfirm}>
            Borrar definitivamente
          </Button>
        </>
      }
    >
      {children}
      <Field label={`Escribe «${name}» para confirmar`}>
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </Modal>
  );
}

// --- Toasts ---
type Toast = { id: number; tone: "ok" | "error" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "rounded-lg border px-3 py-2.5 text-[13px] shadow-xl backdrop-blur",
              t.tone === "ok" && "border-brand/30 bg-panel-2/95 text-fg",
              t.tone === "error" && "border-danger/40 bg-panel-2/95 text-danger",
              t.tone === "info" && "border-line-strong bg-panel-2/95 text-fg",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
