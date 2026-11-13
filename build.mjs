// Build script: bundles src/ into two files in dist/
//   dist/index.html  (page + styles)
//   dist/game.js     (all game code + Three.js, minified)
// Open dist/index.html in a browser to play. No server needed.
//
//   npm run build   build once
//   npm run watch   rebuild whenever a file in src/ changes
import { build, context } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, watch } from 'node:fs';

const watching = process.argv.includes('--watch');

function writeHtml() {
  const css = readFileSync('src/style.css', 'utf8');
  const html = readFileSync('src/index.html', 'utf8').replace('/*__CSS__*/', () => css);
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
  logLevel: 'info',
};

writeHtml();
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
