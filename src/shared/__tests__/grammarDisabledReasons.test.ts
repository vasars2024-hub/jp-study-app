// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, translate } from '../i18n/core';

/**
 * The reasons behind the Grammar explorer's three unexplained disabled controls.
 *
 * The defect they exist for: `gram-x-controls` renders Back, Forward and
 * `Selection (0)` disabled the moment the explorer mounts, and none of the three
 * carried a `title`, an `aria-describedby` or any nearby prose. The category-8
 * harness read 0 mute pairs there for a whole turn because it accepted a
 * neighbouring BUTTON's caption as the explanation; with that repaired it reads
 * 3. `Save`, three elements away in `gram-x-presets`, has named its own
 * condition since it shipped — this is that precedent applied to its siblings.
 *
 * `selectionReason` already existed and was already passed to the three drawer
 * buttons; the drawer TOGGLE, which is what the user meets first, was the one
 * that never got it.
 */
const KEYS = [
  'grammar.explorer.reason.noBack',
  'grammar.explorer.reason.noForward',
  'grammar.explorer.reason.noSelection',
] as const;

const render = (key: string, lang: (typeof UI_LANGS)[number]) =>
  translate(key, undefined as never, { lang, catalog: CATALOGS[lang], fallback: en });

/**
 * The category-8 harness's own bar, weighted the same way it is there.
 *
 * The flat 12-character version of this test is what FOUND the harness's
 * correction 12: it went red on ja `noForward` (11) and zh `noSelection` (10),
 * two strings that read as complete sentences. 12 Latin letters and 12 Japanese
 * characters are not the same amount of sentence, so a CJK character counts 2 —
 * and the constant stays 12 rather than dropping, because a lower one would let
 * a genuinely mute two-word English hint through.
 */
const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;
const weigh = (s: string) =>
  [...s].reduce((n, c) => n + (CJK.test(c) ? 2 : 1), 0);

describe('grammar explorer disabled reasons', () => {
  it('carries all three reasons in all four catalogs', () => {
    for (const lang of UI_LANGS) {
      for (const key of KEYS) {
        expect(CATALOGS[lang][key], `${key} missing from ${lang}`).toBeDefined();
      }
    }
  });

  it('renders a sentence long enough to count as an explanation', () => {
    for (const lang of UI_LANGS) {
      for (const key of KEYS) {
        const text = render(key, lang);
        expect(text, `${lang} left a raw key for ${key}`).not.toBe(key);
        // The harness's own bar: below 12 weighted units is not an explanation,
        // so a reason that would still score as a mute pair is a failure here.
        expect(weigh(text), `${lang} ${key} is too short to be an explanation`)
          .toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('actually translates rather than falling back to English', () => {
    // The negative control: delete a locale's entry and `translate` falls back to
    // `en`, collapsing these to equal.
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      for (const key of KEYS) {
        expect(render(key, lang), `${lang} renders the English sentence for ${key}`)
          .not.toBe(render(key, 'en'));
      }
    }
  });
});

/**
 * The wiring latch. What it can prove: the three controls in `gram-x-controls`
 * still pass a `title`. What it cannot prove: that the title RENDERS — that was
 * read off the live DOM instead (Back/Forward/Selection/Save all four returning
 * their sentence, mute pairs 3 -> 0). There is no `@testing-library/react` in
 * this repo, so a component render test is not an option here.
 */
const SOURCE = readFileSync(
  fileURLToPath(new URL('../../renderer/components/grammar/GrammarExplorer.tsx', import.meta.url)),
  'utf8',
);

describe('grammar explorer wiring', () => {
  it('passes a title alongside every disabled prop in the controls row', () => {
    const row = SOURCE.slice(
      SOURCE.indexOf('className="gram-x-controls"'),
      SOURCE.indexOf('className="gram-x-presets"'),
    );
    expect(row.length, 'the controls row moved or was renamed').toBeGreaterThan(200);
    const disabledCount = (row.match(/\bdisabled=\{/g) || []).length;
    const titleCount = (row.match(/\btitle=\{/g) || []).length;
    expect(disabledCount, 'the controls row lost its disabled buttons').toBe(3);
    expect(titleCount, 'a disabled control in gram-x-controls has no reason').toBe(disabledCount);
  });

  it('gates each reason on its own condition rather than showing it always', () => {
    // A title present while the control is ENABLED is noise, not honesty, which
    // is why `Save` writes `undefined` in that branch and these follow it.
    expect(SOURCE).toContain("noBack ? t('grammar.explorer.reason.noBack') : undefined");
    expect(SOURCE).toContain("noForward ? t('grammar.explorer.reason.noForward') : undefined");
    expect(SOURCE).toContain("noSelection ? t('grammar.explorer.reason.noSelection') : undefined");
  });
});
