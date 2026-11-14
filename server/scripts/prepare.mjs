// Finds (or creates) the "afterwish" D1 database and writes wrangler.generated.toml with its id.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (GitHub secrets).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const wrangler = (args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const find = () => JSON.parse(wrangler(['d1', 'list', '--json'])).find((d) => d.name === 'afterwish');
let db = find();
if (!db) {
  console.log('Creating the afterwish D1 database');
  wrangler(['d1', 'create', 'afterwish']);
  db = find();
}
if (!db || !db.uuid) throw new Error('Could not find or create the D1 database');
const config = readFileSync('wrangler.toml', 'utf8').replace('__D1_DATABASE_ID__', db.uuid);
writeFileSync('wrangler.generated.toml', config);
console.log('D1 database', db.uuid);
