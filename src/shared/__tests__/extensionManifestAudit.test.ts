/*
 * extension/manifest.json, audited against the code that has to live inside it.
 *
 * An MV3 manifest is the one file in the extension where a mistake is silent in
 * both directions: an over-declared permission costs the user a scarier install
 * prompt and never fails a test, and an under-declared one fails only at the
 * moment a real user takes a real action on a real page. Since the extension is
 * loaded unpacked with no build step, nothing has ever checked either side.
 *
 * This file is deliberately written as an audit rather than a snapshot: it
 * derives what the code needs from the code, so adding a `chrome.downloads`
 * call fails here until the permission is declared, and deleting the last
 * `chrome.alarms` call fails here until the permission is removed. It never
 * widens anything on its own.
 *
 * The mirror check at the bottom enforces the rule the README states in prose:
 * src/main/chrome-extension/ is a bundled copy used as an install fallback, and
 * a copy that has drifted is worse than no copy at all.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createChromeStub,
  evaluateBackground,
  EXTENSION_DIR,
  loadExtensionSandbox,
  MIRROR_DIR,
  readExtensionFile,
  type ChromeStub,
} from './extensionHarness';

interface Manifest {
  manifest_version: number;
  permissions: string[];
  host_permissions: string[];
  action?: { default_popup?: string };
  options_ui?: { page?: string };
  background?: { service_worker?: string; type?: string };
  content_scripts?: Array<{ matches: string[]; js: string[]; css: string[]; run_at: string }>;
  commands?: Record<string, { suggested_key?: { default?: string }; description?: string }>;
  web_accessible_resources?: unknown[];
}

const manifest = JSON.parse(readExtensionFile('manifest.json')) as Manifest;

const SCRIPTS = ['background.js', 'content.js', 'shared.js', 'settings.js', 'popup.js', 'options.js', 'tabs.js'];
const ALL_SOURCE = SCRIPTS.map((f) => readExtensionFile(f)).join('\n');

/** Every `chrome.<namespace>` the extension actually touches. */
const USED_NAMESPACES = new Set(
  [...ALL_SOURCE.matchAll(/\bchrome\.([a-zA-Z]+)\b/g)].map((m) => m[1]),
);

/**
 * What would have to disappear from the source before a permission became
 * unnecessary. `activeTab` has no API of its own — it is what lets
 * captureVisibleTab and a user-gesture injection touch the current page.
 */
const PERMISSION_EVIDENCE: Record<string, RegExp> = {
  activeTab: /chrome\.tabs\.captureVisibleTab/,
  scripting: /chrome\.scripting\.(executeScript|insertCSS)/,
  storage: /chrome\.storage\.(local|onChanged)/,
  contextMenus: /chrome\.contextMenus\./,
  alarms: /chrome\.alarms\./,
  // `tabs` is what makes url/title readable on tabs other than the active one,
  // which is the whole reading list.
  tabs: /chrome\.tabs\.query|chrome\.windows\.getAll/,
};

/** APIs Chrome exposes without any permission entry. */
const PERMISSION_FREE = new Set(['runtime', 'i18n', 'extension', 'action', 'commands', 'windows']);

describe('manifest — permissions match what the code does', () => {
  it('is on manifest v3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background?.service_worker).toBe('background.js');
    // background.js uses static `import`, which only works with type: module.
    expect(manifest.background?.type).toBe('module');
  });

  it('declares nothing it does not use', () => {
    const unused = manifest.permissions.filter((p) => {
      const evidence = PERMISSION_EVIDENCE[p];
      return !evidence || !evidence.test(ALL_SOURCE);
    });
    expect(unused).toEqual([]);
  });

  it('uses no API it has not declared', () => {
    const declared = new Set(manifest.permissions);
    const undeclared = [...USED_NAMESPACES].filter(
      (ns) => !PERMISSION_FREE.has(ns) && !declared.has(ns),
    );
    expect(undeclared).toEqual([]);
  });

  it('backs each permission-free namespace with the manifest key it needs', () => {
    if (USED_NAMESPACES.has('action')) expect(manifest.action).toBeTruthy();
    if (USED_NAMESPACES.has('commands')) expect(manifest.commands).toBeTruthy();
  });

  it('keeps the permission list to the audited set', () => {
    // A new entry here is a deliberate act, so it should be a deliberate edit.
    expect([...manifest.permissions].sort()).toEqual([
      'activeTab',
      'alarms',
      'contextMenus',
      'scripting',
      'storage',
      'tabs',
    ]);
  });

  it('needs no web_accessible_resources, and declares none', () => {
    // WAR is only required when a page can reach an extension URL. tabs.html is
    // opened by the extension into its own tab, and no content script ever puts
    // a chrome-extension:// URL into the page.
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(readExtensionFile('content.js')).not.toMatch(/chrome\.runtime\.getURL/);
  });
});

