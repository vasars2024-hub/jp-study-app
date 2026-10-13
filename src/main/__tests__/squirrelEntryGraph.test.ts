// @vitest-environment node
/**
 * `src/squirrelEntry.ts` is the bundle Electron starts (package.json `main`). Its one job is
 * to service a Squirrel.Windows lifecycle launch BEFORE the app loads: Squirrel kills the
 * hook after ~15 s, and with `src/main.ts` as the entry the hook ran only after every
 * hoisted import of the ~4.8 MB main bundle and its externals (linkedom, adm-zip,
 * ffmpeg-static...) had loaded. Measured on a warm cache that was ~305 ms before the first
 * hook step; the entry reaches it 2 ms after JS starts (squirrelEvents.ts,
 * `ENTRY_STARTUP_ALLOWANCE_MS`).
 *
 * That property dies silently: one convenient `import { x } from './main/somethingElse'`
 * in the entry or in squirrelEvents.ts drags app code back in front of the hook, and every
 * test still passes. So this file pins it three ways:
 *
 *   1. the STATIC graph (a walker over import/export/require/import() specifiers) reaches
 *      exactly the entry and squirrelEvents.ts, and only `electron` and Node builtins;
 *   2. the REAL build (Forge's own Vite config generator, same config file and target as
 *      forge.config.ts, written nowhere) is one small chunk under `BUNDLE_CAP_BYTES` whose
 *      only requires are `electron` and builtins;
 *   3. the wiring: package.json `main`, the forge build list, and the e2e snapshot all go
 *      through the entry.
 *
 * Each has a control so a walker or build that silently sees nothing cannot pass: the
 * walker must find the heavy externals from src/main.ts, and the built chunk must hold the
 * hook (over 1 KB, the `--squirrel-install` flag, exactly the two source modules).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '..', '..', '..');
const ENTRY = 'src/squirrelEntry.ts';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];

/** Everything the entry may reach. Adding a file here needs the same argument as the entry. */
const ALLOWED_FILES = ['src/main/squirrelEvents.ts', 'src/squirrelEntry.ts'];
const ALLOWED_BARE = new Set(['electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
/**
 * What must never load before the hook: the app bundle itself, and the heavy externals and
 * native modules the main bundle requires (vite.main.config.ts `external`, plus the
 * auto-externalized natives).
 */
const FORBIDDEN_FILES = ['src/main.ts', 'src/preload.ts'];
const FORBIDDEN_BARE = [
  'adm-zip',
  'ffmpeg-static',
  'linkedom',
  '@mozilla/readability',
  'node-llama-cpp',
  'onnxruntime-node',
  'better-sqlite3',
  'sql.js',
  '7z-wasm',
  'kuromoji',
  'pdfjs-dist',
];
/**
 * The built entry chunk. It was 6,140 bytes when written (squirrelEvents.ts minified plus
 * the boot call); the app's main chunk is ~4.8 MB. The cap leaves room for the hook to grow
 * and none for an app module to sneak in.
 */
const BUNDLE_CAP_BYTES = 16 * 1024;

const posix = (p: string): string => relative(REPO, p).split('\\').join('/');

function resolveRelative(specifier: string, fromFile: string): string | null {
  const base = resolve(dirname(fromFile), specifier);
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const index = resolve(base, `index${ext}`);
      if (existsSync(index)) return index;
    }
  }
  return existsSync(base) && statSync(base).isFile() ? base : null;
}

function specifiersOf(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // A side-effect import is a statement: anchored, so `'reg import', file` in a string is not one.
    /^\s*import\s*['"]([^'"]+)['"]/gm,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) found.push(m[1]!);
  return found;
}

/** Static + literal-dynamic graph from `entry`: the repo files reached and every bare specifier. */
function walk(entry: string): { files: string[]; bare: string[]; unresolved: string[] } {
  const start = resolve(REPO, entry);
  const seen = new Set<string>([start]);
  const queue = [start];
  const bare = new Set<string>();
  const unresolved: string[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) {
        const parts = specifier.split('/');
        bare.add(specifier.startsWith('@') ? parts.slice(0, 2).join('/') : specifier.startsWith('node:') ? specifier : parts[0]!);
        continue;
      }
      const target = resolveRelative(specifier, file);
      if (!target) {
        unresolved.push(`${posix(file)} -> ${specifier}`);
        continue;
      }
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return { files: [...seen].map(posix).sort(), bare: [...bare].sort(), unresolved };
}

