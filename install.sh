#!/usr/bin/env bash
# Instalador de V-HUB: el panel para tu VPS con Coolify.
#
#   curl -fsSL https://raw.githubusercontent.com/JeanCarlos82/v-hub/main/install.sh | sudo bash
#
# Volver a ejecutarlo actualiza V-HUB a la última versión (los datos se conservan).
#
# Variables opcionales:
#   VHUB_DOMAIN   dominio del panel (por defecto: vhub.<IP>.sslip.io)
#   VHUB_DIR      carpeta de instalación (por defecto: /opt/v-hub)
#   VHUB_IMAGE    imagen Docker (por defecto: ghcr.io/jeancarlos82/v-hub:latest)
#   VHUB_NO_PULL  =1 para no descargar la imagen (pruebas con una imagen local)
set -euo pipefail

VHUB_DIR="${VHUB_DIR:-/opt/v-hub}"
DEFAULT_IMAGE="ghcr.io/jeancarlos82/v-hub:latest"
CONTAINER="vhub"

if [ -t 1 ]; then
  BOLD=$'\e[1m'; DIM=$'\e[2m'; GREEN=$'\e[32m'; RED=$'\e[31m'; YELLOW=$'\e[33m'; RESET=$'\e[0m'
else
  BOLD=""; DIM=""; GREEN=""; RED=""; YELLOW=""; RESET=""
fi
ok()   { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$*"; }
info() { printf '  %s•%s %s\n' "$DIM" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail() { printf '\n  %s✖ %s%s\n\n' "$RED" "$*" "$RESET" >&2; exit 1; }

# Lee una variable de un .env existente (para conservarla al actualizar)
env_get() { [ -f "$VHUB_DIR/.env" ] && sed -n "s/^$1=//p" "$VHUB_DIR/.env" | tail -1 || true; }

printf '\n  %sV-HUB%s · instalador\n\n' "$BOLD" "$RESET"

# --- 1. Requisitos ---
command -v docker >/dev/null 2>&1 || fail "Docker no está instalado. Instala primero Coolify: https://coolify.io/docs/get-started/installation"
docker info >/dev/null 2>&1 || fail "No tengo permiso para usar Docker. Ejecuta el instalador con sudo."
docker compose version >/dev/null 2>&1 || fail "Falta el plugin «docker compose». Coolify lo instala; ¿está Coolify instalado?"
ok "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null)"

docker network inspect coolify >/dev/null 2>&1 \
  || fail "No encuentro Coolify (falta la red «coolify»). Instálalo primero: https://coolify.io/docs/get-started/installation"
if [ "$(docker inspect -f '{{.State.Running}}' coolify 2>/dev/null || true)" != "true" ]; then
  fail "Coolify está instalado pero su contenedor no está en marcha. Arráncalo y vuelve a ejecutar el instalador."
fi
ok "Coolify detectado"

# Proxy de Coolify: Traefik (por defecto) o Caddy
PROXY_IMAGE="$(docker inspect -f '{{.Config.Image}}' coolify-proxy 2>/dev/null || true)"
case "$PROXY_IMAGE" in
  *caddy*) PROXY="caddy" ;;
  *) PROXY="traefik" ;;
esac
[ -z "$PROXY_IMAGE" ] && warn "No encuentro el proxy de Coolify (coolify-proxy); asumo Traefik."
ok "Proxy: $PROXY"

# --- 2. Instalación previa hecha a mano (otra carpeta) ---
EXISTING_DIR="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$CONTAINER" 2>/dev/null || true)"
if [ -n "$EXISTING_DIR" ] && [ "$EXISTING_DIR" != "$VHUB_DIR" ]; then
  fail "Ya hay un V-HUB instalado en $EXISTING_DIR.
     Para pasarte al instalador (tus datos se conservan):
       cd $EXISTING_DIR && docker compose down
     y vuelve a ejecutar este comando."
fi

# --- 3. Configuración ---
IMAGE="${VHUB_IMAGE:-$(env_get VHUB_IMAGE)}"
IMAGE="${IMAGE:-$DEFAULT_IMAGE}"

