// @vitest-environment jsdom
/**
 * WP3 — settings-only export and import (`storage/settingsTransfer.ts`).
 *
 * Covers the contract the Settings row of docs/SCORECARD.md asked for: a round
 * trip, nothing secret / user-owned / machine-specific in the file, refusal of
 * unknown keys, bad types, bad JSON and a newer schema, all-or-nothing apply
 * with rollback, Undo, and each owner's change event firing so open windows
 * follow. The card itself is driven once at the end, through its Undo toast.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SETTINGS_TRANSFER_DENY_KEYS,
  SETTINGS_TRANSFER_DENY_PREFIXES,
  SETTINGS_TRANSFER_GROUPS,
  SETTINGS_TRANSFER_KEYS,
  settingsTransferKeyDenied,
} from '../storage/settingsCatalog';
import {
  SETTINGS_TRANSFER_FORMAT,
  SETTINGS_TRANSFER_SCHEMA_VERSION,
  applySettingsTransfer,
  buildSettingsTransfer,
  findMachinePath,
  listSettingsTransferGroups,
  parseSettingsTransfer,
  previewSettingsTransfer,
} from '../storage/settingsTransfer';
import { onDisplayPrefsChanged, loadDisplayPrefs } from '../displayPrefs';
import { onReaderSettingsChanged } from '../readerSettings';
import { onTranslateTargetChanged } from '../translateTarget';
import { onVizSettingsChanged } from '../visualizerSettings';
import { onDesktopPrefsChanged } from '../desktopPrefs';
import { onEnvironmentChanged } from '../environment/environmentStore';
import { onThemeChanged } from '../theme';
import { onShortcutsChanged } from '../keyboardShortcuts';
import { onToolboxSettingsChanged } from '../toolboxSettings';

const K = SETTINGS_TRANSFER_KEYS;
const ALL_GROUPS = listSettingsTransferGroups();

/** A realistic set of preferences, as the owners store them. */
function seedSettings(): void {
  localStorage.setItem(K.theme, 'classic-light');
  localStorage.setItem(K.displayPrefs, JSON.stringify({ ...loadDisplayPrefs(), baseFontPx: 17, boldText: true }));
  localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 140, theme: 'sepia', justify: true }));
  localStorage.setItem(K.translateTarget, 'ru');
  localStorage.setItem(K.translateSource, 'ja');
  localStorage.setItem(K.exampleCount, '9');
  localStorage.setItem(K.exampleLangs, JSON.stringify(['en', 'ru']));
  localStorage.setItem(K.visualizer, JSON.stringify({ enabled: true, mode: 'both', style: 'wave', intensity: 0.4 }));
  localStorage.setItem(K.musicWidget, JSON.stringify({ showLyrics: true }));
  localStorage.setItem(K.desktopPrefs, JSON.stringify({ iconSize: 'large', iconsLocked: true }));
}

/** Everything a settings file must never carry, planted beside the settings. */
const FORBIDDEN: Record<string, string> = {
  'jp-exttoken-chrome': 'tok_live_123',
  'jp-deepl-api-key': 'sk-secret-value',
  'jp-flashcard-deck': JSON.stringify({ cards: [{ id: 'c1', front: '猫' }] }),
  'jp-flashcard-deck-journal': JSON.stringify([{ op: 'add', id: 'journal-entry-77' }]),
  'jp-user-notes-journal-v1': JSON.stringify([{ id: 'n1', text: 'private note' }]),
  'jp-study-stats-v1': JSON.stringify({ reviews: 999 }),
  'jp-word-knowledge': JSON.stringify({ 猫: 'known' }),
  'jp-study-whisper-device': 'cuda',
  'jp-app-zoom': '1.25',
  'jp-os-wall': 'C:\\Users\\owner\\Pictures\\wall.png',
  'jp-music-liked': JSON.stringify(['C:\\Music\\song.mp3']),
  'jp-clipboard-history': JSON.stringify([{ text: 'password123' }]),
};

function snapshotStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    out[key] = localStorage.getItem(key)!;
  }
  return out;
}

function exportText(groups: readonly string[] = ALL_GROUPS): string {
  return buildSettingsTransfer(groups, { appVersion: '1.0.1', now: new Date('2026-10-13T00:00:00Z') }).text;
}

function importText(text: string) {
  const parsed = parseSettingsTransfer(text);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.error} ${parsed.key ?? ''}`);
  const preview = previewSettingsTransfer(parsed.file);
  return { parsed: parsed.file, preview, result: applySettingsTransfer(preview.changes) };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('settings transfer — allow and deny lists', () => {
  it('never lets the two lists meet', () => {
    for (const key of Object.values(K)) {
      expect(settingsTransferKeyDenied(key), key).toBe(false);
      expect(Object.keys(SETTINGS_TRANSFER_DENY_KEYS)).not.toContain(key);
    }
    // Every group key is one of the allow-listed names, and every name is in exactly one group.
    const named = SETTINGS_TRANSFER_GROUPS.flatMap((g) => g.keys);
    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(Object.keys(K).sort());
  });

  it('denies secrets, user data and machine state by name, family and pattern', () => {
    for (const key of Object.keys(FORBIDDEN)) expect(settingsTransferKeyDenied(key), key).toBe(true);
    for (const prefix of SETTINGS_TRANSFER_DENY_PREFIXES) {
      expect(settingsTransferKeyDenied(`${prefix}anything`), prefix).toBe(true);
    }
    expect(settingsTransferKeyDenied('jp-some-auth-token')).toBe(true);
    expect(settingsTransferKeyDenied('jp-vault-v2')).toBe(true);
  });
});

describe('settings transfer — export', () => {
  it('writes the schema version, app version and study language', () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    const file = JSON.parse(exportText(['display'])) as Record<string, unknown>;
    expect(file.format).toBe(SETTINGS_TRANSFER_FORMAT);
    expect(file.schemaVersion).toBe(SETTINGS_TRANSFER_SCHEMA_VERSION);
    expect(file.appVersion).toBe('1.0.1');
    expect(file.studyLanguage).toBe('zh');
    expect(Object.keys(file.groups as object)).toEqual(['display']);
  });

  it('carries only the chosen groups, and absent keys as null (default)', () => {
    seedSettings();
    const file = JSON.parse(exportText(['reading', 'dictionary'])) as { groups: Record<string, Record<string, unknown>> };
    expect(Object.keys(file.groups).sort()).toEqual(['dictionary', 'reading']);
    expect(file.groups.reading[K.readerSettings]).toEqual({ fontSize: 140, theme: 'sepia', justify: true });
    expect(file.groups.dictionary[K.translateTarget]).toBe('ru');
    localStorage.removeItem(K.translateSource);
    const again = JSON.parse(exportText(['dictionary'])) as { groups: Record<string, Record<string, unknown>> };
    expect(again.groups.dictionary[K.translateSource]).toBeNull();
  });

  it('never exports secrets, API keys, user data or machine-specific values', () => {
    seedSettings();
    for (const [key, value] of Object.entries(FORBIDDEN)) localStorage.setItem(key, value);
    const text = exportText();
    for (const [key, value] of Object.entries(FORBIDDEN)) {
      expect(text, key).not.toContain(key);
      expect(text, key).not.toContain(value);
    }
    const file = JSON.parse(text) as { groups: Record<string, Record<string, unknown>> };
    const allowed = new Set<string>(Object.values(K));
    for (const body of Object.values(file.groups)) {
      for (const key of Object.keys(body)) expect(allowed.has(key), key).toBe(true);
    }
    expect(findMachinePath(file)).toBeNull();
  });

  it('strips image and video wallpapers (files on this PC) but keeps presets', () => {
    localStorage.setItem(
      K.environment,
      JSON.stringify({
        enabled: true,
        playlists: [
          {
            id: 'pl',
            name: 'Mine',
            transition: 'fade',
            transitionMs: 500,
            items: [
              { id: 'a', kind: 'preset', ref: 'dawn' },
              { id: 'b', kind: 'image', ref: 'C:\\Users\\owner\\Pictures\\cat.png' },
              { id: 'c', kind: 'video', ref: '/home/owner/loop.mp4' },
            ],
          },
        ],
      }),
    );
    const { text, file } = buildSettingsTransfer(['environment'], { appVersion: '' });
    expect(text).not.toContain('Pictures');
    expect(text).not.toContain('/home/owner');
    const env = file.groups.environment[K.environment] as { playlists: Array<{ items: Array<{ id: string }> }> };
    expect(env.playlists[0].items.map((i) => i.id)).toEqual(['a']);
  });

  it('leaves out a value that still names a path, and says so', () => {
    localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 120, font: 'file:///C:/Fonts/mine.ttf' }));
    const { file, skipped } = buildSettingsTransfer(['reading'], { appVersion: '' });
    expect(file.groups.reading[K.readerSettings]).toBeUndefined();
    expect(skipped).toEqual([{ group: 'reading', key: K.readerSettings, reason: 'machinePath' }]);
  });
});

describe('settings transfer — round trip', () => {
  it('export -> change everything -> import puts the same settings back', () => {
    seedSettings();
    const text = exportText();
    const before = snapshotStorage();

    // Diverge: change some, remove some.
    localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 90 }));
    localStorage.setItem(K.translateTarget, 'en');
    localStorage.removeItem(K.exampleLangs);
    localStorage.setItem(K.desktopPrefs, JSON.stringify({ iconSize: 'small' }));

    const { preview, result } = importText(text);
    expect(result.ok).toBe(true);
    expect(preview.changes.map((c) => c.key).sort()).toEqual(
      [K.readerSettings, K.translateTarget, K.exampleLangs, K.desktopPrefs].sort(),
    );
    expect(JSON.parse(localStorage.getItem(K.readerSettings)!)).toEqual(JSON.parse(before[K.readerSettings]));
    expect(localStorage.getItem(K.translateTarget)).toBe('ru');
    expect(JSON.parse(localStorage.getItem(K.exampleLangs)!)).toEqual(['en', 'ru']);
    // The desktop owner normalizes on announce; the imported choices survive it.
    const desktop = JSON.parse(localStorage.getItem(K.desktopPrefs)!) as Record<string, unknown>;
    expect(desktop.iconSize).toBe('large');
    expect(desktop.iconsLocked).toBe(true);

    // A second import of the same file changes nothing.
    const parsed = parseSettingsTransfer(text);
    expect(parsed.ok && previewSettingsTransfer(parsed.file).changes).toEqual([]);
  });

  it('previews field by field before anything is written', () => {
    seedSettings();
    const text = exportText(['reading']);
    localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 90, theme: 'sepia', justify: true }));
    const parsed = parseSettingsTransfer(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const preview = previewSettingsTransfer(parsed.file);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0].fields).toEqual([{ field: 'fontSize', before: '90', after: '140' }]);
    // Previewing wrote nothing.
    expect(JSON.parse(localStorage.getItem(K.readerSettings)!).fontSize).toBe(90);
  });

  it('keeps this PC\'s own image wallpapers when an environment comes in', () => {
    const local = { id: 'mine', kind: 'image', ref: 'C:\\Users\\me\\wall.png' };
    localStorage.setItem(
      K.environment,
      JSON.stringify({ enabled: false, playlists: [{ id: 'pl', name: 'x', transition: 'cut', transitionMs: 0, items: [local] }] }),
    );
    const file = {
      format: SETTINGS_TRANSFER_FORMAT,
      schemaVersion: 1,
      groups: {
        environment: {
          [K.environment]: {
            enabled: true,
            playlists: [{ id: 'pl', name: 'x', transition: 'cut', transitionMs: 0, items: [{ id: 'p', kind: 'preset', ref: 'dusk' }] }],
          },
        },
      },
    };
    const { result } = importText(JSON.stringify(file));
    expect(result.ok).toBe(true);
    const env = JSON.parse(localStorage.getItem(K.environment)!) as { enabled: boolean; playlists: Array<{ id: string; items: Array<{ id: string }> }> };
    expect(env.enabled).toBe(true);
    expect(env.playlists.find((p) => p.id === 'pl')!.items.map((i) => i.id)).toEqual(['p', 'mine']);
  });

  it('does not change the study language, only reports that it differs', () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    localStorage.setItem(K.translateTarget, 'en');
    const text = exportText(['dictionary']);
    localStorage.setItem('jp-study-dict-lang', 'ja');
    const parsed = parseSettingsTransfer(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(previewSettingsTransfer(parsed.file).studyLanguageDiffers).toBe(true);
    importText(text);
    expect(localStorage.getItem('jp-study-dict-lang')).toBe('ja');
  });

  it('never switches into or out of Aero / WIRED', () => {
    const file = { format: SETTINGS_TRANSFER_FORMAT, schemaVersion: 1, groups: { appearance: { [K.theme]: 'frutiger-aero' } } };
    localStorage.setItem(K.theme, 'classic-light');
    const parsed = parseSettingsTransfer(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.error);
    const preview = previewSettingsTransfer(parsed.file);
    expect(preview.changes).toEqual([]);
    expect(preview.skipped).toEqual([{ group: 'appearance', key: K.theme, reason: 'secretShellTheme' }]);
  });
});

describe('settings transfer — refusals (nothing is written)', () => {
  function expectRefused(text: string, error: string, key?: string): void {
    seedSettings();
    const before = snapshotStorage();
    const parsed = parseSettingsTransfer(text);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe(error);
    if (key) expect(parsed.key).toBe(key);
    expect(snapshotStorage()).toEqual(before);
  }

  const wrap = (groups: unknown, schemaVersion: unknown = 1) =>
    JSON.stringify({ format: SETTINGS_TRANSFER_FORMAT, schemaVersion, appVersion: '9', studyLanguage: 'ja', groups });

  it('bad JSON', () => expectRefused('{"format": "gum-settings", ', 'badJson'));

  it('not a settings file', () => expectRefused(JSON.stringify({ cards: [] }), 'notSettings'));

  it('a newer schema version', () => expectRefused(wrap({ display: {} }, SETTINGS_TRANSFER_SCHEMA_VERSION + 1), 'newerSchema'));

  it('an unknown group', () => expectRefused(wrap({ 'secret-stuff': {} }), 'unknownGroup', 'secret-stuff'));

  it('an unknown key', () =>
    expectRefused(wrap({ display: { 'jp-os-made-up-v9': {} } }), 'unknownKey', 'jp-os-made-up-v9'));

  it('a real key filed under the wrong group', () =>
    expectRefused(wrap({ display: { [K.readerSettings]: { fontSize: 100 } } }), 'unknownKey', K.readerSettings));

  it('a denied key (user data / secrets), even inside an allowed group', () => {
    expectRefused(wrap({ reading: { 'jp-flashcard-deck': { cards: [] } } }), 'forbiddenKey', 'jp-flashcard-deck');
    expectRefused(wrap({ appearance: { 'jp-exttoken-x': 'abc' } }), 'forbiddenKey', 'jp-exttoken-x');
  });

  it('a value of the wrong type', () => {
    expectRefused(wrap({ display: { [K.displayPrefs]: { boldText: 'yes' } } }), 'badValue', K.displayPrefs);
    expectRefused(wrap({ appearance: { [K.theme]: 42 } }), 'badValue', K.theme);
    expectRefused(wrap({ dictionary: { [K.exampleLangs]: ['en', 'klingon'] } }), 'badValue', K.exampleLangs);
    expectRefused(wrap({ dictionary: { [K.exampleCount]: '400' } }), 'badValue', K.exampleCount);
  });

  it('a value naming a file on another PC', () =>
    expectRefused(wrap({ reading: { [K.readerSettings]: { font: 'C:\\Fonts\\x.ttf' } } }), 'machinePath', K.readerSettings));

  it('a file with no settings', () => expectRefused(wrap({}), 'empty'));
});

describe('settings transfer — all or nothing', () => {
  it('rolls every key back when a write is refused part-way', () => {
    seedSettings();
    const text = exportText();
    localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 90 }));
    localStorage.setItem(K.translateTarget, 'en');
    localStorage.setItem(K.visualizer, JSON.stringify({ enabled: false }));
    const before = snapshotStorage();

    const parsed = parseSettingsTransfer(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const preview = previewSettingsTransfer(parsed.file);
    expect(preview.changes.length).toBe(3);

    // The visualizer write is refused (quota), after the others have landed.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === K.visualizer && value.includes('wave')) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return realSetItem.call(this, key, value);
    });
    const result = applySettingsTransfer(preview.changes);
    expect(result).toEqual({ ok: false, error: 'writeFailed', key: K.visualizer });
    vi.restoreAllMocks();

    expect(snapshotStorage()).toEqual(before);
  });

  it('rolls back when an owner refuses the value it was given', () => {
    localStorage.setItem(K.translateTarget, 'en');
    const before = snapshotStorage();
    // Custom CSS the owner's sanitizer refuses when it is announced. The parser
    // would have refused it first; handing it straight to apply exercises the
    // owner-side refusal path, after the raw writes have already landed.
    const changes = [
      { group: 'dictionary', name: 'translateTarget' as const, key: K.translateTarget, before: 'en', after: 'ru', fields: [] },
      { group: 'appearance', name: 'customCss' as const, key: K.customCss, before: null, after: '@import url("https://evil.example/x.css");', fields: [] },
    ];
    const result = applySettingsTransfer(changes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('applyFailed');
    expect(result.key).toBe(K.customCss);
    expect(snapshotStorage()).toEqual(before);
  });
});

describe('settings transfer — Undo', () => {
  it('puts back exactly what was there, including keys that did not exist', () => {
    localStorage.setItem(K.translateTarget, 'en');
    localStorage.setItem(K.readerSettings, JSON.stringify({ fontSize: 90 }));
    // An owner that rewrites its key in full when announced: Undo must still
    // leave this exact string, not the owner's normalized form of it.
    localStorage.setItem(K.visualizer, JSON.stringify({ enabled: false }));
    const before = snapshotStorage();
    const file = {
      format: SETTINGS_TRANSFER_FORMAT,
      schemaVersion: 1,
      groups: {
        dictionary: { [K.translateTarget]: 'zh', [K.exampleCount]: '12' },
        reading: { [K.readerSettings]: { fontSize: 200 } },
        visualizer: { [K.visualizer]: { enabled: true, style: 'wave' } },
      },
    };
    const { result } = importText(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(localStorage.getItem(K.translateTarget)).toBe('zh');
    expect(localStorage.getItem(K.exampleCount)).toBe('12');

    expect(result.undo()).toBe(true);
    expect(snapshotStorage()).toEqual(before);
    expect(localStorage.getItem(K.exampleCount)).toBeNull();
  });
});

describe('settings transfer — change events', () => {
  it('fires each owner\'s change event with the imported value', () => {
    seedSettings();
    const text = exportText();
    localStorage.clear();

    const seen: Record<string, unknown> = {};
    const offs = [
      onThemeChanged((id) => (seen.theme = id)),
      onDisplayPrefsChanged((s) => (seen.display = s.baseFontPx)),
      onReaderSettingsChanged((s) => (seen.reader = s.fontSize)),
      onTranslateTargetChanged((code) => (seen.translateTarget = code)),
      onVizSettingsChanged((s) => (seen.visualizer = s.style)),
      onDesktopPrefsChanged((s) => (seen.desktop = s.iconSize)),
    ];
    try {
      const { result } = importText(text);
      expect(result.ok).toBe(true);
    } finally {
      for (const off of offs) off();
    }
    expect(seen).toEqual({
      theme: 'classic-light',
      display: 17,
      reader: 140,
      translateTarget: 'ru',
      visualizer: 'wave',
      desktop: 'large',
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('classic-light');
  });

  it('fires the environment, shortcuts and toolbox events', () => {
    const file = {
      format: SETTINGS_TRANSFER_FORMAT,
      schemaVersion: 1,
      groups: {
        environment: { [K.environment]: { enabled: true, particleDensity: 0.3 } },
        shortcuts: { [K.shortcuts]: { active: 'Default', profiles: { Default: {} }, customCommands: [] } },
        'blanc-toolbox': { [K.toolboxSettings]: { showTooltips: false } },
      },
    };
    const env = vi.fn();
    const keys = vi.fn();
    const toolbox = vi.fn();
    const offs = [onEnvironmentChanged(env), onShortcutsChanged(keys), onToolboxSettingsChanged(toolbox)];
    try {
      const { result } = importText(JSON.stringify(file));
      expect(result.ok).toBe(true);
    } finally {
      for (const off of offs) off();
    }
    expect(env).toHaveBeenCalled();
    expect(env.mock.calls.at(-1)![0]).toMatchObject({ enabled: true, particleDensity: 0.3 });
    expect(keys).toHaveBeenCalled();
    expect(toolbox.mock.calls.at(-1)![0]).toMatchObject({ showTooltips: false });
  });
});

describe('settings transfer — the Storage page card', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('previews a file, applies it, and its toast Undo restores the settings', async () => {
    const { SettingsProvider } = await import('../components/settings/SettingsContext');
    const { default: SettingsTransferCard } = await import('../components/settings/pages/SettingsTransferCard');
    localStorage.setItem(K.translateTarget, 'en');
    const toasts: Array<{ message: string; action?: { label: string; run: () => void } }> = [];
    const onToast = (e: Event): void => {
      toasts.push((e as CustomEvent).detail);
    };
    window.addEventListener('os:toast', onToast);

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const settings = { advancedMode: true, focusSettingId: null } as never;
    await act(async () => {
      root!.render(createElement(SettingsProvider, { value: settings }, createElement(SettingsTransferCard)));
    });

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.getAttribute('aria-label')).toBeTruthy();
    const file = new File(
      [JSON.stringify({ format: SETTINGS_TRANSFER_FORMAT, schemaVersion: 1, groups: { dictionary: { [K.translateTarget]: 'zh' } } })],
      'gum-settings.json',
      { type: 'application/json' },
    );
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    const preview = host.querySelector('[data-settings-transfer-preview]');
    expect(preview?.textContent).toContain(K.translateTarget);
    expect(preview?.textContent).toContain('en → zh');
    // Nothing is written before Apply.
    expect(localStorage.getItem(K.translateTarget)).toBe('en');

    const apply = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Apply changes')!;
    await act(async () => apply.click());
    expect(localStorage.getItem(K.translateTarget)).toBe('zh');

    const toast = toasts.find((t) => t.action);
    expect(toast?.message).toBe('Settings imported.');
    await act(async () => {
      toast!.action!.run();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(localStorage.getItem(K.translateTarget)).toBe('en');
    expect(toasts.at(-1)?.message).toBe('The import is undone.');
    window.removeEventListener('os:toast', onToast);
  });

  it('shows why a file was refused', async () => {
    const { SettingsProvider } = await import('../components/settings/SettingsContext');
    const { default: SettingsTransferCard } = await import('../components/settings/pages/SettingsTransferCard');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(SettingsProvider, { value: { focusSettingId: null } as never }, createElement(SettingsTransferCard)));
    });
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(
      [JSON.stringify({ format: SETTINGS_TRANSFER_FORMAT, schemaVersion: 99, groups: {} })],
      'new.json',
    );
    await act(async () => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('newer version of Gum');
  });
});
