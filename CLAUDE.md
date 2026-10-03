# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

V-HUB es un panel tipo Supabase para gestionar un VPS, construido **encima de la API de Coolify**. Coolify sigue haciendo despliegues, proxy (Traefik) y certificados; V-HUB aporta la UI y lo que Coolify no tiene: explorador de bases de datos, telemetría en vivo y unir proyectos. En producción corre como contenedor en el mismo VPS, unido a la red docker `coolify`.

Todo el código, los mensajes de error y los textos de la UI están en español. Mantén ese idioma.

## Comandos

Monorepo pnpm (`apps/server`, `apps/web`). Node ≥ 22.5 (usa `node:sqlite`; el Dockerfile usa Node 24).

```bash
pnpm install
cp .env.example .env
pnpm dev          # server (tsx watch, :4000) + web (Vite, :5173, proxy de /api y WebSocket a :4000)
pnpm typecheck    # tsc --noEmit en ambos paquetes
pnpm build        # web (tsc + vite build) y luego server (tsc → dist/)
pnpm start        # node apps/server/dist/index.js; sirve también apps/web/dist como SPA
pnpm --filter server dev   # solo un paquete
docker compose up -d --build   # despliegue en el VPS
```

No hay tests ni linter configurados; `pnpm typecheck` es la única verificación automática.

Sin `ADMIN_PASSWORD` en el entorno, el primer arranque muestra el asistente de instalación (también en desarrollo); el código de instalación se imprime en la consola del servidor. En macOS: `DOCKER_SOCKET=$HOME/.docker/run/docker.sock`, y `COOLIFY_DB_ACCESS=external` con un `COOLIFY_URL` público para que el explorador use las URLs públicas de las BD. Sin `/proc`, la telemetría usa datos de macOS y la red sale a 0. El servidor guarda su estado en `apps/server/data/` (SQLite + `.secret`) cuando no hay `DATA_DIR`.

## Patrones de trabajo (obligatorios)

Todo cambio sigue **SOLID** y la **arquitectura en capas** del servidor. Si tocas código que todavía no la cumple, déjalo cumpliéndola.

### Capas del servidor

```
routes  →  services  →  domain  ←  infra
                 (container.ts las conecta)
```

| Capa | Contiene | Puede importar |
|---|---|---|
| `domain/` | Tipos, errores (`AppError`, `BadRequestError`, `NotFoundError`) y **puertos** (`ports.ts`): las interfaces que necesitan los servicios | Nada del proyecto |
| `infra/` | Implementaciones de los puertos: Coolify (`coolify/client.ts`), Docker (`docker/`), `/proc` (`telemetry/`), SQLite (`db/*.repository.ts`), drivers de BD (`drivers/`), cifrado | `domain/` y librerías externas |
| `services/` | Lógica de negocio y **auditoría**. Reciben sus dependencias por constructor, tipadas con puertos | `domain/` y otros servicios. **Nunca** `infra/`, `config.ts` ni Fastify |
| `routes/` | HTTP/WebSocket: validar con zod → llamar a un servicio → dar forma a la respuesta. Sin lógica ni `audit.log` | Servicios (vía `import type { Services } from "../container.js"`) y `domain/` |
| `container.ts` | Composition root: el **único** fichero que instancia `infra/` y lee `config` para inyectarlo en los servicios | Todo |

- Los errores se lanzan como `AppError` (o una subclase) desde servicios o infra. `routes/plugins/error-handler.ts` los traduce a `{ error }` con su status. `ZodError` → 400 y `CoolifyError` → su status (un 5xx de Coolify sale como 502).
- Comprobación rápida: `grep -rn "infra/\|config.js\|fastify" apps/server/src/services` debe devolver vacío.

### SOLID en este repo

- **S:** cada ruta, servicio y repositorio tiene una sola razón para cambiar. No mezcles HTTP, reglas de negocio y acceso a datos en el mismo fichero.
- **O:** se extiende registrando, no editando condicionales. Drivers en `infra/drivers/registry.ts` y topics del WebSocket en `topicHandlers` de `routes/realtime.routes.ts`.
- **L:** cualquier implementación de un puerto (`Driver`, `CoolifyGateway`…) debe poder sustituir a otra sin que el servicio lo note: mismos contratos y mismos errores.
- **I:** puertos pequeños y específicos (`ContainerStatsFeed`, `ContainerEventFeed`, `AuditLog`…) en lugar de una interfaz gigante.
- **D:** los servicios dependen de interfaces de `domain/ports.ts` y `container.ts` hace el cableado. Nada de singletons importados directamente.

