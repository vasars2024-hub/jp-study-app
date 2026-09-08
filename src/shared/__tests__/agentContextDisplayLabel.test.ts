/**
 * A `route` context chip must not be frozen in the language it was captured in.
 *
 * Measured live 2026-09-08 (window 1, pid 22788, the user's own Agent workspace,
 * 6 shelf items — register row D425). The app was switched to Japanese through
 * its own Settings ▸ Appearance control, `document.documentElement.lang` went to
 * `ja`, all 8 desk window titles became Japanese and all 45 Agent controls
 * translated (0 English left). The shelf did not:
 *
 *   kind 場所 · label "Grammar"        · 通常
 *   kind 場所 · label "Translate"      · 通常
 *   kind 場所 · label "Dictionary"     · 通常
 *   kind 場所 · label "Control Center" · 通常
 *
 * `routeAgentContext` resolves the section name through `t()` and the result is
 * persisted (`agentContextHandoff.ts:286`), so the stored string keeps the
 * capture-time language. The items are `retained`, so it survives a restart and
 * never self-heals.
 *
 * The two dictionary items on the same shelf — 〜あとで and 食べる — are the
 * control: they are the user's own study content and MUST keep their stored
 * label, which is what stops the fix from being "translate every label".
 */
import { describe, expect, it } from 'vitest';
import { agentContextDisplayLabel } from '../agentContext';
import type { AgentContextItem } from '../agentWorkspace';

const KEYS: Record<string, string> = {
  grammar: 'palette.section.grammar',
  translate: 'palette.section.translate',
  dictionary: 'palette.section.dictionary',
  settings: 'palette.section.settings',
  // Deliberately mapped to a key the stub catalogue below does NOT answer, so
  // the "key exists but resolves to nothing" arm has its own subject and does
  // not have to borrow `settings`.
  player: 'palette.section.player',
};

/**
 * A catalogue that answers in Japanese, and returns the key when it cannot.
 *
 * `settings` IS answered here, and that is load-bearing rather than incidental:
 * with it missing, the settings-route case passed through the unresolved-key
 * fallback instead of through the `source.route` guard it is named for, and
 * removing that guard left the suite green. Caught by running the mutation.
 */
const ja = (key: string): string =>
  ({
    'palette.section.grammar': '文法',
    'palette.section.translate': '翻訳',
    'palette.section.dictionary': '辞書',
    'palette.section.settings': '設定',
  })[key] ?? key;

type Item = Pick<AgentContextItem, 'kind' | 'label' | 'source'>;

const route = (app: string, label: string, extra: Record<string, string> = {}): Item =>
  ({ kind: 'route', label, source: { app, ...extra } }) as Item;

describe('agentContextDisplayLabel', () => {
  it('re-resolves a bare route label, so a shelf captured in English reads Japanese', () => {
    expect(agentContextDisplayLabel(route('grammar', 'Grammar'), KEYS, ja)).toBe('文法');
    expect(agentContextDisplayLabel(route('translate', 'Translate'), KEYS, ja)).toBe('翻訳');
    expect(agentContextDisplayLabel(route('dictionary', 'Dictionary'), KEYS, ja)).toBe('辞書');
  });

  it('CONTROL — leaves the user’s own content exactly as stored', () => {
    // The two dictionary items that sat on the same live shelf. Translating a
    // looked-up word would be the i18n policy's exact prohibition.
    const word: Item = {
      kind: 'dictionary-entry',
      label: '食べる',
      source: { app: 'dictionary' },
    } as Item;
    expect(agentContextDisplayLabel(word, KEYS, ja)).toBe('食べる');
    const selection: Item = {
      kind: 'selected-text',
      label: 'Grammar',
      source: { app: 'grammar' },
    } as Item;
    // Same string, different kind: it is a selection the user made, not a place.
    expect(agentContextDisplayLabel(selection, KEYS, ja)).toBe('Grammar');
  });

  it('leaves a settings route alone — its label names a card, not a section', () => {
    // `settingsRouteAgentContext` sets `source.route` and, for a control,
    // `controlId`. There is no section key that names "the Theme card".
    expect(
      agentContextDisplayLabel(
        route('settings', 'Theme', { route: 'appearance', controlId: 'theme' }),
        KEYS,
        ja,
      ),
    ).toBe('Theme');
    expect(
      agentContextDisplayLabel(route('settings', 'Appearance', { route: 'appearance' }), KEYS, ja),
    ).toBe('Appearance');
  });

  it('falls back to the stored label rather than printing a raw key', () => {
    // An unknown section, and a section whose key nothing resolves — showing
    // `palette.section.settings` would be worse than the stale English.
    expect(agentContextDisplayLabel(route('nosuch', 'Control Center'), KEYS, ja)).toBe(
      'Control Center',
    );
    expect(agentContextDisplayLabel(route('player', 'Player'), KEYS, ja)).toBe('Player');
  });

  it('is a no-op when the stored label already matches the active language', () => {
    expect(agentContextDisplayLabel(route('grammar', '文法'), KEYS, ja)).toBe('文法');
  });
});
