#!/usr/bin/env bash
# One-time setup of the Afterwish server world on a fresh Ubuntu server (22.04 or 24.04).
# Run as root on the server:
#   curl -fsSL https://raw.githubusercontent.com/STUNNED9933/afterwish/main/game-server/deploy/setup.sh | bash -s -- play.stunnedgames.net
# It installs Node 22 and Caddy (HTTPS), puts the game in /opt/afterwish, runs it as a service,
# and asks for the passcode friends will use. Safe to run again.
set -euo pipefail
DOMAIN="${1:-play.stunnedgames.net}"
REPO="https://github.com/STUNNED9933/afterwish.git"

echo "== Afterwish server world: setting up for $DOMAIN"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https gnupg

# Node 22
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (gets and renews the HTTPS certificate by itself)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# The game, run by its own user (it never needs root)
id afterwish >/dev/null 2>&1 || useradd --system --home /opt/afterwish --shell /usr/sbin/nologin afterwish
git config --global --get-all safe.directory | grep -qx /opt/afterwish || git config --global --add safe.directory /opt/afterwish
if [ -d /opt/afterwish/.git ]; then git -C /opt/afterwish pull --ff-only; else git clone --depth 1 "$REPO" /opt/afterwish; fi
cd /opt/afterwish/game-server && npm ci --omit=dev
chown -R afterwish:afterwish /opt/afterwish

# The passcode (kept in /etc/afterwish.env, readable only by root and the service)
if [ ! -f /etc/afterwish.env ]; then
  read -r -p "Passcode for friends to join (letters and numbers): " PASS < /dev/tty
  printf 'AFTERWISH_PASSCODE=%s\nPORT=8787\nWORLD_NAME=Haven\n' "$PASS" > /etc/afterwish.env
fi
chmod 640 /etc/afterwish.env
chgrp afterwish /etc/afterwish.env

cp /opt/afterwish/game-server/deploy/afterwish.service /etc/systemd/system/afterwish.service
systemctl daemon-reload
systemctl enable --now afterwish
systemctl restart afterwish

# HTTPS in front of the game (WebSockets pass straight through)
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  reverse_proxy 127.0.0.1:8787
}
CADDY
systemctl reload caddy || systemctl restart caddy

# Firewall: only SSH and the web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Done. Check: https://$DOMAIN/health  (players, and whether it is open)"
echo "   Change the passcode: edit /etc/afterwish.env, then: systemctl restart afterwish"
