import { useState } from "react";
import { api } from "../lib/api";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ user: string }>("/api/auth/login", { method: "POST", json: { username, password } });
      onLogin(r.user);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-12" />
          <h1 className="text-2xl font-semibold tracking-tight">V-HUB</h1>
          <p className="text-[13px] text-muted">Panel de control de tu VPS</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-panel p-5">
          <Field label="Usuario">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
          </Field>
          <ErrorBox error={error} />
          <Button variant="primary" className="w-full" loading={loading} type="submit">
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
