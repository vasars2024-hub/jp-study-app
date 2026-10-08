/**
 * Where the four practice modes and the scheduling setting are reachable from.
 *
 * Study OS and Blanc are not two implementations: `BlancFlashcardsPanel` embeds
 * the SAME `FlashcardDeckOverview`, so every mode, the deck picker and the
 * scheduling panel reach Blanc by construction rather than by being ported.
 * That is the right design and it is also fragile in one specific way — the
 * moment someone gives Blanc its own overview body, all of it silently
 * disappears from that host and nothing else in the suite would notice.
 *
 * Source-text assertions, the same instrument `transcriptionCardHosts` uses for
 * the same reason: what is being checked is a WIRING claim, and a rendered pass
 * of Blanc would prove it for one tab on one day rather than as a contract.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRACTICE_MODES } from '../../shared/flashcardPractice';

const SRC = resolve(__dirname, '..');
const read = (path: string): string => readFileSync(resolve(SRC, path), 'utf8').replace(/\r\n/g, '\n');

describe('practice mode host parity', () => {
  it('registers every mode the launcher can open, and opens every mode it registers', () => {
    const cards = read('components/flashcards/FlashcardsContent.tsx');
    // The launcher renders from PRACTICE_MODES, so a registered mode with no
    // branch is a button that opens nothing — the dead control this repo keeps
    // finding — and a branch with no entry is a surface nobody can reach.
    for (const entry of PRACTICE_MODES) {
      expect(cards).toMatch(new RegExp(`practice === '${entry.id}'`));
    }
    const branches = [...cards.matchAll(/practice === '(\w+)'/g)].map((m) => m[1]);
    expect(new Set(branches)).toEqual(new Set([...PRACTICE_MODES.map((e) => e.id), 'none']));
  });

  it('passes the chosen deck into every mode rather than letting one default to all', () => {
    const cards = read('components/flashcards/FlashcardsContent.tsx');
    for (const entry of PRACTICE_MODES) {
      const name = `${entry.id[0].toUpperCase()}${entry.id.slice(1)}Mode`;
      expect(cards).toContain(`<${name} deck={practiceDeck}`);
    }
  });

  it('every mode draws through the filtered loader, never the whole deck', () => {
    for (const entry of PRACTICE_MODES) {
      const name = `${entry.id[0].toUpperCase()}${entry.id.slice(1)}Mode`;
      const source = read(`components/flashcards/${name}.tsx`);
      expect(source).toContain('loadPracticeDeck(deck)');
      // `loadDeck()` here would silently practise the whole collection.
      expect(source).not.toMatch(/\bloadDeck\(\)/);
    }
  });

  it('reaches Blanc through the shared overview, not a second implementation', () => {
    // Blanc's Cards tab has its own module since the per-panel chunk split.
    const blanc = read('components/blanc/BlancFlashcardsPanel.tsx');
    expect(blanc).toContain('FlashcardDeckOverview');
    expect(blanc).toContain('<FlashcardDeckOverview state={state} />');
    // If this ever fails, Blanc has grown its own body and the four modes, the
    // deck picker and the scheduling panel have to be wired there explicitly.
    expect(blanc).not.toMatch(/blanc-flashcards-embed[\s\S]{0,400}PRACTICE_MODES/);
  });

  it('keeps the scheduling setting in the same shared overview', () => {
    const cards = read('components/flashcards/FlashcardsContent.tsx');
    expect(cards).toContain('<SchedulingPreferencesPanel />');
  });

  it('gives every mode a way back out', () => {
    for (const entry of PRACTICE_MODES) {
      const name = `${entry.id[0].toUpperCase()}${entry.id.slice(1)}Mode`;
      const source = read(`components/flashcards/${name}.tsx`);
      // The prop exists in the signature and is actually rendered as a control.
      expect(source).toContain('onExit');
      expect(source).toMatch(/onClick=\{onExit\}/);
    }
  });
});
