#!/usr/bin/env bash
# Update the server world to the latest game (run by the deploy workflow, or by hand as root).
# Players get their latest save and a "restarting" message, then can rejoin a few seconds later.
set -euo pipefail
# (0.60) all in one function, read in full before it runs: this script replaces itself (git reset)
main() {
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
# (0.60) the Weekly Echo boards' address (passed by the deploy workflow): kept in the env file, so the
# server world can reward online characters for taking part. Only a plain https address is accepted.
BOARDS="${1:-}"
if [[ "$BOARDS" =~ ^https://[A-Za-z0-9.-]+(/[A-Za-z0-9._/-]*)?$ ]] && [ -f /etc/afterwish.env ]; then
  if grep -q '^TRIAL_API_URL=' /etc/afterwish.env; then
    sed -i "s#^TRIAL_API_URL=.*#TRIAL_API_URL=${BOARDS}#" /etc/afterwish.env
  else
    printf 'TRIAL_API_URL=%s\n' "$BOARDS" >> /etc/afterwish.env
  fi
fi
systemctl restart afterwish
echo "Updated to $(git -C /opt/afterwish log -1 --format=%h) and restarted."
}
main "$@"
