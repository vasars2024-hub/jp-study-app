#!/usr/bin/env node
/** Visible branding remap: Study OS / JP Study → GrammarX (user-facing strings only). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function rewrite(file, transform) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return false;
  const orig = fs.readFileSync(full, 'utf8');
  const next = transform(orig);
  if (next !== orig) {
    fs.writeFileSync(full, next);
    console.log('updated', file);
    return true;
  }
  return false;
}

function brandText(s) {
  return s
    .split('Secret Study OS')
    .join('Secret GrammarX')
    .split('JP Study')
    .join('GrammarX')
    .split('Study OS')
    .join('GrammarX');
}

// i18n catalogs
rewrite('src/shared/i18n/catalogs.ts', (s) => {
  let c = brandText(s);
  c = c.replace(
    /'settings\.appearance\.theme\.study-os': 'GrammarX \(default\)'/g,
    "'settings.appearance.theme.study-os': 'GrammarX Default'",
  );
  c = c.replace(
    /'settings\.appearance\.theme\.study-os': 'GrammarX（既定）'/g,
    "'settings.appearance.theme.study-os': 'GrammarX 既定'",
  );
  c = c.replace(
    /'settings\.appearance\.theme\.study-os': 'GrammarX（默认）'/g,
    "'settings.appearance.theme.study-os': 'GrammarX 默认'",
  );
  return c;
});

const uiFiles = [
  'src/renderer/theme/engine.ts',
  'src/renderer/components/DesktopShell.tsx',
  'src/renderer/components/Lockscreen.tsx',
  'src/renderer/components/settings/pages/SpecialPage.tsx',
  'src/renderer/secretLifecycle.ts',
  'src/renderer/environment/wallpaperFramework.ts',
  'src/main/extensionServer.ts',
  'src/main/chrome-extension/manifest.json',
];

for (const f of uiFiles) {
  rewrite(f, (s) => {
    let next = brandText(s);
    if (f.endsWith('engine.ts')) {
      next = next.replace(/label: 'GrammarX \(default\)'/, "label: 'GrammarX Default'");
    }
    return next;
  });
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (/\.(js|html|json)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

const extRoot = path.join(ROOT, 'extension');
if (fs.existsSync(extRoot)) {
  for (const abs of walk(extRoot)) {
    const rel = path.relative(ROOT, abs);
    rewrite(rel, brandText);
  }
}

console.log('branding done');
