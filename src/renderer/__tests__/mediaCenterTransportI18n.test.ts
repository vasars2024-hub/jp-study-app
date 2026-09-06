import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, ja } from '../../shared/i18n/catalogs/all';

const VIEW = readFileSync(resolve(__dirname, '..', 'views', 'MediaCenterView.tsx'), 'utf8');

/**
 * The persistent player's buttons are icon-only, so each `title` IS that
 * button's accessible name — a raw literal there is not a tooltip nicety, it is
 * the name a screen reader reads.
 *
 * Repeat was the one left: `title={`Repeat: ${ps.repeat}`}`. Measured live
 * 2026-09-06, the Music window announced "Repeat: off" in every language while
 * the SAME control in `MusicContent.tsx:816` and `MusicWidget.tsx:155` already
 * resolved both halves through the catalog. The keys existed and were
 * translated; only this call site did not use them.
 *
 * A source-shaped guard rather than a render, because the button carries no
 * text node and jsdom would need the whole Media Center mounted to reach it.
 */
describe('the persistent player names its controls through the catalog', () => {
  it('has no raw-literal title, aria-label or placeholder left in the view', () => {
    const raw = VIEW.split('\n')
      .map((line, index) => [index + 1, line] as const)
      // A template that OPENS with an interpolation is composed from the
      // catalog (`{`${t(...)} ...`}`) and is fine. Only one that opens with
      // literal English prose is not.
      .filter(([, line]) => /(?:title|aria-label|placeholder)=(?:"[A-Z]|\{`[A-Z])/.test(line))
      .filter(([, line]) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('{/*'));
    expect(raw.map(([n, line]) => `${n}: ${line.trim().slice(0, 90)}`)).toEqual([]);
  });

  it('builds the repeat name from the two keys that already carry translations', () => {
    expect(VIEW).toContain("t('music.controls.repeatTitle', { mode: t(`music.repeat.${ps.repeat}`) })");
    // The control: the keys must actually resolve, in a language that is not
    // English. A t() call pointing at a missing key renders the key and would
    // still satisfy the assertion above.
    expect(en['music.controls.repeatTitle']).toBe('Repeat: {mode}');
    for (const mode of ['off', 'all', 'one']) {
      expect(en[`music.repeat.${mode}`]).toBeTruthy();
      expect(ja[`music.repeat.${mode}`]).toBeTruthy();
      expect(ja[`music.repeat.${mode}`]).not.toBe(en[`music.repeat.${mode}`]);
    }
    expect(ja['music.controls.repeatTitle']).not.toBe(en['music.controls.repeatTitle']);
  });
});
