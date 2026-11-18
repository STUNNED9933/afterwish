// Build script: bundles src/ into two files in dist/
//   dist/index.html  (page + styles)
//   dist/game.js     (all game code + Three.js, minified)
// Open dist/index.html in a browser to play. No server needed.
//
//   npm run build   build once
//   npm run watch   rebuild whenever a file in src/ changes
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, watch, existsSync, readdirSync, copyFileSync } from 'node:fs';

const watching = process.argv.includes('--watch');

/** Character models (0.35): assets/models/*.glb are served next to the game, loaded when needed. */
function copyModels() {
  if (!existsSync('assets/models')) return;
  mkdirSync('dist/models', { recursive: true });
  for (const f of readdirSync('assets/models')) if (f.endsWith('.glb')) copyFileSync(`assets/models/${f}`, `dist/models/${f}`);
}

function writeHtml() {
  const css = readFileSync('src/style.css', 'utf8');
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version; // the title screen always shows the real version
  // (0.57.3) game.js gets a tag unique to this build, so a browser can never pair a new page with an
  // old cached script (that broke the title screen once: the old script looked for a button the new
  // page no longer has). The styles are inside the page itself, so they always match it.
  const tag = `${version}-${Date.now().toString(36)}`;
  const html = readFileSync('src/index.html', 'utf8').replace('/*__CSS__*/', () => css).replace('__VERSION__', version).replace('<script src="game.js"></script>', `<script src="game.js?v=${tag}"></script>`);
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', html);
}

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'dist/game.js',
  legalComments: 'eof',
  // Where the Weekly Echo server lives (set by the Pages workflow from the TRIAL_API_URL variable).
  define: { __TRIAL_API__: JSON.stringify(process.env.TRIAL_API_URL || ''), __VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version), __GAME_SERVER__: JSON.stringify(process.env.GAME_SERVER_URL || '') },
  logLevel: 'info',
};

writeHtml();
copyModels();
if (watching) {
  const ctx = await context(options);
  await ctx.watch();
  watch('src', { recursive: false }, (event, file) => {
    if (file && (file.endsWith('.html') || file.endsWith('.css'))) writeHtml();
  });
  console.log('Watching src/ for changes. Refresh the browser after each rebuild.');
} else {
  await build(options);
}
