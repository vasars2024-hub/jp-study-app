// Scope media-captions' package CSS to the Media workspace and regenerate the
// video-core-media-captions.ts whole-file substitution that imports it.
//
// usage: node docs/migration/tools/make-media-captions-substitution.mjs

import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const REPO = 'C:/Users/Arseniy/Projects/jp-study-app';
const UPSTREAM = 'C:/Users/Arseniy/Projects/seanime-upstream/seanime-web';
const REL = 'app/(main)/_features/video-core/video-core-media-captions.ts';
const outputCss = path.join(REPO, 'src/media/mediaCaptions.css');
const outputSource = path.join(REPO, 'vendor/seanime-web', REL);

const styleFiles = [
  path.join(REPO, 'node_modules/media-captions/styles/captions.css'),
  path.join(REPO, 'node_modules/media-captions/styles/regions.css'),
];

const cssRoot = postcss.parse(styleFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n'));
cssRoot.walkRules(rule => {
  let parent = rule.parent;
  while (parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
    parent = parent.parent;
  }
  rule.selectors = rule.selectors.map(selector => `#media-workspace ${selector}`);
});

const cssHeader = `/**
 * Generated, workspace-scoped media-captions 1.0.4 styles.
 * Source: media-captions/styles/{captions,regions}.css (MIT).
 * Regenerate with docs/migration/tools/make-media-captions-substitution.mjs.
 */

`;
fs.writeFileSync(outputCss, cssHeader + cssRoot.toString());

let source = fs.readFileSync(path.join(UPSTREAM, 'src', REL), 'utf8');
const importBlock =
  'import "media-captions/styles/captions.css"\r\n' +
  'import "media-captions/styles/regions.css"\r\n';
if (!source.includes(importBlock)) {
  throw new Error('upstream media-captions style imports moved; re-measure before regenerating');
}
source = source.replace(
  importBlock,
  'import "../../../../../../src/media/mediaCaptions.css"\r\n',
);

const sourceHeader = `/**
 * STUDY OS SUBSTITUTION — replaces Seanime's ${REL}.
 *
 * The only source change is redirecting media-captions' two global stylesheets to a
 * generated copy whose selectors are scoped beneath #media-workspace. Runtime code is
 * byte-identical to pinned upstream 9bdd052.
 *
 * Regenerate with docs/migration/tools/make-media-captions-substitution.mjs.
 * Whole-file replacement, never an inline vendor edit. See vendor/seanime-web/ADOPTION.md.
 */

`.replace(/\n/g, '\r\n');

fs.writeFileSync(outputSource, sourceHeader + source);
console.log(`written ${path.relative(REPO, outputCss)}`);
console.log(`written ${path.relative(REPO, outputSource)}`);
