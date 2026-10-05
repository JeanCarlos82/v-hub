import clsx from "clsx";
import { CircleAlert, LoaderCircle, MoreHorizontal, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { statusLabel, statusTone } from "../lib/format";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

const buttonCls = (variant: ButtonProps["variant"], size: ButtonProps["size"], className?: string) =>
  clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap select-none",
    // En pantallas táctiles los botones crecen para que sean fáciles de pulsar
    size === "sm" ? "h-7 px-2.5 text-xs pointer-coarse:h-9 pointer-coarse:px-3 pointer-coarse:text-[13px]" : "h-8 px-3 text-[13px] pointer-coarse:h-10 pointer-coarse:px-4 pointer-coarse:text-sm",
    variant === "primary" && "bg-brand text-[#06140d] hover:bg-brand/90 active:bg-brand/80",
    variant === "secondary" && "border border-line-strong bg-panel-2 text-fg hover:bg-line active:bg-line",
    variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-fg active:bg-line",
    variant === "danger" && "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
    className,
  );

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={disabled || loading} className={buttonCls(variant, size, className)}>
      {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/** Enlace con aspecto de botón (navegación interna) */
export function ButtonLink({ to, variant = "secondary", size = "md", icon, className, children }: { to: string; icon?: ReactNode; className?: string; children: ReactNode } & Pick<ButtonProps, "variant" | "size">) {
  return (
    <Link to={to} className={buttonCls(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ title, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return (
    <button
      {...rest}
      title={title}
      aria-label={title}
      className={clsx(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-line hover:text-fg active:bg-line disabled:opacity-40 pointer-coarse:size-10",
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
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
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
      title={statusLabel(status)}
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

/** Estado traducido ("En marcha", "Parado"…); el valor original queda en el tooltip. */
export function StatusBadge({ status }: { status?: string }) {
  const tone = statusTone(status);
  return (
    <span title={status} className="inline-flex">
      <Badge tone={tone === "idle" ? "neutral" : tone}>
        <StatusDot status={status} className="size-1.5 shadow-none" />
        {statusLabel(status)}
      </Badge>
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("size-4 animate-spin text-muted", className)} />;
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error, className, action }: { error: unknown; className?: string; action?: ReactNode }) {
  if (!error) return null;
  return (
    <div className={clsx("flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-[13px] text-danger", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1 break-words">{error instanceof Error ? error.message : String(error)}</span>
      {action}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-14 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Bloquea el scroll de la página mientras hay una capa abierta */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

/** Ventana modal. En el móvil aparece como hoja desde abajo. */
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  useScrollLock(open);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-[2px] max-sm:items-end max-sm:p-0"
      onMouseDown={onClose}
    >
      <div
        className={clsx(
          "w-full rounded-xl border border-line-strong bg-panel shadow-2xl max-sm:flex max-sm:max-h-[92dvh] max-sm:flex-col max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:animate-[sheet-up_.18s_ease-out]",
          wide ? "max-w-2xl" : "max-w-md",
        )}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton title="Cerrar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="space-y-4 p-4 max-sm:overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-4 py-3 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

/**
 * Menú de acciones secundarias ("⋯"). En escritorio es un desplegable; en el móvil, una hoja inferior
 * con opciones grandes.
 */
export function Menu({ items, title = "Más acciones", label }: { items: MenuItem[]; title?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;
  const pick = (i: MenuItem) => {
    setOpen(false);
    i.onSelect();
  };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      {label ? (
        <Button size="sm" icon={<MoreHorizontal className="size-4" />} onClick={(e) => { e.preventDefault(); setOpen(!open); }} aria-haspopup="menu" aria-expanded={open}>
          {label}
        </Button>
      ) : (
        <IconButton title={title} onClick={(e) => { e.preventDefault(); setOpen(!open); }} aria-haspopup="menu" aria-expanded={open}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      )}
      {open && (
        <>
          {/* Fondo para la hoja móvil */}
          <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onMouseDown={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 min-w-48 overflow-hidden rounded-lg border border-line-strong bg-panel-2 py-1 shadow-2xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:pb-[calc(0.5rem+env(safe-area-inset-bottom))] max-sm:animate-[sheet-up_.18s_ease-out]"
          >
            <div className="px-4 pb-1 pt-3 text-xs font-medium text-faint sm:hidden">{title}</div>
            {visible.map((i) => (
              <button
                key={i.label}
                role="menuitem"
                disabled={i.disabled}
                onClick={(e) => { e.preventDefault(); pick(i); }}
                className={clsx(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] disabled:opacity-40 max-sm:px-4 max-sm:py-3.5 max-sm:text-[15px]",
                  i.danger ? "text-danger hover:bg-danger/10" : "text-fg hover:bg-line",
                )}
              >
                <span className="flex size-4 items-center justify-center [&>svg]:size-4">{i.icon}</span>
                {i.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Selector de opciones excluyentes (pestañas pequeñas) */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={clsx("flex max-w-full overflow-x-auto rounded-md border border-line-strong bg-panel p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={clsx(
            "h-7 shrink-0 whitespace-nowrap rounded px-2.5 text-xs font-medium transition-colors pointer-coarse:h-9 pointer-coarse:px-3.5 pointer-coarse:text-[13px]",
            value === o.id ? "bg-line text-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
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

// En el móvil los campos usan 16px: con menos, iOS hace zoom al enfocarlos
export const inputCls =
  "w-full h-8 rounded-md border border-line-strong bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:opacity-60 max-sm:text-base pointer-coarse:h-10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, "pr-7", props.className)} />;
}

export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[13px] pointer-coarse:gap-3 pointer-coarse:text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--color-brand)] pointer-coarse:size-5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-5 space-y-3">
      {back && (
        <Link to={back.to} className="-ml-1 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg pointer-coarse:py-1">
          <span aria-hidden>‹</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight max-sm:text-lg">{title}</h1>
          {subtitle && <div className="mt-1 text-[13px] text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
      </div>
    </div>
  );
}

/** Confirmación sencilla (Aceptar / Cancelar) */
export function ConfirmDialog({
  open, onClose, onConfirm, title, children, confirmLabel = "Confirmar", danger, loading,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; children?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {children}
    </Modal>
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
        <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
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
      {/* En el móvil van encima de la barra de pestañas */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2 max-md:inset-x-3 max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-md:w-auto"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className={clsx(
              "pointer-events-auto rounded-lg border px-3 py-2.5 text-[13px] shadow-xl backdrop-blur animate-[toast-in_.2s_ease-out]",
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
