/**
 * K12: Settings > Help > Keyboard shortcuts lists the video player's OWN keys.
 *
 * `playerKeymap.ts` restates the vendor defaults (renderer code does not import the
 * vendor tree), so this pins the restatement to `vc_defaultKeybindings` in the vendor
 * source: a vendor change fails here instead of the help page silently lying.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYER_DEFAULT_KEYBINDINGS,
  PLAYER_KEYBINDINGS_STORAGE_KEY,
  formatPlayerKeyCode,
  readPlayerKeymap,
} from '../playerKeymap';

const ATOMS = resolve(__dirname, '../../../vendor/seanime-web/app/(main)/_features/video-core/video-core.atoms.ts');

function vendorDefaults(): { action: string; code: string; value?: number }[] {
  const src = readFileSync(ATOMS, 'utf8');
  const start = src.indexOf('export const vc_defaultKeybindings');
  const body = src.slice(src.indexOf('{', start) + 1, src.indexOf('\n}', start));
  return [...body.matchAll(/(\w+):\s*\{\s*key:\s*"(\w+)"(?:,\s*value:\s*([\d.]+))?\s*\}/g)].map((m) => ({
    action: m[1] ?? '',
    code: m[2] ?? '',
    ...(m[3] ? { value: Number(m[3]) } : {}),
  }));
}

function stubStorage(value: string | null): void {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === PLAYER_KEYBINDINGS_STORAGE_KEY ? value : null),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the player keymap the help page shows', () => {
  it('matches the vendor player defaults exactly', () => {
    const vendor = vendorDefaults();
    expect(vendor.length).toBeGreaterThan(10);
    expect(PLAYER_DEFAULT_KEYBINDINGS.map((k) => ({ action: k.action, code: k.code, ...(k.value != null ? { value: k.value } : {}) })))
      .toEqual(vendor);
  });

  it('leaves the study-loop letters free, and no two study keys share a letter', () => {
    // The app's video.* defaults (keyboardShortcuts.ts) must not land on a key the player
    // owns, or one press would both seek and mine. Read from source so this file stays
    // node-only (the shortcut store pulls the music bus at import).
    const catalog = readFileSync(resolve(__dirname, '../keyboardShortcuts.ts'), 'utf8');
    const studyKeys = [...catalog.matchAll(/id: 'video\.(\w+)'[\s\S]*?defaultKeys: '([^']*)'/g)]
      .map((match) => ({ id: match[1] ?? '', keys: match[2] ?? '' }))
      .filter((row) => /^[A-Z]$/.test(row.keys));
    const playerCaps = new Set(PLAYER_DEFAULT_KEYBINDINGS.map((row) => formatPlayerKeyCode(row.code)));
    expect(studyKeys.map((row) => row.id)).toEqual(expect.arrayContaining([
      'mineCurrentLine', 'toggleAutoPause', 'toggleLoop', 'abLoopCycle', 'revealTranslation',
    ]));
    for (const row of studyKeys) expect(playerCaps.has(row.keys)).toBe(false);
    const letters = studyKeys.map((row) => row.keys);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('shows key caps, and follows a rebind made in the player', () => {
    expect(formatPlayerKeyCode('KeyD')).toBe('D');
    expect(formatPlayerKeyCode('ArrowRight')).toBe('→');
    expect(formatPlayerKeyCode('BracketRight')).toBe(']');
    stubStorage(JSON.stringify({ seekForward: { key: 'KeyL', value: 10 }, mute: { key: '' } }));
    const rows = readPlayerKeymap();
    const seek = rows.find((r) => r.action === 'seekForward');
    expect(seek).toMatchObject({ keys: 'L', params: { seconds: 10 }, labelKey: 'helpKeys.player.seekForward' });
    expect(rows.some((r) => r.action === 'mute')).toBe(false);
    // The fixed keys the player handles itself are listed too.
    expect(rows.find((r) => r.action === 'playPause')?.keys).toBe('Space · Enter');
  });
});
