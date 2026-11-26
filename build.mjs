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

/** (0.99) The game's people, out loud: assets/voice/*.mp3, served at voice/ (tools/voice/make.py). */
function copyVoice() {
  if (!existsSync('assets/voice')) return;
  mkdirSync('dist/voice', { recursive: true });
  for (const f of readdirSync('assets/voice')) if (f.endsWith('.mp3')) copyFileSync(`assets/voice/${f}`, `dist/voice/${f}`);
}
/** The game's icon (0.61.6): assets/icon/* sit next to index.html (tab icon, home screen, link previews). */
function copyIcons() {
  if (!existsSync('assets/icon')) return;
  for (const f of readdirSync('assets/icon')) copyFileSync(`assets/icon/${f}`, `dist/${f}`);
  writeFileSync('dist/manifest.webmanifest', JSON.stringify({
    name: 'Afterwish', short_name: 'Afterwish', start_url: './', display: 'standalone', background_color: '#06080f', theme_color: '#10142a',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }, null, 2));
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
  // (0.57.8) What the newest page is, for a page to check past every cache (main.js checkNewest).
  writeFileSync('dist/version.json', JSON.stringify({ version, tag }) + '\n');
  // (0.99.11) Lacuna's test land: a page of its own (lacuna.html), apart from the game
  writeFileSync('dist/lacuna.html', readFileSync('src/lacuna/index.html', 'utf8').replace('__VERSION__', version).replace('<script src="lacuna.js"></script>', `<script src="lacuna.js?v=${tag}"></script>`));
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
copyIcons();
copyVoice();
if (watching) {
  const ctx = await context(options);
  await ctx.watch();
  watch('src', { recursive: false }, (event, file) => {
    if (file && (file.endsWith('.html') || file.endsWith('.css'))) writeHtml();
  });
  console.log('Watching src/ for changes. Refresh the browser after each rebuild.');
} else {
  await build(options);
  await build({ ...options, entryPoints: ['src/lacuna/main.js'], outfile: 'dist/lacuna.js' }); // (0.99.11) Lacuna's test land
}