### Recetas

- **Endpoint nuevo:** zod + llamada en `routes/<área>.routes.ts` → método en el servicio (con su `audit.log` si modifica algo) → si hace falta un recurso externo nuevo, añádelo al puerto en `domain/ports.ts` e impleméntalo en `infra/` → cablea en `container.ts`. Un fichero de rutas nuevo se añade a la lista de `index.ts`.
- **Motor de BD nuevo:** implementa `Driver` en `infra/drivers/<motor>.ts`, regístralo en `registry.ts`, amplía `DbKind` (`domain/database.ts`) y el `kindSchema` de `databases.routes.ts`, y mapea el motor de Coolify en `KIND_BY_ENGINE` (`services/connection.service.ts`).
- **Topic WebSocket nuevo:** añade un handler en `topicHandlers` que devuelva su función de parada. Las claves que acaban en `:` son prefijos.

### Web

`pages/` (componen la vista) → `components/` (presentación, con los primitivos de `ui.tsx`) → `lib/hooks.ts` (estado de servidor con TanStack Query y `useTopic`) → `lib/api.ts` / `lib/realtime.ts` (únicos puntos de acceso HTTP/WS). Las vistas no llaman a `fetch` ni abren sockets directamente.

## Distribución

- **Instalador** (`install.sh`, servido desde `raw.githubusercontent.com/JeanCarlos82/v-hub/main/install.sh`): comprueba Docker y Coolify (red y contenedor `coolify`), detecta el proxy (Traefik o Caddy) y la IP. Escribe `/opt/v-hub/.env` (solo `VHUB_DOMAIN` y `VHUB_IMAGE`) y `/opt/v-hub/docker-compose.yml` (generado desde un heredoc, así que **las etiquetas del proxy están duplicadas** respecto al `docker-compose.yml` del repo: si cambias unas, cambia las otras). Luego hace `pull` + `up` y muestra la URL y el código de instalación. Reejecutarlo actualiza. Para probarlo en local: `VHUB_DIR=… VHUB_IMAGE=v-hub:local VHUB_NO_PULL=1 bash install.sh`, con una red `coolify` y un contenedor `coolify` falsos.
- **Imagen:** `.github/workflows/docker.yml` publica `ghcr.io/jeancarlos82/v-hub` (amd64 + arm64): `:latest` en cada push a `main` y `:X.Y.Z` con tags `vX.Y.Z`.
- Ambos `docker-compose.yml` usan `name: v-hub`, de modo que el volumen siempre es `v-hub_vhub-data` y una instalación a mano puede pasar al instalador sin perder datos.

## Arquitectura

### Servidor (`apps/server`, Fastify 5, ESM con imports `.js`)

- `index.ts`: crea el contenedor, registra los plugins (`routes/plugins/auth-guard.ts`: toda ruta `/api/*` exige JWT en la cookie `vhub_token`, salvo `/api/auth/login` y `/api/health`), las rutas y la SPA compilada. Arranca la telemetría y la escucha de eventos de Docker.
- `config.ts`: lee el entorno. Si no hay `APP_SECRET`, se genera uno y se guarda en `DATA_DIR/.secret`; sirve para firmar los JWT y cifrar credenciales (AES-256-GCM, `infra/crypto.ts`). El acceso y Coolify (`config.env`) son **opcionales**.
- **Ajustes** (`services/settings.service.ts`): única fuente de la configuración en tiempo de ejecución. Combina `config.env` (prioritario, se muestra bloqueado en la UI) con lo guardado en la tabla `settings` (token cifrado y contraseña con scrypt). Mientras no hay contraseña de admin, genera un **código de instalación** (se imprime en los logs) que exige `POST /api/setup`. Las rutas `/api/setup*` son públicas. `CoolifyClient`, `ConnectionService` y `SystemService` reciben getters (`() => settings.coolify()`…), así que un cambio en Ajustes se aplica sin reiniciar. Antes de guardar credenciales se prueban con `probeCoolify`.
- **Coolify** (`infra/coolify/client.ts`): cliente de `COOLIFY_URL/api/v1`. `toResource` normaliza aplicaciones, BD y servicios en un único `Resource` (`type` + `subtype`; a `database_type` se le quita el prefijo `standalone-`). Las operaciones compuestas están en `services/project.service.ts` y devuelven una lista de `StepResult` en lugar de fallar del todo:
  - `merge`: mueve cada recurso con el endpoint `move` al entorno del mismo nombre en el destino (`ensureEnvironment` lo crea si falta) y solo borra el origen si no falló nada.
  - Borrado en cascada: borra los recursos y luego reintenta borrar el proyecto hasta 90 s, porque Coolify borra en segundo plano.
