import { Download, MonitorSmartphone, Share, SquarePlus } from "lucide-react";
import { useInstall } from "../lib/pwa";
import { Button } from "./ui";

/** Botón compacto para la barra lateral: sólo aparece si el navegador permite instalar con un clic. */
export function InstallButton({ className }: { className?: string }) {
  const { state, install } = useInstall();
  if (state !== "prompt") return null;
  return (
    <Button variant="secondary" size="sm" className={className} icon={<Download className="size-3.5" />} onClick={install}>
      Instalar app
    </Button>
  );
}

/** Explicación completa según el dispositivo (Ajustes y menú «Más» del móvil). */
export function InstallInstructions() {
  const { state, install } = useInstall();

  if (state === "installed")
    return <p className="text-[13px] text-muted">Ya estás usando V-HUB como app. 🎉</p>;

  if (state === "prompt")
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          Instálala y tendrás V-HUB con su propio icono, en una ventana aparte y sin barras del navegador, tanto en el móvil como en el ordenador.
        </p>
        <Button variant="primary" icon={<Download className="size-4" />} onClick={install}>
          Instalar V-HUB
        </Button>
      </div>
    );

  if (state === "ios")
    return (
      <ol className="space-y-2 text-[13px] text-muted">
        <li className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-line text-xs text-fg">1</span>
          Pulsa <Share className="inline size-4 text-info" /> <span className="text-fg">Compartir</span> en la barra de Safari.
        </li>
        <li className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-line text-xs text-fg">2</span>
          Elige <SquarePlus className="inline size-4" /> <span className="text-fg">Añadir a pantalla de inicio</span>.
        </li>
        <li className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-line text-xs text-fg">3</span>
          Abre V-HUB desde su icono: se verá a pantalla completa, como una app.
        </li>
      </ol>
    );

  return (
    <div className="flex items-start gap-3 text-[13px] text-muted">
      <MonitorSmartphone className="mt-0.5 size-5 shrink-0" />
      <p>
        Para instalarla como app, abre V-HUB en <span className="text-fg">Chrome</span> o <span className="text-fg">Edge</span> (ordenador o Android) y
        usa el botón de instalar de la barra de direcciones, o en <span className="text-fg">Safari</span> en iPhone con «Añadir a pantalla de inicio».
        Necesita HTTPS.
      </p>
    </div>
  );
}
