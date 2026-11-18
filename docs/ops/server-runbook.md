# Afterwish server world: runbook

How the server world is built, how many players one server should hold, and the exact steps to add
another server. Written for whoever sets up the next one (Ko Ko, or Claude in a later session).
Last checked: 0.55.2, November 2026.

## 1. What a server is

- **One server = one world.** Players join it from the game (Play with friends → Server world), pick
  it from the server list, and type its passcode. Everyone meets in **Haven**; outside Haven each
  party gets its own copy of every map (rifts, delves and the Deep too). Progress saves in each
  player's own browser (the server sends their save every few seconds).
- **What runs on it:** `game-server/server.mjs` (Node 22, the `ws` package) runs the same rules as the
  game (`src/sim`) for everyone, 60 steps a second, through `src/net/shards.js`. **Caddy** in front
  gives it HTTPS (its own certificate, renewed by itself). **systemd** keeps it running
  (`afterwish.service`, as a locked-down `afterwish` user). **ufw** opens only SSH, 80 and 443.
- **Updates:** every push to `main` that touches the rules or the server runs the "Update server
  world" workflow: tests first, then `game-server/deploy/update.sh` on every server in the `VPS_HOST`
  secret. Players online get their save and a "restarting" message, and rejoin seconds later.
- **Settings** (on the server, `/etc/afterwish.env`, then `systemctl restart afterwish`):

  | Setting | What it does | Default |
  |---|---|---|
  | `AFTERWISH_PASSCODE` | what friends type to get in; empty = nobody gets in | asked at setup |
  | `WORLD_NAME` | the world's name in the game | Haven |
  | `MAX_PLAYERS` | players on this server at once | 24 |
  | `HAVEN_MAX` | players in one copy of Haven before another opens | 16 |
  | `PORT` | where Node listens (Caddy forwards to it) | 8787 |
  | `ALLOWED_ORIGINS` | pages allowed to connect | the game's site and localhost |

## 2. How many players one server should hold

The goal: nobody loses frames, on the server or on their own computer.

**On the server** (measured, `node /tmp/swbench.mjs`, 1 shared vCPU class machine):

| Players online | Map copies | Updates a second | Server time per step (of 16.7 ms) | Sent in all |
|---|---|---|---|---|
| 8 | 7 | 60 | ~1.8 ms | ~425 KB/s |
| 16 | 13 | 30 | ~2.4 ms | ~530 KB/s |
| 24 | 17 | 20 | ~2.9 ms (worst ~15 ms) | ~670 KB/s |

Updates per second drop as more join (60 up to 8 players, 30 up to 16, then 20), which keeps the
server's work nearly flat. A 1 vCPU / 1 GB server holds **24** comfortably.

**On each player's computer:** each other hero in view costs about 15 draw calls (Haven with 24
heroes: ~530 draws, ~157k triangles, against ~175 alone). That is why **Haven splits at 16**
(`HAVEN_MAX`): a crowd opens Haven 2 instead of slowing everyone's frame rate. Road maps hold at
most 8 per copy (a party is 4).

**Rules of thumb:**
- 1 vCPU / 1 GB (Vultr High Performance `vhp-1c-1gb`, US$6/mo): `MAX_PLAYERS=24`.
- 2 vCPU / 2–4 GB: still one Node process (one core does the stepping), so more players means a
  faster core, not more cores. Raise to ~40 only after watching `/health` at a busy time.
- **Watch `/health`** at the busiest time: `stepMs` (average) under ~6 and `worstMs` under ~16
  means there is room. Above that, lower `MAX_PLAYERS` or move to a faster plan.
- **Bandwidth:** the US$6 plan includes 2 TB a month. 24 players online 4 hours a day is roughly
  0.3 TB. Full 24/7 would be ~1.7 TB.
- When a server is full, players see "This server is full" and pick another from the list. More
  players than that: add a server (section 3).

## 3. Adding a server (about 20 minutes)

Pick a short id and name first, e.g. `sg2` / "Haven 2" / `play2.stunnedgames.net`.

1. **Rent it** (Vultr → Compute → Create Instance):
   - Shared CPU → **High Performance**, plan **vhp-1c-1gb** (1 vCPU, 1 GB, $6/mo)
   - **Location** nearest the players it is for (Singapore for players in Singapore)
   - **Image:** Ubuntu 24.04 LTS x64
   - **SSH key:** your saved key (e.g. "Ko Ko PC"). Save new keys first in Account → SSH Keys.
   - **Automatic Backups:** on (+$1.20) once servers hold anything precious; **DDoS Protection:** off
     (see step 8); **Limited User Login:** off; hostname and label: the id (e.g. `afterwish-sg2`).
   - It may show "Pending" in the list for a while after it is actually up; try `ssh` anyway.
