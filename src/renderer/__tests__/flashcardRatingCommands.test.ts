// @vitest-environment jsdom
/**
 * Flashcard review — the four ratings and the replay key.
 *
 * The 2026-08-29 audio-flashcard lane added Hard/Easy rating buttons and an audio-replay
 * button to the review session, but the session's keyboard path goes through the central
 * rebindable command manager and only `flashcards.again` and `flashcards.gotIt` had rows.
 * So two of the four Anki ratings and the replay had NO keyboard path at all — including in
 * audio-only review, where replay is the only way to hear the prompt a second time.
 *
 * The `gotIt` default moved from `2|G` to `3|G` in the same change: with four ratings on
 * screen in Anki order, `2` belongs to Hard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const FLASHCARDS = resolve(SRC, 'renderer/components/flashcards/FlashcardsContent.tsx');

const RATING_IDS = [
  'flashcards.again',
  'flashcards.hard',
  'flashcards.gotIt',
  'flashcards.easy',
] as const;
const REVIEW_IDS = [
  ...RATING_IDS,
  'flashcards.replayAudio',
  'flashcards.flip',
  'flashcards.prev',
  'flashcards.next',
  'flashcards.end',
  // Undo last rating (Ctrl+Z): puts the card back with its old schedule.
  'flashcards.undo',
] as const;

/** Comments out first: this file's subject names `video.replayLine` in a catalog note. */
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

describe('all four ratings and the replay have catalog rows', () => {
  it('the digit row reads 1/2/3/4 in Anki order, and replay is bound', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const rows = RATING_IDS.map((id) => ks.COMMAND_CATALOG.find((c) => c.id === id));
    expect(rows.map((r) => r?.id)).toEqual([...RATING_IDS]);
    expect(rows.every((r) => r?.category === 'Flashcards')).toBe(true);
    // `gotIt` keeps G as an alternative; the digits are what changed.
    expect(rows.map((r) => r?.defaultKeys)).toEqual(['1', '2', '3|G', '4']);

    const replay = ks.COMMAND_CATALOG.find((c) => c.id === 'flashcards.replayAudio');
    expect(replay?.category).toBe('Flashcards');
    expect(replay?.defaultKeys).toBe('P');
  });

  it('none of the five defaults collides with another command', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    const bindings = ks.getBindings();
    for (const id of [...RATING_IDS, 'flashcards.replayAudio']) {
      expect(bindings.find((r) => r.id === id)?.conflictsWith, id).toEqual([]);
    }

    /*
      The control. An empty `conflictsWith` on every row would also be what a broken
      detector returns, so make it fire: bare R is `video.replayLine`, which is exactly
      why the replay row is on P and not on R.
    */
    ks.setBinding('flashcards.replayAudio', 'R');
    expect(ks.getBindings().find((r) => r.id === 'flashcards.replayAudio')?.conflictsWith)
      .toContain('video.replayLine');
    ks.resetBinding('flashcards.replayAudio');
    expect(ks.effectiveKeys('flashcards.replayAudio')).toBe('P');
  });

  it('every row is translated, so Settings never shows a bare id', async () => {
    stubApi();
    const { commandLabelKey } = await import('../commandI18n');
    const { CATALOGS } = await import('../../shared/i18n/catalogs/all');

    for (const id of REVIEW_IDS) {
      const key = commandLabelKey(id);
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        const entry = (CATALOGS[lang] as Record<string, string>)[key];
        expect(entry, `${key} missing from ${lang}`).toBeTruthy();
      }
    }
  });
});

describe('the review session registers a handler for each of them', () => {
  it('all ten review ids, and no stragglers', () => {
    const source = code(readFileSync(FLASHCARDS, 'utf8'));
    const registered = new Set(
      [...source.matchAll(/registerCommandHandler\('(flashcards\.[a-zA-Z]+)'/g)]
        .flatMap((match) => (match[1] ? [match[1]] : [])),
    );
    expect([...registered].sort()).toEqual([...REVIEW_IDS].sort());
  });

  it('replay is NOT gated on the card being flipped — audio-only review needs it first', () => {
    const source = readFileSync(FLASHCARDS, 'utf8');
    const block = /registerCommandHandler\('flashcards\.replayAudio', \(\) => \{([\s\S]*?)\n {6}\}\)/
      .exec(source);
    expect(block, 'replayAudio handler not found').toBeTruthy();
    expect(block?.[1]).not.toMatch(/flipped/);
    expect(block?.[1]).toMatch(/playCurrentAudio/);

    // The control: the ratings in the same block ARE gated, so "no `flipped`" is a
    // property of this handler and not of the regex.
    const hard = /registerCommandHandler\('flashcards\.hard', \(\) => \{([\s\S]*?)\n {6}\}\)/
      .exec(source);
    expect(hard?.[1]).toMatch(/flipped/);
  });
});

describe('bind-then-press, at the unit level', () => {
  it('the Hard digit reaches its handler, and did nothing before it was registered', async () => {
    stubApi();
    const ks = await import('../keyboardShortcuts');

    expect(ks.effectiveKeys('flashcards.hard')).toBe('2');

    const press = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', {
        key: '2',
        code: 'Digit2',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      return event;
    };

    const uninstall = ks.installKeyboardShortcuts();

    // Control: the row is bound, but no view has registered a handler, so the press is a
    // dead binding and falls through. This is what made the defect invisible.
    const before = press();
    expect(before.defaultPrevented).toBe(false);

    const fired: string[] = [];
    const off = ks.registerCommandHandler('flashcards.hard', () => { fired.push('hard'); });
    const after = press();
    expect(fired).toEqual(['hard']);
    expect(after.defaultPrevented).toBe(true);

    off();
    uninstall();
  });
});
