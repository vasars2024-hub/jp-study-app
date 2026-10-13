// @vitest-environment node
/**
 * v1 release: the third-party notices are complete and ship.
 *
 *  - Every production npm package (package.json `dependencies`, and every
 *    non-dev entry of package-lock.json) is in THIRD_PARTY_LICENSES.json with
 *    its lockfile version, a licence and a licence text, and is named in the
 *    generated block of THIRD_PARTY_NOTICES.md. Adding a dependency without
 *    running `node tools/generate-notices.cjs` fails here.
 *  - Every hand-curated component (`src/shared/thirdPartyBundled.json`) is in
 *    the machine-readable list and named in the notices, and the attribution
 *    statements the licences require are present (EDRDG, CC BY-SA, Tatoeba,
 *    the NAIST notice kuromoji's Apache NOTICE carries, FFmpeg's GPL source).
 *  - forge.config.ts ships the licence, both notices files and PRIVACY.md.
 *
 * Machine-independent on purpose: it compares against the committed lockfile,
 * not the local node_modules, so it holds on any OS.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const require_ = createRequire(__filename);
const generator = require_(resolve(ROOT, 'tools', 'generate-notices.cjs')) as { BEGIN: string; END: string };

interface NpmEntry {
  name: string;
  version: string;
  license: string;
  licenseText: string;
  installed: boolean;
  direct: boolean;
}
interface LicencesDoc {
  app: { license: string; source: string };
  bundled: Array<{ id: string; name: string; license: string; attribution: string }>;
  npm: NpmEntry[];
}

const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; license: string };
const lock = JSON.parse(read('package-lock.json')) as {
  packages: Record<string, { version?: string; dev?: boolean; devOptional?: boolean }>;
};
const doc = JSON.parse(read('THIRD_PARTY_LICENSES.json')) as LicencesDoc;
const notices = read('THIRD_PARTY_NOTICES.md');
const bundled = JSON.parse(read('src/shared/thirdPartyBundled.json')) as { components: LicencesDoc['bundled'] };

const generated = (() => {
  const a = notices.indexOf(generator.BEGIN);
  const b = notices.indexOf(generator.END);
  return a >= 0 && b > a ? notices.slice(a, b) : '';
})();

/** Every production (non-dev) package the lockfile installs, as name@version. */
function productionPackages(): Set<string> {
  const out = new Set<string>();
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key.includes('node_modules/') || entry.dev || entry.devOptional) continue;
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.add(`${name}@${entry.version}`);
  }
  return out;
}

describe('npm packages in the notices', () => {
  const listed = new Map(doc.npm.map((p) => [`${p.name}@${p.version}`, p]));

  it('has the generated block', () => {
    expect(generated.length).toBeGreaterThan(1000);
  });

  it('every direct production dependency is listed, as a direct dependency, in both files', () => {
    const missing: string[] = [];
    for (const name of Object.keys(pkg.dependencies)) {
      const entries = doc.npm.filter((p) => p.name === name);
      if (!entries.length || !entries.some((p) => p.direct)) missing.push(`${name} (THIRD_PARTY_LICENSES.json)`);
      if (!generated.includes(`**${name}** `)) missing.push(`${name} (THIRD_PARTY_NOTICES.md)`);
    }
    expect(missing, 'run `node tools/generate-notices.cjs`').toEqual([]);
  });

  it('every non-dev package of package-lock.json is listed at its locked version', () => {
    const missing = [...productionPackages()].filter((id) => !listed.has(id));
    expect(missing, 'run `node tools/generate-notices.cjs`').toEqual([]);
    // …and nothing stale (a removed or bumped package) is left behind.
    const stale = [...listed.keys()].filter((id) => !productionPackages().has(id));
    expect(stale, 'run `node tools/generate-notices.cjs`').toEqual([]);
  });

  it('every installed package has a licence and the text of it', () => {
    const bad = doc.npm
      .filter((p) => p.installed)
      .filter((p) => !p.license || p.license === 'UNKNOWN' || !p.licenseText.trim())
      .map((p) => `${p.name}@${p.version}`);
    expect(bad).toEqual([]);
    for (const p of doc.npm.filter((x) => x.installed)) {
      expect(generated, `${p.name}@${p.version}`).toContain(`**${p.name}** ${p.version} — ${p.license}`);
    }
  });

  it('records the app itself as GPL-3.0-or-later with its source repository', () => {
    expect(doc.app.license).toBe(pkg.license);
    expect(pkg.license).toBe('GPL-3.0-or-later');
    expect(doc.app.source).toBe('https://github.com/vasars2024-hub/jp-study-app');
  });
});

