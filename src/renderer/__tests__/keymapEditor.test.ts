// @vitest-environment jsdom
/**
 * kbd5 — the unified keymap behind Settings > Shortcuts: scope-aware conflict
 * detection across the app catalog, the video player's own keys and the Chrome
 * extension; swap / replace / keep resolution; editing a custom shortcut in
 * place (D264); and one export document carrying both keymaps.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type KS = typeof import('../keyboardShortcuts');
type KE = typeof import('../keymapEditor');

let ks: KS;
let ke: KE;

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  ks = await import('../keyboardShortcuts');
  ke = await import('../keymapEditor');
  ks.resetAllBindings();
});

afterEach(() => {
  localStorage.clear();
});

describe('scopes', () => {
  it('places catalog commands where their keys are heard', () => {
    const byId = (id: string) => ks.COMMAND_CATALOG.find((c) => c.id === id)!;
    expect(ke.scopeOfCommand(byId('nav.palette'))).toBe('app');
    expect(ke.scopeOfCommand(byId('companion.wheel'))).toBe('system');
    expect(ke.scopeOfCommand(byId('reader.copyWord'))).toBe('reader');
    expect(ke.scopeOfCommand(byId('flashcards.flip'))).toBe('flashcards');
    expect(ke.scopeOfCommand(byId('video.toggleLoop'))).toBe('video');
    expect(ke.scopeOfCommand(byId('toolbox.search'))).toBe('toolbox');
    expect(ke.scopeOfCommand(byId('captions.mineRecent'))).toBe('system');
  });

  it('judges overlap the way a keypress travels', () => {
    expect(ke.scopesOverlap('system', 'extension')).toBe(true);
    expect(ke.scopesOverlap('app', 'reader')).toBe(true);
    expect(ke.scopesOverlap('app', 'extension')).toBe(false);
    expect(ke.scopesOverlap('video', 'player')).toBe(true);
    expect(ke.scopesOverlap('reader', 'manga')).toBe(true);
    expect(ke.scopesOverlap('flashcards', 'player')).toBe(false);
    expect(ke.scopesOverlap('reader', 'video')).toBe(false);
  });
});

describe('the player keymap', () => {
  it('round-trips every default player code through a chord', () => {
    for (const row of ke.playerRows()) {
      const chord = ke.playerCodeToChord(row.code);
      expect(ke.chordToPlayerCode(chord), row.action).toBe(row.code);
    }
  });

  it('refuses chords the player cannot hear', () => {
    expect(ke.chordToPlayerCode('Ctrl+D')).toBeNull();
    expect(ke.chordToPlayerCode('Shift+F')).toBeNull();
    expect(ke.chordToPlayerCode('Alt+MouseLeft')).toBeNull();
    expect(ke.chordToPlayerCode('D')).toBe('KeyD');
    expect(ke.chordToPlayerCode(']')).toBe('BracketRight');
  });

  it('writes whole entries the vendor merges per action, keeping the step value', () => {
    expect(ke.setEntryChords('player.seekForward', ['G'])).toBe(true);
    const stored = JSON.parse(localStorage.getItem('sea-video-core-keybindings') ?? '{}');
    expect(stored.seekForward).toEqual({ key: 'KeyG', value: 30 });
    expect(ke.entryChords('player.seekForward')).toEqual(['G']);
    ke.resetPlayerBinding('seekForward');
    expect(JSON.parse(localStorage.getItem('sea-video-core-keybindings') ?? '{}').seekForward).toBeUndefined();
  });

  it('tells the same window, so the player picks a change up without a reload', () => {
    const seen: string[] = [];
    const onStorage = (e: StorageEvent) => seen.push(String(e.key));
    window.addEventListener('storage', onStorage);
    try {
      ke.setEntryChords('player.mute', ['Y']);
    } finally {
      window.removeEventListener('storage', onStorage);
    }
    expect(seen).toContain('sea-video-core-keybindings');
  });
});

describe('conflicts across scopes', () => {
  it('a study-overlay key the player already uses is a real conflict', () => {
    const found = ke.findConflicts('video.toggleLoop', 'D');
    expect(found).toContainEqual(expect.objectContaining({ id: 'player.seekForward', overlapping: true, editable: true }));
  });

  it('a flashcard key that the player also uses is shared, not a conflict', () => {
    const found = ke.findConflicts('flashcards.replayAudio', 'K');
    const player = found.find((c) => c.id === 'player.cycleAudio');
    expect(player?.overlapping).toBe(false);
  });

  it('a system-wide chord collides with the Chrome extension default', () => {
    const found = ke.findConflicts('companion.wheel', 'Alt+Shift+W');
    expect(found).toContainEqual(expect.objectContaining({ id: 'extension.action-wheel', overlapping: true, editable: false }));
  });

  it('marks rows that are in conflict now', () => {
    ks.setBinding('nav.widgets', 'Ctrl+K');
    const map = ke.conflictMap();
    expect(map.get('nav.widgets')?.map((c) => c.id)).toContain('nav.palette');
    expect(map.get('nav.palette')?.map((c) => c.id)).toContain('nav.widgets');
  });
});

describe('resolution', () => {
  it('replace takes the chord from the other command', () => {
    const res = ke.bindWithResolution('nav.widgets', 'Ctrl+K', 'replace', 'replace');
    expect(res.ok).toBe(true);
    expect(res.changed).toEqual(['nav.palette']);
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.palette')).toBe('');
  });

  it('replace keeps the other command\'s other alternatives', () => {
    // Rate Good is 3|G; giving G to Rate Hard leaves Good on 3.
    ke.bindWithResolution('flashcards.hard', 'G', 'replace', 'replace');
    expect(ks.effectiveKeys('flashcards.gotIt')).toBe('3');
    expect(ks.effectiveKeys('flashcards.hard')).toBe('G');
  });

  it('swap hands the other command the previous keys', () => {
    ke.bindWithResolution('nav.settings', 'Ctrl+K', 'replace', 'swap');
    expect(ks.effectiveKeys('nav.settings')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.palette')).toBe('Ctrl+,');
  });

  it('swap works across the app and the player', () => {
    ke.bindWithResolution('video.toggleLoop', 'D', 'replace', 'swap');
    expect(ks.effectiveKeys('video.toggleLoop')).toBe('D');
    expect(ke.entryChords('player.seekForward')).toEqual(['L']);
  });

  it('keep leaves both bound', () => {
    ke.bindWithResolution('nav.widgets', 'Ctrl+K', 'replace', 'keep');
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.palette')).toBe('Ctrl+K');
  });

  it('add mode appends an alternative', () => {
    ke.bindWithResolution('nav.settings', 'Ctrl+Alt+Shift+S', 'add', 'replace');
    expect(ks.effectiveKeys('nav.settings')).toBe('Ctrl+,|Ctrl+Alt+Shift+S');
  });
});

describe('custom shortcuts are edited in place (D264)', () => {
  it('changes name and action and keeps the binding', () => {
    const res = ks.addCustomCommand({ label: 'Open Libary', keys: 'Ctrl+Alt+Shift+1', action: { type: 'openApp', appId: 'music' } });
    expect(res.ok).toBe(true);
    const id = (res as { id: string }).id;
    ks.updateCustomCommand(id, { label: 'Open Library', action: { type: 'openApp', appId: 'library' } });
    const def = ks.listCustomCommands().find((c) => c.id === id)!;
    expect(def.label).toBe('Open Library');
    expect(def.action).toEqual({ type: 'openApp', appId: 'library' });
    expect(ks.effectiveKeys(id)).toBe('Ctrl+Alt+Shift+1');
  });
});

describe('keymap files', () => {
  it('exports both keymaps and imports them back', () => {
    ks.setBinding('nav.widgets', 'Ctrl+Alt+Shift+Y');
    ke.setEntryChords('player.mute', ['Y']);
    const doc = ke.exportKeymap(new Date('2026-10-09T00:00:00Z'));
    const parsed = JSON.parse(doc);
    expect(parsed.format).toBe('gum-keymap');
    expect(parsed.player.mute).toEqual({ key: 'KeyY' });

    ke.resetWholeKeymap();
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
    expect(ke.entryChords('player.mute')).toEqual(['M']);

    const res = ke.importKeymap(doc);
    expect(res).toEqual({ ok: true, player: 1 });
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Alt+Shift+Y');
    expect(ke.entryChords('player.mute')).toEqual(['Y']);
  });

  it('still reads a bare shortcuts export from before kbd5', () => {
    ks.setBinding('nav.widgets', 'Ctrl+Alt+Shift+U');
    const legacy = ks.exportShortcuts();
    ks.resetAllBindings();
    expect(ke.importKeymap(legacy)).toEqual({ ok: true, player: 0 });
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Alt+Shift+U');
  });

  it('names what is wrong with a bad file and drops unknown player actions', () => {
    expect(ke.importKeymap('{nope')).toEqual({ ok: false, error: 'notJson' });
    expect(ke.importKeymap('{"hello":1}')).toEqual({ ok: false, error: 'notKeymap' });
    const doc = JSON.parse(ke.exportKeymap());
    doc.player = { notAnAction: { key: 'KeyQ' }, mute: { key: 42 }, fullscreen: { key: 'KeyO' } };
    expect(ke.importKeymap(JSON.stringify(doc))).toEqual({ ok: true, player: 1 });
    expect(ke.entryChords('player.fullscreen')).toEqual(['O']);
  });
});

describe('the Chrome extension rows', () => {
  it('mirror the extension manifest', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../main/chrome-extension/manifest.json'), 'utf8'),
    ) as { commands: Record<string, { suggested_key?: { default?: string } }> };
    const fromManifest = Object.entries(manifest.commands)
      .filter(([name]) => name !== '_execute_action')
      .map(([name, cmd]) => [name, cmd.suggested_key?.default ?? '']);
    expect(ke.CHROME_KEY_COMMANDS.map((c) => [c.name, c.suggested])).toEqual(fromManifest);
  });
});
