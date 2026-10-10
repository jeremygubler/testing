/**
 * Bundles the built game into one self-contained HTML file that runs straight
 * from disk, with no server and no Node.js required.
 *
 * Browsers refuse to load *external* ES modules over `file://`, which is why
 * the normal `dist/index.html` cannot simply be double-clicked. Inlining the
 * script sidesteps that: an inline module has nothing to fetch.
 *
 * Run after `vite build`; see the `build:single` npm script.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DIST = 'dist';
const OUT_FILE = path.join('release', 'dino-dash.html');

const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
const assets = await readdir(path.join(DIST, 'assets'));

let result = html;

// Inline every stylesheet Vite extracted.
for (const file of assets.filter((name) => name.endsWith('.css'))) {
  const css = await readFile(path.join(DIST, 'assets', file), 'utf8');
  const link = new RegExp(`<link[^>]+href="[^"]*${escapeRegExp(file)}"[^>]*>`);
  if (!link.test(result)) continue;
  result = result.replace(link, () => `<style>\n${css}\n</style>`);
}

// Inline every module script.
let inlined = 0;
for (const file of assets.filter((name) => name.endsWith('.js'))) {
  const code = await readFile(path.join(DIST, 'assets', file), 'utf8');
  const tag = new RegExp(`<script[^>]+src="[^"]*${escapeRegExp(file)}"[^>]*></script>`);
  if (!tag.test(result)) continue;

  // A literal `</script>` inside the bundle would close the tag early.
  if (/<\/script/i.test(code)) {
    throw new Error(`${file} contains a literal </script> and cannot be inlined safely`);
  }

  result = result.replace(tag, () => `<script type="module">\n${code}\n</script>`);
  inlined++;
}

if (inlined === 0) throw new Error('no script tag was inlined — did vite build run?');

// Nothing may still point at a separate file, or the page breaks over file://.
const leftover = result.match(/(?:src|href)="\.?\/?assets\/[^"]+"/g);
if (leftover) throw new Error(`unresolved external references: ${leftover.join(', ')}`);

await mkdir(path.dirname(OUT_FILE), { recursive: true });
await writeFile(OUT_FILE, result, 'utf8');

const kb = (Buffer.byteLength(result, 'utf8') / 1024).toFixed(1);
console.log(`${OUT_FILE} written (${kb} kB, ${inlined} script${inlined === 1 ? '' : 's'} inlined)`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
