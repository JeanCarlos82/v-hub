import { useEffect, useState } from "react";

/** Evento no estándar de Chrome/Edge para ofrecer la instalación como app */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Registra el service worker (sólo en producción: en desarrollo interferiría con Vite). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Estado de la instalación como app:
 * - `prompt`: el navegador permite instalar con un botón (Chrome, Edge, Android).
 * - `ios`: Safari en iPhone/iPad, hay que hacerlo desde Compartir → Añadir a pantalla de inicio.
 * - `installed`: ya se está usando como app.
 * - `unavailable`: el navegador no lo ofrece (o la página no es HTTPS).
 */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);

  const state: "prompt" | "ios" | "installed" | "unavailable" = isStandalone()
    ? "installed"
    : deferred
      ? "prompt"
      : isIOS()
        ? "ios"
        : "unavailable";

  async function install() {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === "accepted";
  }

  return { state, install };
}
