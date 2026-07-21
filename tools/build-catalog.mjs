// Generates catalog-repo/catalog.json from the app's bundled fallback so the two
// never drift. Run:  node tools/build-catalog.mjs
// Then upload catalog-repo/catalog.json to the vasars2024-hub/jp-study-app-catalog
// GitHub repo (edit it there afterwards to push content updates without an app release).

import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const cacheOut = path.join(process.cwd(), 'node_modules', '.cache', 'catalogFallback.mjs');
mkdirSync(path.dirname(cacheOut), { recursive: true });

await build({
  entryPoints: ['src/renderer/data/catalogFallback.ts'],
  bundle: true,
  format: 'esm',
  outfile: cacheOut,
  logLevel: 'silent',
});

const mod = await import(`${pathToFileURL(cacheOut).href}?t=${Date.now()}`);
const catalog = mod.CATALOG_FALLBACK;
if (!catalog || catalog.schemaVersion !== 1) {
  throw new Error('catalogFallback did not export a valid CATALOG_FALLBACK');
}

mkdirSync('catalog-repo', { recursive: true });
writeFileSync('catalog-repo/catalog.json', `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
console.log(
  `Wrote catalog-repo/catalog.json (${catalog.bundles.length} bundles, ${catalog.newSection.length} new entries)`,
);
