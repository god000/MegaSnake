#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/megasnake}"
SERVICE_NAME="megasnake"
NGINX_SITE="/etc/nginx/sites-available/megasnake"

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-on-vps.sh"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  apt-get update
  apt-get install -y curl nginx
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude node_modules \
  --exclude .git \
  ./ "$APP_DIR/"

cd "$APP_DIR"
npm ci
npm run build

install -m 644 deploy/megasnake.service "/etc/systemd/system/${SERVICE_NAME}.service"
install -m 644 deploy/nginx-megasnake.conf "$NGINX_SITE"
ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/megasnake"
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"
nginx -t
systemctl reload nginx

PUBLIC_IP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
echo
echo "MegaSnake is up."
echo "Open: http://${PUBLIC_IP}/"
echo "If you use a domain, point DNS to this server and set server_name in ${NGINX_SITE}."
