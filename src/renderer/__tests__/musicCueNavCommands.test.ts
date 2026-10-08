// @vitest-environment jsdom
/**
 * Music keyboard navigation — Phase 6 slice 31.
 *
 * Slice 20 landed the lyric-line transport as three BUTTONS and wrote down, in the pane's
 * own source, why it stopped there: `registerCommandHandler` keeps a stack per id and
 * `runCommand` takes `stack[stack.length - 1]`, so the LAST registrant wins. Reusing
 * `video.replayLine` / `video.prevLine` / `video.nextLine` for the lyrics pane would hand
 * one of the two surfaces both gestures according to mount order — and `MediaWorkspaceHost`
 * mounts at App level, so the pane and the video overlay really are mounted together
 * whenever the media workspace is open over Music. Slices 20, 21, 22, 23, 24, 25, 26, 28
 * and 30 each re-recorded "music keyboard nav needs its OWN music.* rows, a decision to
 * take deliberately". This is that decision, and these are the guards on it.
 *
 * The three rows ship `defaultKeys: ''`, which is the same choice `music.playPause` three
 * lines above them already makes: every free single letter belongs to the adopted player's
 * own keymap, the Music block spends all four `Ctrl+Arrow*` chords on track and volume, and
 * `Ctrl+Alt+Arrow*` is virtual-desktop navigation. An unbound row a user binds beats a
 * default chosen to fill a column — and bind-then-press is no longer an untested claim
 * (phase I of `retirement-step3-harness.mjs`).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const MUSIC_PANE = resolve(SRC, 'renderer/components/music/MusicContent.tsx');
const OVERLAY = resolve(SRC, 'media/VideoCoreStudyOverlay.tsx');

const CUE_NAV_IDS = ['music.prevLine', 'music.replayLine', 'music.nextLine'] as const;

/**
 * Comments out before any source sweep. This file's own subject matter forces it: the
 * comment in `MusicContent.tsx` that explains why these are not `video.*` ids **names
 * `video.replayLine`**, so a raw substring search reads the explanation as the defect.
 * Slice 12 lost a round to exactly this on a CSS value and slice 19 lost two on prose.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

/** `keyboardShortcuts` → `playerBus`, which touches `window.api` at module-eval time. */
function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

afterEach(() => {
  localStorage.clear();
});

describe('the lyric-line transport has catalog rows of its own', () => {
  it('all three exist, in Music, and ship unbound', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const rows = CUE_NAV_IDS.map((id) => ks.COMMAND_CATALOG.find((c) => c.id === id));
    expect(rows.map((r) => r?.id)).toEqual([...CUE_NAV_IDS]);
    expect(rows.map((r) => r?.category)).toEqual(['Music', 'Music', 'Music']);
    // Unbound BY DESIGN. If a default is ever added it has to be free in both this catalog
    // and the adopted player's `vc_defaultKeybindings` — see the `video.*` guards in
    // `deletedPlayerDependents.test.ts`, which is where that check lives.
    expect(rows.map((r) => r?.defaultKeys)).toEqual(['', '', '']);
    expect(rows.every((r) => (r?.note ?? '').length > 0)).toBe(true);
  });

  it('every row is translated, so Settings does not show a bare key', async () => {
    stubApi();
    const { commandLabelKey } = await import('../commandI18n');
    const { CATALOGS } = await import('../../shared/i18n/catalogs/all');

    for (const id of CUE_NAV_IDS) {
      const key = commandLabelKey(id);
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        const entry = (CATALOGS[lang] as Record<string, string>)[key];
        expect(entry, `${key} missing from ${lang}`).toBeTruthy();
      }
    }
  });
});

