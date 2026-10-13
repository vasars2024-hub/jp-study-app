// @vitest-environment node
/**
 * PRIVACY.md is a claim about the code, so the code is checked against it.
 *
 * Each block below pins one statement to the source that makes it true. When a
 * change breaks one (a new analytics SDK, a key stored in plain text, a server
 * that listens beyond loopback, Snip to cards on by default, a new cloud host),
 * this fails and says which sentence of the statement is now wrong. Either fix
 * the code or update PRIVACY.md, which is also what the app shows under
 * Settings › Help › About › Privacy (`aboutPanel.test.tsx` keeps those one text).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SNIP_SETTINGS_DEFAULTS } from '../snipToCards';
import { STATS_BASE } from '../stats';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const privacy = read('PRIVACY.md');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const SRC = sourceFiles(resolve(ROOT, 'src'));
const grep = (re: RegExp): string[] =>
  SRC.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f).replace(/\\/g, '/'));

describe('"no analytics SDK and no crash-report upload"', () => {
  it('no analytics or crash-reporting package is a dependency', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const banned = /(^|[/@-])(sentry|bugsnag|posthog|mixpanel|amplitude|segment|analytics|datadog|newrelic|logrocket|rollbar|appcenter|applicationinsights|gtag|plausible|umami|matomo)([/-]|$)/i;
    expect(deps.filter((d) => banned.test(d))).toEqual([]);
  });

  it('Electron\'s crash reporter is never started, and nothing beacons', () => {
    expect(grep(/crashReporter\s*\.\s*start\s*\(/)).toEqual([]);
    expect(grep(/navigator\.sendBeacon\s*\(/)).toEqual([]);
  });
});

describe('"the one count Gum can send about you (opt-in)"', () => {
  it('names the counter the code posts to', () => {
    expect(privacy).toContain(new URL(STATS_BASE).hostname);
  });

  it('the ping is only sent through the consent-gated helper, from the known consent surfaces', () => {
    // main's stats:ping is invoked from exactly one renderer module…
    expect(grep(/window\.api\.statsPing\s*\(/)).toEqual(['src/renderer/telemetryPing.ts']);
    // …whose callers each ask only after a "yes" (first-run card, Settings, the
    // Learner Map share button, the heat map when consent is already yes, About › Privacy).
    expect(grep(/sendTelemetryPingIfNeeded\s*\(/).sort()).toEqual([
      'src/renderer/components/ConsentScreen.tsx',
      'src/renderer/components/about/AboutPanel.tsx',
      'src/renderer/components/resources/WorldHeatMap.tsx',
      'src/renderer/telemetryPing.ts',
      'src/renderer/views/SettingsView.tsx',
      'src/renderer/widgets/more.tsx',
    ]);
    expect(read('src/renderer/components/ConsentScreen.tsx')).toMatch(/if \(consent === 'yes'\) void sendTelemetryPingIfNeeded\(\)/);
    expect(read('src/renderer/components/resources/WorldHeatMap.tsx')).toMatch(/if \(hasConsentYes\(\)\) \{\s*void sendTelemetryPingIfNeeded\(\)/);
  });
});

describe('"your keys and passwords"', () => {
  it('the vault encrypts with Electron safeStorage and refuses without OS encryption', () => {
    const vault = read('src/main/credentials/vault.ts');
    expect(vault).toContain('safeStorage.encryptString');
    expect(vault).toContain('safeStorage.isEncryptionAvailable');
    expect(privacy).toMatch(/Electron safeStorage, which is DPAPI on Windows/);
    expect(privacy).toMatch(/refuses to save a key rather than store it in plain text/);
  });
});

describe('"the browser extension talks only to Gum on your own computer"', () => {
  it('the extension server listens on loopback only, on the port the statement names', () => {
    const server = read('src/main/extensionServer.ts');
    expect(server).toMatch(/\.listen\(port, '127\.0\.0\.1'/);
    expect(read('src/shared/inboxMeta.ts')).toContain('18765');
    expect(privacy).toContain('127.0.0.1 port 18765');
  });
});

describe('"Snip to cards is off by default … the OCR is local"', () => {
  it('watching is off for a new profile', () => {
    expect(SNIP_SETTINGS_DEFAULTS.enabled).toBe(false);
    expect(privacy).toContain('Snip to cards is off by default');
  });

  it('the snip pipeline reads pictures with local engines only (no network call in it)', () => {
    for (const file of ['src/main/snipToCards.ts', 'src/renderer/snipToCards.ts']) {
      const code = read(file);
      expect(code, file).not.toMatch(/\bfetch\s*\(|net\.request|https?:\/\/(?!127\.0\.0\.1|localhost)/);
    }
  });
});

describe('every service the statement names is one the code really contacts, and vice versa', () => {
  // host → a source file that contacts it. Both directions: the statement names
  // it, and the code still has it (a removed integration must leave the statement).
  const HOSTS: Record<string, string> = {
    'api.anthropic.com': 'src/shared/aiProviders.ts',
    'api.openai.com': 'src/shared/aiProviders.ts',
    'generativelanguage.googleapis.com': 'src/shared/aiProviders.ts',
    'api.deepseek.com': 'src/shared/aiProviders.ts',
    'localhost:11434': 'src/shared/aiProviders.ts',
    'localhost:1234': 'src/shared/aiProviders.ts',
    'api-free.deepl.com': 'src/shared/translateProviders.ts',
    'api.github.com': 'src/shared/release.ts',
    'raw.githubusercontent.com': 'src/main/dictionary/yomitan.ts',
    'huggingface.co': 'src/shared/assetRegistry.ts',
    'lrclib.net': 'src/renderer/lyrics.ts',
    'api.jikan.moe': 'src/main/mediaProviderClients.ts',
    'graphql.anilist.co': 'src/main/mediaProviderClients.ts',
    'api.tvmaze.com': 'src/main/mediaProviderStatus.ts',
    'api.themoviedb.org': 'src/main/mediaProviderStatus.ts',
    'jimaku.cc': 'src/main/subtitleProviderClients.ts',
    'api.opensubtitles.com': 'src/main/subtitleProviderClients.ts',
    'tatoeba.org': 'src/main/dictionary.ts',
    'assets.languagepod101.com': 'src/main/dictionary/audio.ts',
    'api.jiten.moe': 'src/shared/jiten.ts',
    'api.vndb.org': 'src/main/immersion/vndbClient.ts',
    'myanimelist.net': 'src/shared/malSync.ts',
    '127.0.0.1:8765': 'src/shared/profiles.ts',
  };

  for (const [host, file] of Object.entries(HOSTS)) {
    it(host, () => {
      expect(read(file), `${file} no longer contacts ${host}: update PRIVACY.md`).toContain(host);
      expect(privacy, `PRIVACY.md does not mention ${host}`).toContain(host);
    });
  }

  // Download and documentation pages the settings link to (opened in the browser, never called) are skipped.
  it('every cloud AI provider the app offers is named', () => {
    const providers = read('src/shared/aiProviders.ts');
    const hosts = new Set([...providers.matchAll(/https:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase()));
    const missing = [...hosts].filter((h) => !privacy.includes(h) && !/example|docs|console|platform|aistudio|ai\.google\.dev|^ollama\.com$|^lmstudio\.ai$/.test(h));
    expect(missing, 'a provider host the statement does not name').toEqual([]);
  });
});