describe('manifest — host permissions', () => {
  it('grants the app bridge on its default port', () => {
    expect(manifest.host_permissions).toContain('http://127.0.0.1:18765/*');
  });

  it('needs <all_urls> for the tabs it acts on without a user gesture', () => {
    // activeTab would cover the focused tab, but the reading list injects into
    // tabs the user never clicked (runTabAction → ensureContentScript), and the
    // service worker fetches page HTML for pages it did not just capture.
    expect(manifest.host_permissions).toContain('<all_urls>');
    expect(readExtensionFile('background.js')).toMatch(/async function runTabAction/);
  });

  it('AUDIT: the bridge port is user-configurable, so the literal entry is not what makes it work', () => {
    // settings.js accepts any port 1–65535 and background.js builds
    // `http://127.0.0.1:${port}`. Only <all_urls> covers a non-default port —
    // the explicit 127.0.0.1:18765 entry is documentation, not the grant. If
    // <all_urls> is ever narrowed, this pairing breaks for anyone who moved the
    // port, and the host_permissions list must gain http://127.0.0.1/* first.
    expect(readExtensionFile('background.js')).toMatch(/http:\/\/127\.0\.0\.1:\$\{port \|\| DEFAULT_PORT\}/);
    const settings = loadExtensionSandbox().jpStudySettings;
    expect(settings.normalize({ port: 9000 }).port).toBe(9000);
    expect(manifest.host_permissions).toContain('<all_urls>');
  });
});

describe('manifest — content scripts', () => {
  const entry = manifest.content_scripts?.[0];

  it('injects the three scripts in the order they depend on each other', () => {
    // settings.js reads globalThis.jpStudyShared; content.js reads both.
    expect(entry?.js).toEqual(['shared.js', 'settings.js', 'content.js']);
    expect(entry?.css).toEqual(['content.css']);
  });

  it('matches the list background.js injects programmatically', () => {
    // A tab open from before the install is scripted by hand; if the two lists
    // drift, those tabs silently run a different extension.
    const background = readExtensionFile('background.js');
    const files = /files: \['shared\.js', 'settings\.js', 'content\.js'\]/.test(background);
    expect(files).toBe(true);
    expect(background).toMatch(/insertCSS\(\{ target: \{ tabId \}, files: \['content\.css'\] \}\)/);
  });

  it('runs on the schemes the code is prepared to handle', () => {
    expect(entry?.matches).toEqual(['http://*/*', 'https://*/*']);
    expect(entry?.run_at).toBe('document_idle');
  });

  it('references only files that exist', () => {
    const referenced = [
      manifest.background?.service_worker,
      manifest.action?.default_popup,
      manifest.options_ui?.page,
      ...(entry?.js ?? []),
      ...(entry?.css ?? []),
    ].filter((f): f is string => typeof f === 'string');
    for (const file of referenced) {
      expect({ file, exists: statSync(path.join(EXTENSION_DIR, file)).isFile() }).toEqual({
        file,
        exists: true,
      });
    }
  });
});

