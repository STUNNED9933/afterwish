// The game's server worlds (0.55.2), shown in Play with friends → Server world. To add one, see
// docs/ops/server-runbook.md: set it up, then add a line here (url: its wss:// address).
export const SERVERS = [
  { id: 'sg1', name: 'Haven', region: 'Singapore', url: 'wss://play.stunnedgames.net' },
];

/** A server's /health page (players online, its cap), or null if it does not answer in time. */
export async function serverHealth(url, ms = 4000) {
  const http = url.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '') + '/health';
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl && ctl.abort(), ms);
  try {
    const res = await fetch(http, { signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
