import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { Loading, ToastProvider } from "./components/ui";
import "./index.css";
import { api, type SetupStatus } from "./lib/api";
import { Activity } from "./pages/Activity";
import { Containers } from "./pages/Containers";
import { Dashboard } from "./pages/Dashboard";
import { Databases } from "./pages/Databases";
import { Explorer } from "./pages/Explorer";
import { Login } from "./pages/Login";
import { ProjectDetail } from "./pages/ProjectDetail";
import { Projects } from "./pages/Projects";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 } },
});

function logout() {
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  queryClient.setQueryData(["me"], null);
}

function App() {
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/api/setup/status"), staleTime: Infinity });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: string }>("/api/auth/me"),
    retry: false,
    staleTime: Infinity,
    enabled: setup.data?.needsSetup === false,
  });

  useEffect(() => {
    const fn = () => logout();
    window.addEventListener("vhub:unauthorized", fn);
    return () => window.removeEventListener("vhub:unauthorized", fn);
  }, []);

  const onLogin = (user: string) => {
    queryClient.setQueryData(["setup"], (s: SetupStatus | undefined) => s && { ...s, needsSetup: false });
    queryClient.setQueryData(["me"], { user });
  };

  if (setup.isLoading || me.isLoading) return <Loading />;
  if (setup.data?.needsSetup) return <Setup status={setup.data} onDone={onLogin} />;
  if (!me.data)
    return (
      <Login onLogin={onLogin} />
    );

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout user={me.data.user} onLogout={logout} />}>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="projects/:uuid" element={<ProjectDetail />} />
          <Route path="databases" element={<Databases />} />
          <Route path="databases/:id" element={<Explorer />} />
          <Route path="containers" element={<Containers />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
