/**
 * D189 — the Aero start menu's app subtitles were a module-level literal map.
 *
 * `START_HINTS` held 22 English sentences ("Lookup and pitch", "Everything the
 * app stores") and `renderAeroStartApp` printed them raw. They are the line
 * under every app name in the start menu, so the whole of the app's primary
 * navigation read English in ja/zh/ru.
 *
 * Two things hid it, and both are the point of this file:
 *
 *  - `i18n-partial-check` never counted them. It scores object properties by
 *    NAME (`label:`, `hint:`, `title:`) and this map is keyed by section id
 *    with a bare string value, so its heuristic saw nothing. It reported
 *    DesktopShell at 28 before this fix and 28 after — every one of those 28
 *    belongs to the separate `WIRED_MODULES` map.
 *  - `i18n-orphan-key-check` never counted the two drag tooltips and the pin
 *    tooltip either, because `desktop.dragToMove` / `desktop.dragToDesktop` /
 *    `desktop.addToDesktop` / `desktop.removeFromDesktop` all existed, were
 *    translated, and were being consumed by the legacy start grid a few
 *    hundred lines below. The Aero row simply re-typed them in English.
 *
 * A source scan rather than a render, for the reason
 * `desktopStartMenuSingleVariant.test.ts` gives: `vitest.config.ts` is
 * `environment: 'node'` and `DesktopShell.tsx` pulls the whole shell tree at
 * module eval. Comments are stripped before every scan — a rule spelled out in
 * prose must not be able to satisfy the rule.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { translate } from '../../shared/i18n/core';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const RAW = readFileSync(resolve(REPO, SHELL), 'utf8');

/** Line and block comments out, so prose can never satisfy an assertion. */
const CODE = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** The `START_HINT_KEYS = { … }` body, from the code-only copy. */
function hintMapBody(): string {
  const at = CODE.indexOf('const START_HINT_KEYS');
  expect(at, 'START_HINT_KEYS is gone — was it renamed?').toBeGreaterThan(-1);
  const open = CODE.indexOf('{', at);
  const close = CODE.indexOf('};', open);
  expect(close).toBeGreaterThan(open);
  return CODE.slice(open + 1, close);
}

describe('the start-menu subtitle map holds keys, not prose', () => {
  it('maps every section to a desktop.startApp.* key and nothing else', () => {
    const entries = hintMapBody()
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    expect(entries.length, 'the map lost its entries').toBe(22);
    for (const entry of entries) {
      const match = /^([a-z]+):\s*'([^']+)',$/.exec(entry);
      expect(match, `"${entry}" is not a plain section -> key pair`).toBeTruthy();
      const [, section, value] = match as RegExpExecArray;
      expect(value, `${section} still carries a literal: "${value}"`).toBe(`desktop.startApp.${section}`);
    }
  });

  /**
   * A key on the entry is only half of rule 7 — the consumer has to resolve it.
   * Leaving the map holding keys and the render printing them raw would put
   * `desktop.startApp.novels` on screen, which no catalog check would see.
   */
  it('resolves the key at render, with a fallback that is also a key', () => {
    expect(CODE).toContain("t(START_HINT_KEYS[app.id] ?? 'desktop.startApp.fallback')");
    // The old shape, in either spelling, must be gone.
    expect(CODE).not.toContain('START_HINTS[app.id]');
    expect(CODE).not.toContain("?? 'Study app'");
  });

  /**
   * The four tooltips that already had translated keys. Asserting the English
   * is absent is the half that catches a re-typed literal; asserting the keys
   * are present is the half that catches someone deleting the control entirely.
   */
  it('takes the drag and pin tooltips from the keys that already existed', () => {
    for (const key of [
      'desktop.dragToMove',
      'desktop.dragToDesktop',
      'desktop.removeFromDesktop',
      'desktop.addToDesktop',
      'desktop.openIcon',
    ]) {
      expect(CODE, `${key} is not used`).toContain(`t('${key}'`);
    }
    for (const literal of [
      "'Drag to move on desktop - click to open'",
      "'Drag to desktop - click to open'",
      "'Remove from desktop'",
      "'Add to desktop'",
      '`Open ${ic.name}`',
    ]) {
      expect(CODE, `the literal ${literal} is back`).not.toContain(literal);
    }
  });
});

describe('the catalogs answer every key the start menu can ask for', () => {
  const SECTIONS = [
    'agent', 'player', 'scraper', 'video', 'youtube', 'music', 'dictionary', 'grammar',
    'files', 'immersion', 'library', 'novels', 'reading', 'translate', 'anki',
    'flashcards', 'games', 'stats', 'calendar', 'resources', 'settings', 'city',
  ];

  beforeAll(async () => {
    for (const lang of LANGS) await ensureCatalog(lang);
  });

  it.each(LANGS)('%s carries all 22 subtitles, the fallback and the icon tooltip', (lang) => {
    const catalog = catalogFor(lang);
    for (const section of SECTIONS) {
      const value = catalog[`desktop.startApp.${section}`];
      expect(typeof value, `${lang} cannot answer desktop.startApp.${section}`).toBe('string');
      expect((value as string).length, `${lang}'s ${section} subtitle is empty`).toBeGreaterThan(0);
    }
    expect(typeof catalog['desktop.startApp.fallback']).toBe('string');
    expect(typeof catalog['desktop.openIcon']).toBe('string');
  });

  /**
   * The map's sections and the catalog's keys are two lists that have to stay
   * equal. A key added to the catalog and never put on an entry is dead; an
   * entry added to the map with no key renders the key itself.
   */
  it('has no desktop.startApp key the map does not name, and vice versa', () => {
    const inCatalog = Object.keys(catalogFor('en'))
      .filter((k) => k.startsWith('desktop.startApp.'))
      .map((k) => k.slice('desktop.startApp.'.length))
      .filter((s) => s !== 'fallback')
      .sort();
    expect(inCatalog).toEqual([...SECTIONS].sort());
  });

  /**
   * `desktop.openIcon` is the only one with a slot. A translation that drops
   * `{name}` loses the icon's name from its own tooltip and reads as a generic
   * "Open" — the plural-arm trap in a different shape.
   */
  it.each(LANGS)('fills the icon tooltip slot in %s', (lang) => {
    // `fallback: {}` on purpose: the renderer's own `t()` falls back to English
    // for a key the active catalog is missing, which would let a genuinely
    // untranslated key pass this as though it were fine.
    const rendered = translate('desktop.openIcon', { name: 'Notes' }, {
      lang,
      catalog: catalogFor(lang),
      fallback: {},
    });
    expect(rendered, `${lang} never answered the key`).not.toBe('desktop.openIcon');
    expect(rendered, `${lang} printed the slot`).not.toContain('{name}');
    expect(rendered, `${lang} dropped the name`).toContain('Notes');
  });
});