- **Docker** (`infra/docker/`): dockerode sobre el socket, solo para listar contenedores, stats, logs y eventos (las operaciones sobre proyectos van siempre por Coolify). `coolifyUuidFromLabels` enlaza contenedores con recursos de Coolify. `DockerStatsFeed` solo hace polling mientras haya suscriptores.
- **Telemetría:** `infra/telemetry/host-sampler.ts` lee `/proc` del host (`HOST_PROC`, `HOST_ROOT`). `services/telemetry.service.ts` muestrea cada `TELEMETRY_INTERVAL_MS`, guarda 15 min en memoria y agregados por minuto (7 días) en SQLite.
- **Persistencia** (`infra/db/`): SQLite con `node:sqlite` (`DatabaseSync`), sin ORM. Tablas `connections` (URL cifrada), `metrics_minute` y `audit`.
- **WebSocket** (`routes/realtime.routes.ts`): uno solo en `/api/ws`. El cliente envía `{type:"subscribe"|"unsubscribe", topic}` y el servidor responde `{topic, data}`. Topics: `host`, `containers`, `events` y `logs:<containerId>`.
- **Explorador de BD:** interfaz `Driver` (`domain/database.ts`: `namespaces` → `tables` → `structure` / `rows` / `query`). Los `namespaces` son esquemas en Postgres, bases de datos en MySQL y Mongo, y `db0..N` en Redis, que expone una pseudo-tabla `keys`.
  - `services/connection.service.ts` resuelve los IDs: `coolify:<uuid>` (URL de Coolify según `COOLIFY_DB_ACCESS`; requiere un token con `read:sensitive`) o `manual:<id>` (guardada cifrada).
  - Los drivers abiertos se cachean y se cierran tras 5 min sin uso.
  - `services/explorer.service.ts` convierte cualquier fallo del driver en un 400 con su mensaje.
  - Los drivers pasan los resultados por `sanitize`/`sanitizeRows` (bigint, Buffer, Date).

### Web (`apps/web`, React 19 + Vite + Tailwind 4 + TanStack Query + react-router)

- `lib/api.ts`: `api(path, { json })` hace fetch con cookies. Un 401 fuera de `/api/auth/*` dispara el evento `vhub:unauthorized`, y `main.tsx` responde cerrando la sesión. Los tipos de la API (`Resource`, `HostSample`, `Connection`…) están **duplicados a mano** respecto al servidor (no hay paquete compartido): si cambias una respuesta del servidor, actualiza también este fichero.
- `lib/realtime.ts`: singleton que comparte un WebSocket entre todas las vistas, con reconexión exponencial y re-suscripción automática. En los componentes se usa `useTopic(topic, onData)`.
- La sesión es la query `["me"]`. Sin usuario se renderiza `Login` y no el router.
- `components/ui.tsx` reúne los primitivos (Button, Modal, Badge, ConfirmDelete, Toast…); reutilízalos en lugar de crear otros.

## Notas

- Montar `/var/run/docker.sock` da acceso root al host. El login tiene un límite de 10 intentos por minuto y los fallos quedan en la auditoría.
- Cambiar `APP_SECRET` deja ilegibles las conexiones manuales guardadas: se ignoran y se avisa en el log.
- La integración con Coolify se probó contra un Coolify simulado. Cualquier campo nuevo de su API conviene verificarlo contra una instancia real.