describe('manifest — keyboard commands', () => {
  const commands = manifest.commands ?? {};

  it('stays within the four suggested shortcuts Chrome will accept', () => {
    // Chrome silently ignores suggested_key past the fourth command.
    const suggested = Object.values(commands).filter((c) => c.suggested_key?.default);
    expect(suggested.length).toBeLessThanOrEqual(4);
    expect(suggested).toHaveLength(4);
  });

  it('describes every command, so the shortcuts page is not blank', () => {
    for (const [id, cmd] of Object.entries(commands)) {
      expect({ id, described: Boolean(cmd.description) }).toEqual({ id, described: true });
    }
  });

  it('handles every command it declares', async () => {
    for (const id of Object.keys(commands)) {
      const chrome = createChromeStub({ jpStudyToken: 'tok', jpStudyPort: 18765 });
      chrome.tabs.query = ((query: { url?: string }) =>
        // A query by url is openTabPicker looking for its own tab; there is
        // none open, so it has to create one.
        Promise.resolve(
          typeof query?.url === 'string'
            ? []
            : [{ id: 7, windowId: 1, url: 'https://example.com/a', title: 'A' }],
        )) as never;
      // 'jp-ping' is only ensureContentScript checking the tab is alive, so it
      // is not evidence that the command itself did anything.
      const sent: string[] = [];
      chrome.tabs.sendMessage = ((_tabId: number, msg: { type: string }) => {
        if (msg.type !== 'jp-ping') sent.push(msg.type);
        return msg.type === 'jp-get-save-payload'
          ? Promise.resolve({ text: '猫', mode: 'word' })
          : Promise.resolve({ ok: true });
      }) as never;
      const fetched: string[] = [];
      const sandbox = loadExtensionSandbox({
        chrome,
        globals: {
          fetch: (url: string) => {
            fetched.push(url);
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
          },
        },
      });
      chrome.scripting.executeScript = (() => Promise.resolve([{ result: {} }])) as never;
      evaluateBackground(sandbox);
      await chrome.listeners.onCommand[0](id);
      // Every command must reach the page, the app, or a window of its own. A
      // command with no branch in the onCommand switch does none of those.
      const OPENS_UI = new Set(['tabs.create', 'tabs.update', 'windows.create', 'windows.update']);
      const acted =
        fetched.length > 0 || sent.length > 0 || chrome.calls.some((c) => OPENS_UI.has(c.api));
      expect({ id, acted }).toEqual({ id, acted: true });
    }
  });

  it('answers to no command id the manifest cannot produce', () => {
    // Fixed 2026-08-02. `send-to-reader` had a branch in the onCommand switch
    // and an entry in neither manifest.commands nor COMMAND_ALIASES, so
    // onCommand could never fire with it. The branch was a duplicate of
    // save-page's, and declaring it would have spent one of Chrome's four
    // suggested-keybinding slots on that duplicate — so the branch went instead.
    // The id survives only in the comment explaining its removal, which is
    // worth keeping — so match the dispatch, not the word.
    const source = readExtensionFile('background.js');
    expect(source).not.toMatch(/command === 'send-to-reader'/);
    expect(source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')).not.toMatch(/send-to-reader/);
    expect(Object.keys(commands)).not.toContain('send-to-reader');
  });

  it('keeps the legacy mine-selection id, because user shortcuts are stored by id', () => {
    expect(commands['mine-selection']).toBeTruthy();
    expect(commands['mine-selection'].description).toBe('Save selection (word or sentence)');
  });
});

describe('manifest — context menu', () => {
  it('registers only ids the dispatcher can act on', async () => {
    const chrome: ChromeStub = createChromeStub();
    const sandbox = loadExtensionSandbox({ chrome, globals: { fetch: () => Promise.reject(new Error('x')) } });
    evaluateBackground(sandbox);
    await chrome.listeners.onInstalled[0]();

    const created = chrome.calls
      .filter((c) => c.api === 'contextMenus.create')
      .map((c) => c.args[0] as { id: string; type?: string });
    expect(created.length).toBeGreaterThan(0);

    // Ids the onClicked handler intercepts before it reaches runCommand.
    const specialCased = new Set(['lookup.selection', 'analyze.selection']);
    for (const item of created) {
      if (item.type === 'separator' || item.id.startsWith('sep-')) continue;
      if (specialCased.has(item.id)) continue;
      expect({ id: item.id, resolved: sandbox.jpStudyShared.resolveCommandId(item.id) }).toEqual({
        id: item.id,
        resolved: item.id,
      });
    }
  });

  it('AUDIT: analyze.selection is a menu id with no command behind it', () => {
    // Legitimate — the onClicked handler forwards it straight to the content
    // script — but it means the context menu is not a pure view of the registry.
    const sandbox = loadExtensionSandbox({ files: ['shared.js'] });
    expect(sandbox.jpStudyShared.resolveCommandId('analyze.selection')).toBeNull();
    expect(readExtensionFile('background.js')).toMatch(/info\.menuItemId === 'analyze\.selection'/);
  });
});

describe('the bundled mirror is byte-identical to the shipped folder', () => {
  const sha = (file: string): string =>
    createHash('sha256').update(readFileSync(file)).digest('hex');
  const listing = (dir: string): string[] => readdirSync(dir).sort();

  it('contains exactly the same files', () => {
    expect(listing(MIRROR_DIR)).toEqual(listing(EXTENSION_DIR));
  });

  it('matches every file hash for hash', () => {
    const drifted = listing(EXTENSION_DIR).filter(
      (name) => sha(path.join(EXTENSION_DIR, name)) !== sha(path.join(MIRROR_DIR, name)),
    );
    expect(drifted).toEqual([]);
  });
});