describe('squirrelEntry static import graph', () => {
  it('walker control: the same walk from src/main.ts sees the heavy graph the entry must avoid', () => {
    const main = walk('src/main.ts');
    expect(main.files.length).toBeGreaterThan(100);
    expect(main.files).toContain('src/main/squirrelEvents.ts');
    expect(main.bare.filter((b) => FORBIDDEN_BARE.includes(b)).length).toBeGreaterThan(0);
  });

  it('reaches only itself and squirrelEvents.ts', () => {
    const { files, unresolved } = walk(ENTRY);
    expect(unresolved).toEqual([]);
    expect(files).toEqual(ALLOWED_FILES);
    for (const f of FORBIDDEN_FILES) expect(files).not.toContain(f);
  });

  it('names only electron and Node builtins, none of the heavy externals', () => {
    const { bare } = walk(ENTRY);
    expect(bare.filter((b) => !ALLOWED_BARE.has(b))).toEqual([]);
    expect(bare.filter((b) => FORBIDDEN_BARE.includes(b))).toEqual([]);
    expect(bare).toContain('electron');
  });

  it('loads the app by a computed path, never by an import the bundler would follow', () => {
    const src = readFileSync(resolve(REPO, ENTRY), 'utf8');
    expect(src).toContain("require(path.join(__dirname, 'main.js'))");
    expect(src).not.toMatch(/from\s*['"]\.\/main['"]/);
    expect(src).not.toMatch(/(?:import|require)\s*\(\s*['"]\.\/main(?:\.js|\.ts)?['"]/);
  });
});

describe('squirrelEntry built bundle', () => {
  it(
    `builds (Forge's Vite config, vite.main.config.ts) to one chunk under ${BUNDLE_CAP_BYTES} bytes that requires only electron and builtins`,
    async () => {
      const require_ = createRequire(__filename);
      const vite = require_('vite') as typeof import('vite');
      const ViteConfigGenerator = require_('@electron-forge/plugin-vite/dist/ViteConfig.js').default as new (
        pluginConfig: unknown,
        projectDir: string,
        isProd: boolean,
      ) => { getBuildConfigs(): Promise<import('vite').InlineConfig[]> };

      const buildFor = async (entry: string) => {
        const generator = new ViteConfigGenerator(
          {
            build: [{ entry, config: resolve(REPO, 'vite.main.config.ts'), target: 'main' }],
            renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
          },
          REPO,
          true,
        );
        const [config] = await generator.getBuildConfigs();
        const result = await vite.build({
          ...config,
          configFile: false,
          logLevel: 'silent',
          build: { ...config!.build, write: false, watch: null },
        });
        const outputs = (Array.isArray(result) ? result : [result]) as import('rollup').RollupOutput[];
        return outputs.flatMap((o) => o.output).filter((c): c is import('rollup').OutputChunk => c.type === 'chunk');
      };

      const chunks = await buildFor(ENTRY);
      expect(chunks.map((c) => c.fileName)).toEqual(['squirrelEntry.js']);
      const [chunk] = chunks;
      const bytes = Buffer.byteLength(chunk!.code, 'utf8');
      expect(bytes).toBeGreaterThan(1_000); // the hook really is in there
      expect(bytes).toBeLessThanOrEqual(BUNDLE_CAP_BYTES);
      expect(chunk!.imports.filter((i) => !ALLOWED_BARE.has(i))).toEqual([]);
      expect(Object.keys(chunk!.modules).map((m) => posix(m)).sort()).toEqual(ALLOWED_FILES);
      // The app is required by path at runtime, not bundled.
      expect(chunk!.code).toMatch(/require\([^)]*"main\.js"\)/);
      expect(chunk!.code).toContain('--squirrel-install');
    },
    120_000,
  );
});

describe('squirrelEntry wiring', () => {
  const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

  it('package.json starts the entry, and the entry loads the main.js Forge builds beside it', () => {
    expect(JSON.parse(read('package.json')).main).toBe('.vite/build/squirrelEntry.js');
    const forge = read('forge.config.ts');
    const entryAt = forge.indexOf("entry: 'src/squirrelEntry.ts'");
    const mainAt = forge.indexOf("entry: 'src/main.ts'");
    expect(entryAt).toBeGreaterThan(-1);
    expect(mainAt).toBeGreaterThan(-1);
    // Both main-process targets with the alias-less main config, so Vite names each output
    // after its entry file (squirrelEntry.js, main.js) in the same .vite/build.
    for (const at of [entryAt, mainAt]) {
      const block = forge.slice(at, at + 160);
      expect(block).toContain("config: 'vite.main.config.ts'");
      expect(block).toContain("target: 'main'");
    }
  });

  it('the e2e snapshot boots through the same main as a packaged build', () => {
    const build = read('tools/e2e/build.cjs');
    expect(build).toContain('main: pkg.main');
    expect(build).not.toContain("main: '.vite/build/main.js'");
  });

  it('main.ts keeps its own hook call only as a fallback, before the single-instance lock', () => {
    const main = read('src/main.ts');
    const hook = main.indexOf('const squirrelEventOnly = handleSquirrelStartup(process.argv);');
    const lock = main.indexOf('app.requestSingleInstanceLock()');
    expect(hook).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(hook);
    expect(main).toContain('serviced by `src/squirrelEntry.ts`');
  });
});

describe('installer loading animation', () => {
  it('forge.config.ts gives Squirrel the committed GIF', () => {
    const forge = readFileSync(resolve(REPO, 'forge.config.ts'), 'utf8');
    expect(forge).toContain("const INSTALLER_LOADING_GIF = 'installer-loading.gif';");
    expect(forge).toMatch(/loadingGif: path\.resolve\(process\.cwd\(\), 'assets', INSTALLER_LOADING_GIF\)/);
  });

  it('is a small, looping, animated GIF', () => {
    const require_ = createRequire(__filename);
    const { MAX_BYTES, FPS, SECONDS } = require_(resolve(REPO, 'tools', 'make-installer-gif.cjs')) as {
      MAX_BYTES: number;
      FPS: number;
      SECONDS: number;
    };
    const gif = readFileSync(resolve(REPO, 'assets', 'installer-loading.gif'));
    expect(gif.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    expect(gif.length).toBeLessThanOrEqual(MAX_BYTES);
    // Netscape loop extension, and one graphic-control block per frame.
    expect(gif.includes(Buffer.from('NETSCAPE2.0', 'latin1'))).toBe(true);
    let frames = 0;
    for (let i = gif.indexOf(Buffer.from([0x21, 0xf9, 0x04])); i !== -1; i = gif.indexOf(Buffer.from([0x21, 0xf9, 0x04]), i + 1)) frames++;
    expect(frames).toBeGreaterThanOrEqual(FPS * SECONDS * 0.5);
  });
});