describe('bundled, downloaded and binary components', () => {
  it('the machine-readable list carries the curated components unchanged', () => {
    expect(doc.bundled).toEqual(bundled.components);
    expect(bundled.components.length).toBeGreaterThanOrEqual(20);
  });

  it('every curated component is named in THIRD_PARTY_NOTICES.md', () => {
    // A short, distinctive word of each name (the notices use prose, not the JSON names).
    const anchors: Record<string, RegExp> = {
      jmdict: /### JMdict/,
      'kanjidic-jmnedict': /### KANJIDIC2 and JMnedict/,
      moedict: /### Moedict/,
      'cc-cedict': /### CC-CEDICT/,
      kanjium: /### Kanjium/,
      tatoeba: /### Tatoeba/,
      'wiktionary-ru': /### Russian Wiktionary/,
      frequencywords: /FrequencyWords/,
      'jpdb-frequency': /JPDB v2\.2/,
      'kuromoji-ipadic': /### kuromoji\.js and mecab-ipadic/,
      tesseract: /### Tesseract\.js and Tesseract OCR/,
      onnxruntime: /### ONNX Runtime/,
      ffmpeg: /### FFmpeg/,
      '7zip': /### 7-Zip/,
      seanime: /### Seanime/,
      jassub: /### JASSUB/,
      roboto: /Roboto Medium/,
      'world-map': /### World map/,
      'react-icons': /react-icons/,
      'gum-icons': /## Icons and artwork/,
      electron: /### Electron and Chromium/,
      sqlite: /### SQLite/,
      'llama-cpp': /### llama\.cpp/,
      'models-on-request': /## Downloaded on request/,
      'not-bundled': /## Programs Gum works with but does not ship/,
    };
    const unanchored = bundled.components.filter((c) => !anchors[c.id]).map((c) => c.id);
    expect(unanchored, 'add an anchor for each new component').toEqual([]);
    const missing = bundled.components.filter((c) => !anchors[c.id].test(notices)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it('carries the attribution statements the licences require', () => {
    // EDRDG licence: the use of the files is acknowledged, with the licence's address.
    expect(notices).toContain(
      'This application uses the JMdict dictionary files. These files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group\'s licence.',
    );
    expect(notices).toContain('https://www.edrdg.org/edrdg/licence.html');
    // CC BY-SA 4.0 attribution for the share-alike data.
    expect(notices).toMatch(/Creative Commons Attribution-ShareAlike 4\.0 International/);
    expect(notices).toContain('Paul Andrew Denisowski');
    // Tatoeba, CC BY 2.0 FR.
    expect(notices).toContain('https://creativecommons.org/licenses/by/2.0/fr/');
    // Apache-2.0 §4(d): kuromoji's NOTICE (the NAIST / ICOT terms of mecab-ipadic), verbatim.
    expect(notices).toContain('Copyright 2000, 2001, 2002, 2003 Nara Institute of Science');
    expect(notices).toContain('ICOT Free Software');
    // GPL builds that ship: FFmpeg's corresponding source, Seanime's modifications.
    expect(notices).toContain('https://github.com/FFmpeg/FFmpeg/commit/e38092ef93');
    expect(notices).toContain('9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9');
    expect(notices).toContain('patches/seanime/');
  });
});

describe('the documents ship in the packaged app', () => {
  it('forge.config.ts copies LICENSE, both notices files and PRIVACY.md into resources/', () => {
    const forge = read('forge.config.ts');
    const list = /const SHIPPED_DOCUMENTS = \[([^\]]*)\]/.exec(forge)?.[1] ?? '';
    for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.json', 'PRIVACY.md']) {
      expect(list, file).toContain(`'${file}'`);
      expect(() => read(file), file).not.toThrow();
    }
    expect(forge).toMatch(/extraResource:\s*\[[^\]]*\.\.\.SHIPPED_DOCUMENTS/);
  });
});
