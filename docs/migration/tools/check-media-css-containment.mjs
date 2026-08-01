// Verify the production renderer kept every Media workspace selector scoped and did not
// merge Tailwind state into the shell stylesheet.
//
// usage: node docs/migration/tools/check-media-css-containment.mjs [dist-dir]

import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const dist = path.resolve(process.argv[2] ?? 'dist');
const assets = path.join(dist, 'assets');
const names = fs.readdirSync(assets);

// Found by CONTENT, not by chunk name. This matched /^MediaWorkspace-.*\.css$/ until
// slice 15, when `import './mediaWorkspace.css'` moved from MediaWorkspace.tsx into the
// shared MediaSurfaceShell.tsx — Vite names a CSS chunk after the JS chunk that imports
// it, so the hardcoded name would have gone missing and this gate would have thrown
// "missing built CSS chunks" instead of checking anything. A gate that identifies its
// input by a name the code is free to change is a gate waiting to rot.
//
// More than one chunk may legitimately mention the scope id: a shell stylesheet that
// frames an embedded surface writes `#media-workspace.blanc-study-player`, and those rules
// belong with that shell, not with the adopted sheet. The adopted sheet is the one holding
// essentially all of them, so pick by count and PRINT the others — a chunk quietly dropped
// from a containment check is the failure mode this whole gate exists to catch.
const cssFiles = names.filter(name => name.endsWith('.css'));
const withScope = cssFiles
  .map(name => ({
    name,
    hits: (fs.readFileSync(path.join(assets, name), 'utf8').match(/#media-workspace/g) ?? []).length,
  }))
  .filter(entry => entry.hits > 0)
  .sort((a, b) => b.hits - a.hits);
const mainFile = names.find(name => /^main-.*\.css$/.test(name));

if (withScope.length === 0 || !mainFile) {
  throw new Error(
    `expected a CSS chunk containing #media-workspace and a main chunk; `
    + `got media=[${withScope.map(e => e.name).join(', ')}] main=${mainFile}`,
  );
}
const mediaFile = withScope[0].name;
const alsoScoped = withScope.slice(1);

const root = postcss.parse(fs.readFileSync(path.join(assets, mediaFile), 'utf8'));
let total = 0;
let scoped = 0;
const unscoped = [];

root.walkRules(rule => {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    parent = parent.parent;
  }

  for (const selector of rule.selectors) {
    total++;
    if (selector.includes('#media-workspace')) scoped++;
    else unscoped.push(selector);
  }
});

const mainCss = fs.readFileSync(path.join(assets, mainFile), 'utf8');
const mainTailwindTokens = mainCss.match(/--tw-/g)?.length ?? 0;

console.log(`media css          : ${mediaFile}`);
console.log(`scoped selectors   : ${scoped}/${total}`);
console.log(`unscoped selectors : ${unscoped.length}`);
console.log(`shell css          : ${mainFile}`);
console.log(`shell --tw- tokens : ${mainTailwindTokens}`);
for (const entry of alsoScoped) {
  console.log(`also scoped        : ${entry.name} (${entry.hits} references)`);
}

if (unscoped.length) {
  console.error(unscoped.join('\n'));
  process.exitCode = 1;
}
if (mainTailwindTokens) process.exitCode = 1;
