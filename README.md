# V-HUB

Panel para gestionar tu VPS desde un solo sitio, al estilo Supabase, construido **encima de Coolify**:
Coolify sigue haciendo los despliegues, el proxy y los certificados; V-HUB te da una interfaz más cómoda
para ver y operar todo, y añade lo que Coolify no tiene (explorador de bases de datos, telemetría en vivo,
unir proyectos).

## Qué hace

| Área | Funciones |
|---|---|
| **Resumen** | CPU, RAM, disco, red y carga del VPS en tiempo real (WebSocket, cada 2 s). Histórico de 1 h / 24 h / 7 días. Contenedores con más consumo. |
| **Proyectos** | Lista de proyectos de Coolify con sus entornos y recursos. Crear, **borrar en cascada** (con o sin volúmenes) y **unir** varios proyectos en uno. |
| **Detalle de proyecto** | Apps, bases de datos y servicios con estado y CPU/RAM en vivo. Iniciar, parar, reiniciar, desplegar, **mover a otro proyecto/entorno**, borrar, logs en vivo. Crear entornos y bases de datos. |
| **Bases de datos** | PostgreSQL, MySQL/MariaDB, Redis (y KeyDB/Dragonfly) y MongoDB. Las de Coolify se detectan solas; también puedes conectar cualquier BD externa. |
| **Explorador** | Navegador de esquemas y tablas, datos paginados, estructura de columnas y editor SQL / consola Redis / consultas JSON para Mongo. |
| **Contenedores** | Todos los contenedores Docker con métricas en vivo, logs en streaming, iniciar/parar/reiniciar/eliminar. |
| **Actividad** | Estado de Coolify y Docker, y registro de auditoría de todo lo que se hace desde el panel. |

### Cómo funciona "unir proyectos"

Selecciona dos o más proyectos (casilla de cada tarjeta) → **Unir**. Todos los recursos de los proyectos
origen se mueven al destino, cada uno al entorno con el mismo nombre (se crea si no existe). Si todo se
movió bien, los proyectos origen se borran. Usa el endpoint `move` de la API de Coolify, así que no hay
redespliegue ni pérdida de datos.

## Arquitectura

```
                 ┌───────────── VPS ──────────────────────────────────────┐
 navegador ──▶ Traefik (Coolify) ──▶ V-HUB :4000                          │
                 │                    ├─ API Coolify (http://coolify:8080)│
                 │                    ├─ /var/run/docker.sock  → stats, logs, eventos
                 │                    ├─ /proc del host        → CPU, RAM, red, carga
                 │                    ├─ red "coolify"         → conexión directa a las BD
                 │                    └─ SQLite (/data)        → histórico, conexiones cifradas, auditoría
                 └────────────────────────────────────────────────────────┘
```

- `apps/server` — Fastify 5 + TypeScript. WebSocket único en `/api/ws` con topics `host`, `containers`, `events` y `logs:<id>`.
- `apps/web` — React 19 + Vite + Tailwind 4 + TanStack Query.

## Despliegue en el VPS

1. **Token de Coolify**: en Coolify → *Keys & Tokens* → *API tokens*, crea uno con permiso `root`
   (o `read`, `write`, `deploy` y `read:sensitive`). Sin `read:sensitive` Coolify no devuelve las URLs
   de las bases de datos y el explorador no podrá conectarse. Comprueba también que la API está activada
   en *Settings → API*.
2. **DNS**: crea un registro A apuntando `vhub.tudominio.com` a la IP del VPS.
3. **En el VPS**:
   ```bash
   git clone <tu-repo> v-hub && cd v-hub
   cp .env.example .env    # rellena VHUB_DOMAIN, ADMIN_PASSWORD y COOLIFY_TOKEN
   docker compose up -d --build
   ```
   El contenedor se une a la red `coolify`, y el Traefik de Coolify lo publica con HTTPS gracias a las
   etiquetas de `docker-compose.yml`.

### Seguridad

- Montar `/var/run/docker.sock` equivale a dar **acceso root al host**: protege el panel con una
  contraseña larga y no lo expongas sin HTTPS.
- Las credenciales de las conexiones manuales se guardan cifradas (AES-256-GCM) con `APP_SECRET`.
  Si cambias ese secreto, las conexiones guardadas dejan de poder leerse (V-HUB las ignora y avisa en el log).
- El login tiene límite de 10 intentos por minuto y todos los intentos fallidos quedan en la auditoría.
- Las sesiones son JWT en cookie `httpOnly` (7 días).

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm dev            # API en :4000, web en :5173 (con proxy de /api y WebSocket)
```

Para desarrollar en macOS:

- `DOCKER_SOCKET=$HOME/.docker/run/docker.sock` (Docker Desktop).
- `COOLIFY_URL=https://coolify.tudominio.com` y `COOLIFY_DB_ACCESS=external`, para usar las URLs
  públicas de las bases de datos (necesitan estar marcadas como públicas en Coolify).
- Sin `/proc`, la telemetría usa los datos de macOS y el tráfico de red sale a 0.

| Variable | Por defecto | Descripción |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / *(obligatoria en producción)* | Acceso al panel |
| `APP_SECRET` | se genera en `/data/.secret` | Firma de sesiones y cifrado |
| `COOLIFY_URL` / `COOLIFY_TOKEN` | — | API de Coolify |
| `COOLIFY_DB_ACCESS` | `internal` | `internal` (red docker) o `external` (URL pública) |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Socket de Docker |
| `HOST_PROC` / `HOST_ROOT` | `/proc` / `/` | Montajes del host para la telemetría |
| `TELEMETRY_INTERVAL_MS` | `2000` | Frecuencia de muestreo del host |