DOMAIN="${VHUB_DOMAIN:-$(env_get VHUB_DOMAIN)}"
if [ -z "$DOMAIN" ]; then
  IP="$(curl -4fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [ -z "$IP" ] && IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -z "$IP" ] && fail "No pude averiguar la IP pública. Indica un dominio: VHUB_DOMAIN=panel.tudominio.com"
  DOMAIN="vhub.${IP}.sslip.io"
fi
ok "Dominio: $DOMAIN"

mkdir -p "$VHUB_DIR"
cat > "$VHUB_DIR/.env" <<EOF
# Generado por el instalador de V-HUB. Puedes cambiar estos valores y volver a ejecutar el instalador.
VHUB_DOMAIN=$DOMAIN
VHUB_IMAGE=$IMAGE
EOF

if [ "$PROXY" = "caddy" ]; then
  PROXY_LABELS='      - caddy_0=https://${VHUB_DOMAIN}
      - caddy_0.reverse_proxy={{upstreams 4000}}'
else
  PROXY_LABELS='      - traefik.enable=true
      - traefik.http.routers.vhub.rule=Host(`${VHUB_DOMAIN}`)
      - traefik.http.routers.vhub.entrypoints=https
      - traefik.http.routers.vhub.tls=true
      - traefik.http.routers.vhub.tls.certresolver=letsencrypt
      - traefik.http.services.vhub.loadbalancer.server.port=4000
      - traefik.http.routers.vhub-http.rule=Host(`${VHUB_DOMAIN}`)
      - traefik.http.routers.vhub-http.entrypoints=http
      - traefik.http.routers.vhub-http.middlewares=vhub-https
      - traefik.http.middlewares.vhub-https.redirectscheme.scheme=https'
fi

cat > "$VHUB_DIR/docker-compose.yml" <<EOF
# Generado por el instalador de V-HUB (se reescribe al actualizar).
name: v-hub
services:
  vhub:
    image: \${VHUB_IMAGE}
    container_name: $CONTAINER
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock # gestión de contenedores, stats y logs
      - /proc:/host/proc:ro                       # CPU, RAM, red y carga del host
      - /:/hostfs:ro                              # uso de disco del host
      - vhub-data:/data                           # SQLite: ajustes, histórico, conexiones, auditoría
    networks:
      - coolify
    labels:
$PROXY_LABELS

networks:
  coolify:
    external: true

volumes:
  vhub-data:
EOF
ok "Configuración en $VHUB_DIR"

# --- 4. Descargar y arrancar ---
cd "$VHUB_DIR"
if [ "${VHUB_NO_PULL:-}" != "1" ]; then
  info "Descargando $IMAGE…"
  docker compose pull --quiet || fail "No pude descargar la imagen $IMAGE"
fi
docker compose up -d --remove-orphans >/dev/null 2>&1 || { docker compose up -d; fail "No se pudo arrancar V-HUB"; }

info "Esperando a que arranque…"
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$CONTAINER" wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1 \
  || fail "V-HUB no responde. Mira qué pasa con: docker logs $CONTAINER"
ok "V-HUB en marcha"

# --- 5. Resumen ---
# El código sólo existe mientras la instalación está pendiente; cada arranque genera uno nuevo
CODE=""
if docker exec "$CONTAINER" wget -qO- http://127.0.0.1:4000/api/setup/status 2>/dev/null | grep -q '"needsSetup":true'; then
  CODE="$(docker logs "$CONTAINER" 2>&1 | sed -n 's/.*Código de instalación: \([A-Z0-9-]*\).*/\1/p' | tail -1)"
fi
printf '\n  %s──────────────────────────────────────────────%s\n' "$DIM" "$RESET"
printf '  Abre:  %shttps://%s%s\n' "$BOLD" "$DOMAIN" "$RESET"
if [ -n "$CODE" ]; then
  printf '  Código de instalación:  %s%s%s\n' "$BOLD$GREEN" "$CODE" "$RESET"
  printf '  %sEl asistente te pedirá este código, tu contraseña y un token de Coolify.%s\n' "$DIM" "$RESET"
else
  printf '  %sV-HUB ya estaba configurado: entra con tu usuario y contraseña.%s\n' "$DIM" "$RESET"
fi
printf '  %s──────────────────────────────────────────────%s\n\n' "$DIM" "$RESET"
info "El certificado HTTPS puede tardar un minuto la primera vez."
info "Para actualizar V-HUB, vuelve a ejecutar el mismo comando."
printf '\n'
