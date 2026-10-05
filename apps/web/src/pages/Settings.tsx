import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, useToast } from "../components/ui";
import { InstallInstructions } from "../components/InstallApp";
import { api, type SettingsView } from "../lib/api";

const FromEnv = () => <Badge tone="info">fijado en .env</Badge>;

function CoolifySettings({ view }: { view: SettingsView }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState(view.coolify.url);
  const [token, setToken] = useState("");
  const [dbAccess, setDbAccess] = useState(view.coolify.dbAccess);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const { locked } = view;
  const allLocked = locked.coolifyUrl && locked.coolifyToken && locked.dbAccess;

  useEffect(() => {
    setUrl(view.coolify.url);
    setDbAccess(view.coolify.dbAccess);
  }, [view]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await api<SettingsView>("/api/settings/coolify", {
        method: "PUT",
        json: {
          url: locked.coolifyUrl ? undefined : url,
          token: locked.coolifyToken || !token ? undefined : token,
          dbAccess: locked.dbAccess ? undefined : dbAccess,
        },
      });
      qc.setQueryData(["settings"], next);
      qc.invalidateQueries({ queryKey: ["status"] });
      setToken("");
      toast("ok", "Conexión con Coolify guardada");
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-4">
        <div>
          <div className="font-medium">Coolify</div>
          <p className="text-[13px] text-muted">Antes de guardar, V-HUB comprueba que la URL y el token funcionan.</p>
        </div>
        <Field label="URL de Coolify" hint={locked.coolifyUrl ? <FromEnv /> : "En el mismo VPS: http://coolify:8080"}>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={locked.coolifyUrl} className="font-mono" />
        </Field>
        <Field
          label="Token de API"
          hint={
            locked.coolifyToken ? (
              <FromEnv />
            ) : view.coolify.tokenHint ? (
              <>
                {view.coolify.tokenHint.startsWith("…") ? (
                  <>Token actual terminado en <span className="font-mono">{view.coolify.tokenHint.slice(1)}</span>.</>
                ) : (
                  "Ya hay un token configurado."
                )}{" "}
                Déjalo vacío para mantenerlo.
              </>
            ) : (
              "Coolify → Keys & Tokens → API Tokens, con permiso root."
            )
          }
        >
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={locked.coolifyToken}
            placeholder={view.coolify.tokenHint ? "••••••••" : "3|aB9xK2…"}
            className="font-mono"
            autoComplete="off"
          />
        </Field>
        <Field label="Conexión a las bases de datos" hint={locked.dbAccess && <FromEnv />}>
          <Select value={dbAccess} onChange={(e) => setDbAccess(e.target.value as typeof dbAccess)} disabled={locked.dbAccess}>
            <option value="internal">Red interna de Docker (V-HUB en el mismo VPS)</option>
            <option value="external">URL pública de cada BD</option>
          </Select>
        </Field>
        <ErrorBox error={error} />
        {!allLocked && (
          <Button variant="primary" type="submit" loading={saving}>
            Guardar
          </Button>
        )}
      </form>
    </Card>
  );
}

function PasswordSettings({ view }: { view: SettingsView }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const mismatch = repeat && repeat !== next;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/settings/password", { method: "PUT", json: { current, next } });
      setCurrent("");
      setNext("");
      setRepeat("");
      toast("ok", "Contraseña cambiada");
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-4">
        <div>
          <div className="font-medium">Cuenta</div>
          <p className="text-[13px] text-muted">
            Usuario: <span className="text-fg">{view.adminUser}</span>
          </p>
        </div>
        {view.locked.admin ? (
          <p className="text-[13px] text-muted">
            La contraseña está fijada en el .env del servidor (<span className="font-mono">ADMIN_PASSWORD</span>). Cámbiala allí.
          </p>
        ) : (
          <>
            <Field label="Contraseña actual">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field label="Nueva contraseña" hint="Al menos 8 caracteres.">
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field label="Repite la nueva contraseña" hint={mismatch && <span className="text-danger">No coinciden</span>}>
              <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            </Field>
            <ErrorBox error={error} />
            <Button variant="primary" type="submit" loading={saving} disabled={!current || next.length < 8 || next !== repeat}>
              Cambiar contraseña
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}

export function Settings() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<SettingsView>("/api/settings") });

  return (
    <>
      <PageHeader title="Ajustes" subtitle="Conexión con Coolify, acceso al panel y app." />
      {settings.isLoading && <Loading />}
      <ErrorBox error={settings.error} />
      {settings.data && (
        <div className="grid max-w-3xl gap-4">
          <CoolifySettings view={settings.data} />
          <PasswordSettings view={settings.data} />
          <Card className="p-4">
            <div className="mb-3">
              <div className="font-medium">Usar como app</div>
              <p className="text-[13px] text-muted">Ten V-HUB en el móvil o en el ordenador como una app más, con su icono.</p>
            </div>
            <InstallInstructions />
          </Card>
        </div>
      )}
    </>
  );
}
