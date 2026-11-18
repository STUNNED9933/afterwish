#!/usr/bin/env bash
# Update the server world to the latest game (run by the deploy workflow, or by hand as root).
# Players get their latest save and a "restarting" message, then can rejoin a few seconds later.
set -euo pipefail
cd /opt/afterwish
# the files belong to the game's own user; git is run here by root, so tell git that is fine
git config --global --get-all safe.directory | grep -qx /opt/afterwish || git config --global --add safe.directory /opt/afterwish
git fetch --depth 1 origin main
git reset --hard origin/main
cd game-server && npm ci --omit=dev
chown -R afterwish:afterwish /opt/afterwish
# the service file can change with the game (0.57: a folder for accounts); install it if it did
if ! cmp -s /opt/afterwish/game-server/deploy/afterwish.service /etc/systemd/system/afterwish.service; then
  cp /opt/afterwish/game-server/deploy/afterwish.service /etc/systemd/system/afterwish.service
  systemctl daemon-reload
fi
systemctl restart afterwish
echo "Updated to $(git -C /opt/afterwish log -1 --format=%h) and restarted."