describe('the lyrics pane owns them, and does not own the video ones', () => {
  it('registers exactly the three music.* ids', () => {
    const pane = code(readFileSync(MUSIC_PANE, 'utf8'));
    const registered = [...pane.matchAll(/registerCommandHandler\('(music\.[a-zA-Z]+)'/g)]
      .flatMap((match) => (match[1] ? [match[1]] : []));
    expect(registered.sort()).toEqual([...CUE_NAV_IDS].sort());
  });

  it('and never registers a video.* id — the whole reason these rows exist', () => {
    const pane = code(readFileSync(MUSIC_PANE, 'utf8'));
    expect(pane).not.toMatch(/registerCommandHandler\('video\./);

    // The other half of the same invariant: the two surfaces' id sets must be disjoint, so
    // mount order can never decide which one answers a key.
    const overlay = code(readFileSync(OVERLAY, 'utf8'));
    const overlayIds = new Set(
      [...overlay.matchAll(/registerCommandHandler\('([a-zA-Z.]+)'/g)]
        .flatMap((match) => (match[1] ? [match[1]] : [])),
    );
    /*
      The control: an expression that matched nothing would pass this for any input.

      Twenty-five since the subtitle and picture controls landed — nineteen `video.*` rows (see
      `deletedPlayerDependents`, which names that set rather than counting it; the six
      newest are dual subtitles, subtitle position up/down, delay reset, hide/show
      subtitles and picture fit) plus six
      `workspace.*` rows the overlay registers for the same reason it registers the
      others: it is the surface that can carry them out. Twenty-seven since the study loop
      added the A-B cycle and the translation reveal (21 `video.*`).
    */
    expect(overlayIds.size).toBe(27);
    expect([...overlayIds].filter((id) => id.startsWith('video.'))).toHaveLength(21);
    expect([...overlayIds].filter((id) => id.startsWith('workspace.'))).toHaveLength(6);
    for (const id of CUE_NAV_IDS) expect(overlayIds.has(id)).toBe(false);
  });
});

describe('the conflict marker the live harnesses read is a real signal', () => {
  /**
   * Both bind-then-press phases (`retirement-step3-harness.mjs` phase I and
   * `music-mining-harness.mjs` phase S) assert `conflict === false` on every row they bind,
   * by looking for the `.sc-conflict` element the settings row renders from
   * `BindingRow.conflictsWith`. That check is only worth anything if the marker can ever be
   * true — otherwise both phases would report "no conflict" for a chord that collides with
   * something, and the choice of `Ctrl+Alt+<digit>` would be unverified rather than checked.
   * Nothing in either run observes it true, so it is grounded here instead.
   */
  it('getBindings reports a shared chord on both commands', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const before = ks.getBindings().find((r) => r.id === 'music.nextLine');
    expect(before?.conflictsWith).toEqual([]);

    // `video.replayLine` ships on R. Point a music row at the same chord on purpose.
    ks.setBinding('music.nextLine', 'R');
    const after = ks.getBindings();
    expect(after.find((r) => r.id === 'music.nextLine')?.conflictsWith)
      .toContain('video.replayLine');
    expect(after.find((r) => r.id === 'video.replayLine')?.conflictsWith)
      .toContain('music.nextLine');

    ks.setBinding('music.nextLine', '');
    expect(ks.getBindings().find((r) => r.id === 'music.nextLine')?.conflictsWith).toEqual([]);
  });
});

describe('bind-then-press, at the unit level', () => {
  it('a chord bound to music.nextLine reaches its handler', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    // The row really is unbound until someone binds it — assert that first, or the test
    // below would pass just as well against a row that shipped with this default.
    expect(ks.effectiveKeys('music.nextLine')).toBe('');

    const fired: string[] = [];
    const off = ks.registerCommandHandler('music.nextLine', () => { fired.push('next'); });
    const uninstall = ks.installKeyboardShortcuts();

    const press = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', {
        key: '7',
        code: 'Digit7',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event;
    };

    // Before the bind: the same press, the same handler, and nothing happens. This is the
    // control, and it is what makes the assertion below mean "the BINDING is what fired".
    const before = press();
    expect(fired).toEqual([]);
    expect(before.defaultPrevented).toBe(false);

    ks.setBinding('music.nextLine', 'Ctrl+Alt+7');
    expect(ks.effectiveKeys('music.nextLine')).toBe('Ctrl+Alt+7');

    const after = press();
    expect(fired).toEqual(['next']);
    expect(after.defaultPrevented).toBe(true);

    uninstall();
    off();
    ks.setBinding('music.nextLine', '');
  });
});