2. **DNS** (Squarespace Domains → stunnedgames.net → DNS → Custom records → Add record):
   type **A**, name **`play2`**, data **the server's IP**, TTL **5 mins**. Do not touch other records.
3. **Set it up:** `ssh root@<IP>` (type `yes` the first time), then:
   ```
   curl -fsSL https://raw.githubusercontent.com/STUNNED9933/afterwish/main/game-server/deploy/setup.sh | bash -s -- play2.stunnedgames.net "Haven 2"
   ```
   Give it its passcode when asked. When it says Done: `https://play2.stunnedgames.net/health`
   shows `"open":true` (allow a few minutes for DNS and the certificate).
4. **Capacity:** if it is not a 1 vCPU / 1 GB server, set `MAX_PLAYERS` in `/etc/afterwish.env`
   (section 2), then `systemctl restart afterwish`.
5. **Automatic updates:** on the new server, add the GitHub deploy key, limited to updating
   (one line; the key is in `C:\Users\cooki\.ssh\afterwish_deploy.pub` on Ko Ko's PC):
   ```
   echo 'command="bash /opt/afterwish/game-server/deploy/update.sh",no-port-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAXlI5MeWRuHp1+wWPm8G6e6nUUOZKop0LgsmtzgovR0 github-deploy' >> ~/.ssh/authorized_keys
   ```
   Then on GitHub (repo → Settings → Secrets and variables → Actions → `VPS_HOST` → Update), add the
   new IP after the old one, separated by a space: `45.77.41.185 <new IP>`. Run the "Update server
   world" workflow once (Actions tab → Run workflow) and check it says `Updated to ...` for both.
6. **List it in the game:** add a line to `src/net/servers.js`:
   `{ id: 'sg2', name: 'Haven 2', region: 'Singapore', url: 'wss://play2.stunnedgames.net' },`
   and push. The list shows each server's players online, live.
7. **Check in the game:** reload (Ctrl+F5), Play with friends → Server world → pick it → passcode →
   Join. F3 shows the ping and roughly how long a click takes to show.
8. **DDoS protection (optional, free):** only if stunnedgames.net's DNS moves to Cloudflare (today it
   is on Squarespace, which has no proxy). Then switch the `play`/`play2` records to Proxied (orange
   cloud) and set SSL/TLS to Full (strict). WebSockets pass through.
9. **Write it down:** add the server to section 7 below.

## 4. Before a server is public (no passcode)

Not built yet; do these first (each is a code change, ask Claude):
- **Accounts and saves on the server.** Today each player's browser sends its own save when it
  joins, so a public server would trust whatever a stranger sends (edited gear, levels). Online
  progress (sign in with Discord or Google, saves kept on the server, nightly save backups) fixes
  that and is planned anyway.
- **Moderation:** kick, ban (by account), mute, a report button, and a chat filter.
- **A public mode switch** (`AFTERWISH_PUBLIC=1`) that allows no passcode, only once the above exist.
- DDoS proxy (step 8) on, and a short privacy note and rules page on the site.

Until then, keep a passcode on every server.

## 5. Running it

| To... | Do (on the server, as root) |
|---|---|
| see if it is running | `systemctl status afterwish --no-pager`, or open `/health` |
| watch its log | `journalctl -u afterwish -f` (Ctrl+C to stop) |
| restart it | `systemctl restart afterwish` |
| change the passcode or limits | `nano /etc/afterwish.env`, then restart |
| update it by hand | `bash /opt/afterwish/game-server/deploy/update.sh` |
| undo a bad update | revert the commit on GitHub (the next update installs the revert) |
| see the HTTPS side | `journalctl -u caddy --no-pager | tail -30` |

Keep 2FA (with a backup method) on Vultr and GitHub, and never share the private halves of the SSH
keys (`id_ed25519`, `afterwish_deploy`).

## 6. When something goes wrong

- **"dubious ownership" in an update:** run `git config --global --add safe.directory /opt/afterwish`
  once on that server (new setups do this themselves).
- **Vultr says Pending for long:** check email and Billing for a verification or payment step; try
  `ssh` anyway (the list lags).
- **`/health` does not load:** DNS not there yet (wait), or the certificate failed: Caddy's log (above).
- **"different versions of the game":** players reload with Ctrl+F5 (the site and the server update
  together on each push).
- **Server shows "not answering" in the list:** `systemctl status afterwish`; then its log.
- **Laggy for everyone:** `/health` `stepMs`/`worstMs` (section 2); `htop` for anything else using the CPU.

## 7. Servers

| Id | Name | Address | IP | Region | Plan | Since |
|---|---|---|---|---|---|---|
| sg1 | Haven | play.stunnedgames.net | 45.77.41.185 | Singapore (Vultr) | vhp-1c-1gb, $6 + backups $1.20/mo | 2026-11-18 |
