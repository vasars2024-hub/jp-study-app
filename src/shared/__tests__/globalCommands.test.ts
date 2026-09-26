import { describe, expect, it } from 'vitest';
import {
  chordToAccelerator,
  COMPANION_COMMAND_ORDER,
  GLOBAL_COMMAND_DEFAULTS,
  migrateLegacyGlobalChords,
  normalizeGlobalChord,
  planGlobalRegistrations,
} from '../globalCommands';

describe('chordToAccelerator', () => {
  it('passes an ordinary chord through in Electron’s spelling', () => {
    expect(chordToAccelerator('Ctrl+Alt+J')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+J' });
    expect(chordToAccelerator('ctrl+shift+space')).toEqual({ ok: true, accelerator: 'Ctrl+Shift+Space' });
  });

  it('maps the app’s key names onto Electron’s', () => {
    expect(chordToAccelerator('Ctrl+Alt+ArrowUp')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+Up' });
    expect(chordToAccelerator('Meta+Alt+K')).toEqual({ ok: true, accelerator: 'Alt+Super+K' });
    expect(chordToAccelerator('Ctrl+Alt+Escape')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+Esc' });
    expect(chordToAccelerator('Ctrl+Alt+F12')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+F12' });
    expect(chordToAccelerator('Ctrl+Alt+,')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+,' });
  });

  it('registers only the first keyboard alternative, skipping mouse buttons', () => {
    expect(chordToAccelerator('Ctrl+Alt+J|Ctrl+Alt+K')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+J' });
    expect(chordToAccelerator('Alt+MouseLeft|Ctrl+Alt+K')).toEqual({ ok: true, accelerator: 'Ctrl+Alt+K' });
  });

  it('an unbound chord holds nothing and is not an error', () => {
    expect(chordToAccelerator('')).toEqual({ ok: true, accelerator: '' });
  });

  it('refuses a mouse-only chord and unknown keys', () => {
    expect(chordToAccelerator('Ctrl+MouseRight')).toEqual({ ok: false, error: 'invalid' });
    expect(chordToAccelerator('Ctrl+Alt+Numpad7x')).toEqual({ ok: false, error: 'invalid' });
  });

  it('refuses a chord that would swallow typing in every app', () => {
    expect(chordToAccelerator('J')).toEqual({ ok: false, error: 'needs-modifier' });
    expect(chordToAccelerator('Shift+J')).toEqual({ ok: false, error: 'needs-modifier' });
  });
});

describe('planGlobalRegistrations', () => {
  it('gives a shared chord to the first command and names it for the second', () => {
    const plan = planGlobalRegistrations([
      { id: 'a', chord: 'Ctrl+Alt+J', active: true },
      { id: 'b', chord: 'ctrl+alt+j', active: true },
    ]);
    expect(plan[0]).toEqual({ id: 'a', accelerator: 'Ctrl+Alt+J' });
    expect(plan[1]).toEqual({ id: 'b', accelerator: null, error: 'duplicate', conflictWith: 'a' });
  });

  it('an inactive command neither holds its chord nor blocks another from it', () => {
    const plan = planGlobalRegistrations([
      { id: 'off', chord: 'Ctrl+Alt+J', active: false },
      { id: 'on', chord: 'Ctrl+Alt+J', active: true },
    ]);
    expect(plan[0]).toEqual({ id: 'off', accelerator: null });
    expect(plan[1]).toEqual({ id: 'on', accelerator: 'Ctrl+Alt+J' });
  });

  it('reports a bad chord on its own row without affecting the others', () => {
    const plan = planGlobalRegistrations([
      { id: 'bad', chord: 'Shift+Q', active: true },
      { id: 'good', chord: 'Alt+Shift+Q', active: true },
    ]);
    expect(plan[0].error).toBe('needs-modifier');
    expect(plan[1].accelerator).toBe('Alt+Shift+Q');
  });
});

describe('migrateLegacyGlobalChords', () => {
  it('carries a chord the user chose on the old page into every profile', () => {
    const profiles: Record<string, Record<string, string | null>> = { Default: {}, Reading: {} };
    expect(migrateLegacyGlobalChords(profiles, { 'lens.region': 'Ctrl+Alt+Q' })).toBe(true);
    expect(profiles.Default['lens.region']).toBe('Ctrl+Alt+Q');
    expect(profiles.Reading['lens.region']).toBe('Ctrl+Alt+Q');
  });

  it('moves nothing when the old page still had its own default', () => {
    const profiles: Record<string, Record<string, string | null>> = { Default: {} };
    expect(migrateLegacyGlobalChords(profiles, {
      'lens.region': 'Ctrl+Shift+Space',
      'companion.lookupSelection': 'ctrl+alt+j',
    })).toBe(false);
    expect(profiles.Default).toEqual({});
  });

  it('keeps an override the profile already had, including an explicit unbind', () => {
    const profiles: Record<string, Record<string, string | null>> = {
      Default: { 'companion.lookupSelection': 'Ctrl+Alt+Y' },
      Other: { 'companion.lookupSelection': null },
    };
    expect(migrateLegacyGlobalChords(profiles, { 'companion.lookupSelection': 'Ctrl+Shift+D' })).toBe(false);
    expect(profiles.Default['companion.lookupSelection']).toBe('Ctrl+Alt+Y');
    expect(profiles.Other['companion.lookupSelection']).toBeNull();
  });
});

describe('catalog', () => {
  it('every companion action has a default entry (possibly unbound)', () => {
    for (const id of COMPANION_COMMAND_ORDER) expect(id in GLOBAL_COMMAND_DEFAULTS).toBe(true);
  });

  it('no two built-in defaults share a chord', () => {
    const seen = new Map<string, string>();
    for (const [id, chord] of Object.entries(GLOBAL_COMMAND_DEFAULTS)) {
      const n = normalizeGlobalChord(chord);
      if (!n) continue;
      expect(seen.get(n), `${id} and ${seen.get(n)} share ${n}`).toBeUndefined();
      seen.set(n, id);
    }
  });

  it('every bound default is registrable', () => {
    for (const chord of Object.values(GLOBAL_COMMAND_DEFAULTS)) {
      if (!chord) continue;
      expect(chordToAccelerator(chord).ok, chord).toBe(true);
    }
  });
});
