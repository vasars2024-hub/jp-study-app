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
const mediaFile = names.find(name => /^MediaWorkspace-.*\.css$/.test(name));
const mainFile = names.find(name => /^main-.*\.css$/.test(name));

if (!mediaFile || !mainFile) {
  throw new Error(`missing built CSS chunks: media=${mediaFile} main=${mainFile}`);
}

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

if (unscoped.length) {
  console.error(unscoped.join('\n'));
  process.exitCode = 1;
}
if (mainTailwindTokens) process.exitCode = 1;
