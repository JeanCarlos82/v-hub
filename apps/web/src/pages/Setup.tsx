import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button, ErrorBox, Field, Input } from "../components/ui";
import { api, type SetupStatus } from "../lib/api";

const STEPS = ["Código", "Tu cuenta", "Coolify"];

/** Asistente de primera instalación: código de instalación → administrador → token de Coolify. */
export function Setup({ status, onDone }: { status: SetupStatus; onDone: (user: string) => void }) {
  const steps = status.coolifyFromEnv ? STEPS.slice(0, 2) : STEPS;
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [coolifyToken, setCoolifyToken] = useState("");
  const [coolifyUrl, setCoolifyUrl] = useState(status.defaultCoolifyUrl);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const isLast = step === steps.length - 1;
  const passwordError =
    password && password.length < 8 ? "Al menos 8 caracteres" : repeat && repeat !== password ? "Las contraseñas no coinciden" : null;
  const canContinue = [code.trim().length >= 8, Boolean(username.trim() && password.length >= 8 && password === repeat), Boolean(coolifyToken.trim())][step];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isLast) return setStep(step + 1);
    setLoading(true);
    try {
      const r = await api<{ user: string }>("/api/setup", {
        method: "POST",
        json: { code, username, password, coolifyUrl: status.coolifyFromEnv ? undefined : coolifyUrl, coolifyToken: status.coolifyFromEnv ? undefined : coolifyToken },
      });
      onDone(r.user);
    } catch (err: any) {
      setError(err);
      // Si el código es incorrecto, volvemos al primer paso
      if (err?.status === 401) setStep(0);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-2xl font-semibold tracking-tight">Bienvenido a V-HUB</h1>
          <p className="text-center text-[13px] text-muted">Tres pasos y tendrás el panel de tu VPS listo.</p>
        </div>

        <ol className="mb-4 flex items-center gap-2">
          {steps.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-2 text-xs">
              <span
                className={clsx(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  i < step ? "bg-brand text-[#06140d]" : i === step ? "border border-brand text-brand" : "border border-line-strong text-faint",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={clsx("truncate", i === step ? "text-fg" : "text-muted")}>{label}</span>
              {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
            </li>
          ))}
        </ol>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-panel p-5">
          {step === 0 && (
            <Field
              label="Código de instalación"
              hint={
                <>
                  Aparece al terminar el instalador. Si no lo tienes, ejecútalo en tu VPS:{" "}
                  <code className="rounded bg-bg px-1 py-0.5 font-mono text-fg">docker logs vhub</code>
                </>
              }
            >
              <Input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                className="font-mono tracking-widest"
                autoComplete="off"
              />
            </Field>
          )}

          {step === 1 && (
            <>
              <p className="text-[13px] text-muted">Crea la cuenta con la que entrarás al panel.</p>
              <Field label="Usuario">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
              </Field>
              <Field label="Contraseña" hint="Usa una larga: el panel tiene control total sobre tu servidor.">
                <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </Field>
              <Field label="Repite la contraseña" hint={passwordError && <span className="text-danger">{passwordError}</span>}>
                <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2 text-[13px] text-muted">
                <p>V-HUB necesita un token para hablar con tu Coolify. Para crearlo:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    En Coolify, abre <span className="text-fg">Settings → API</span> y comprueba que la API está activada.
                  </li>
                  <li>
                    Ve a <span className="text-fg">Keys &amp; Tokens → API Tokens</span> (no «Private Keys»).
                  </li>
                  <li>
                    Crea un token con el permiso <span className="text-fg">root</span> y cópialo <span className="text-fg">entero</span>, incluido el
                    «<span className="font-mono text-fg">número|</span>» del principio.
                  </li>
                </ol>
              </div>
              <Field label="Token de Coolify">
                <Input
                  autoFocus
                  type="password"
                  value={coolifyToken}
                  onChange={(e) => setCoolifyToken(e.target.value)}
                  placeholder="3|aB9xK2…"
                  className="font-mono"
                  autoComplete="off"
                />
              </Field>
              <button
                type="button"
                onClick={() => setAdvanced(!advanced)}
                className="flex items-center gap-1 text-xs text-muted hover:text-fg"
              >
                <ChevronDown className={clsx("size-3.5 transition-transform", advanced && "rotate-180")} />
                Opciones avanzadas
              </button>
              {advanced && (
                <Field label="URL de Coolify" hint="Déjala así si V-HUB está en el mismo VPS que Coolify.">
                  <Input value={coolifyUrl} onChange={(e) => setCoolifyUrl(e.target.value)} className="font-mono" />
                </Field>
              )}
            </>
          )}

          <ErrorBox error={error} />

          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                Atrás
              </Button>
            )}
            <Button variant="primary" className="flex-1" type="submit" disabled={!canContinue} loading={loading}>
              {isLast ? (loading ? "Comprobando…" : "Terminar") : "Continuar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
