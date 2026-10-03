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

## Instalación

Necesitas un VPS con [Coolify](https://coolify.io/docs/get-started/installation) instalado. Entra por SSH y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/JeanCarlos82/v-hub/main/install.sh | sudo bash
```

El instalador comprueba Docker y Coolify, descarga V-HUB y lo arranca. Al terminar te enseña la dirección del panel y
un **código de instalación**:

```
  Abre:  https://vhub.203.0.113.25.sslip.io
  Código de instalación:  K7PM-4QXZ
```

Abre esa dirección y el asistente te pedirá tres cosas:

1. El **código de instalación**. Si lo pierdes, lo ves con `docker logs vhub`.
2. Tu **usuario y contraseña** para el panel.
3. Un **token de Coolify**: en Coolify, *Keys & Tokens → API Tokens* (no «Private Keys»), con permiso `root`.
   Cópialo entero, incluido el `número|` del principio, y comprueba que la API está activada en *Settings → API*.

No hay que editar ningún fichero. El token y la contraseña se pueden cambiar después en **Ajustes**.

**Dominio:** sin dominio propio se usa `vhub.<IP>.sslip.io`, que apunta solo a tu VPS y tiene HTTPS. Para usar uno tuyo,
crea un registro A hacia la IP del VPS y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/JeanCarlos82/v-hub/main/install.sh | sudo VHUB_DOMAIN=panel.tudominio.com bash
```

**Actualizar:** vuelve a ejecutar el mismo comando. Descarga la última versión y conserva tus datos.

**Dónde queda:** en `/opt/v-hub` (`docker-compose.yml` y `.env`). Los datos están en el volumen Docker `v-hub_vhub-data`.

### Instalación a mano (desde el código)

Si prefieres construir la imagen tú mismo:

```bash
git clone https://github.com/JeanCarlos82/v-hub.git && cd v-hub
cp .env.example .env    # rellena VHUB_DOMAIN; el resto lo pide el asistente
docker compose up -d --build
```

Cualquier variable del `.env` (`ADMIN_PASSWORD`, `COOLIFY_TOKEN`…) tiene prioridad sobre lo guardado desde el panel y
aparece bloqueada en Ajustes.

### Seguridad

- Montar `/var/run/docker.sock` equivale a dar **acceso root al host**: protege el panel con una
  contraseña larga y no lo expongas sin HTTPS.
- Las credenciales de las conexiones manuales se guardan cifradas (AES-256-GCM) con `APP_SECRET`.
  Si cambias ese secreto, las conexiones guardadas dejan de poder leerse (V-HUB las ignora y avisa en el log).
- El login tiene límite de 10 intentos por minuto y todos los intentos fallidos quedan en la auditoría.
- Las sesiones son JWT en cookie `httpOnly` (7 días).
- Hasta completar el asistente, sólo quien tenga el código de instalación (visible en el VPS) puede configurar el panel.

## Desarrollo local

```bash
pnpm install
cp .env.example .env
pnpm dev            # API en :4000, web en :5173 (con proxy de /api y WebSocket)
                    # el primer arranque muestra el asistente; el código sale en la consola
```

Para desarrollar en macOS:

- `DOCKER_SOCKET=$HOME/.docker/run/docker.sock` (Docker Desktop).
- `COOLIFY_URL=https://coolify.tudominio.com` y `COOLIFY_DB_ACCESS=external`, para usar las URLs
  públicas de las bases de datos (necesitan estar marcadas como públicas en Coolify).
- Sin `/proc`, la telemetría usa los datos de macOS y el tráfico de red sale a 0.

| Variable | Por defecto | Descripción |
|---|---|---|
| `ADMIN_USER` / `ADMIN_PASSWORD` | *(asistente)* | Acceso al panel. Si se definen, el asistente no crea cuenta y la contraseña no se puede cambiar desde Ajustes |
| `APP_SECRET` | se genera en `/data/.secret` | Firma de sesiones y cifrado |
| `COOLIFY_URL` / `COOLIFY_TOKEN` | `http://coolify:8080` / *(asistente)* | API de Coolify |
| `COOLIFY_DB_ACCESS` | `internal` | `internal` (red docker) o `external` (URL pública) |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Socket de Docker |
| `HOST_PROC` / `HOST_ROOT` | `/proc` / `/` | Montajes del host para la telemetría |
| `TELEMETRY_INTERVAL_MS` | `2000` | Frecuencia de muestreo del host |
