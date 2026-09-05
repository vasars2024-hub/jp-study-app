/**
 * The one control on the Anki window that went dead without saying why.
 *
 * Rubric category 8 ("honest states") against the live Anki window on 2026-09-05, with
 * AnkiConnect answering: `mutePairCount 1` of `disabledTotal 2`. The survivor was
 * `button.btn.primary` in `div.fm-actions` — the field-mapping Save button — whose only
 * account of itself was its own label, "Saved".
 *
 * The harness deliberately does not read a control's OWN text as its explanation
 * (correction 11 in `cat8-honest-states.cjs`: a neighbouring label is not an explanation
 * either, and reading the parent's textContent made six Scraper buttons pass on each
 * other's captions). That is the right rule here and not a technicality: "Saved" reports
 * what happened, not why pressing the button does nothing. The other disabled control in
 * the same window already carried a real reason — "The default profile cannot be deleted"
 * — which is what made this one the outlier rather than the norm.
 *
 * The two reasons are separate because the button dies two ways: it is clean, or a save is
 * already in flight. Both are states the user can be in and neither was named.
 *
 * jsdom performs no layout and this component needs a live profile and a main-process
 * `updateProfile`, so the contract is read from source with comments stripped — the prose
 * above and beside the button names every token asserted here, and a raw-text search would
 * score the prose as the declaration (`source-ratchet-reads-comments`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

const SRC = readFileSync(resolve(__dirname, '../components/FieldMappingEditor.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const CLEAN = 'anki.fieldMapping.saveDisabled.clean';
const SAVING = 'anki.fieldMapping.saveDisabled.saving';

describe('anki field-mapping save button names its own disabled reason', () => {
  it('carries a title for both ways it goes dead, and none while it is pressable', () => {
    // The button under test, isolated by its own disabled expression so a title added to
    // some other button in the file cannot satisfy this.
    const at = SRC.indexOf('disabled={saving || !dirty}');
    expect(at).toBeGreaterThan(-1);
    const button = SRC.slice(Math.max(0, at - 400), at + 400);
    expect(button).toContain('title=');
    expect(button).toContain(SAVING);
    expect(button).toContain(CLEAN);
    // A permanent tooltip is not what category 8 asked for: the string is a DISABLED
    // reason, so the enabled branch must have none.
    expect(button).toMatch(/dirty\s*\?\s*undefined/);
  });

  it('gives each reason enough weight to count as an explanation in all four languages', () => {
    // `cat8-honest-states.cjs` scores an explanation as absent below 12 weighted
    // characters, which is the bar a bare "Saved" or "Nothing" would fail.
    for (const [name, cat] of Object.entries({ en, ja, zh, ru })) {
      for (const key of [CLEAN, SAVING]) {
        const value = (cat as Record<string, unknown>)[key];
        expect(typeof value, `${name} is missing ${key}`).toBe('string');
        expect(String(value).trim().length, `${name}.${key} is too short to explain`).
          toBeGreaterThanOrEqual(12);
      }
    }
    // And it must actually say what is wrong, not merely be long.
    expect(en[CLEAN]).toMatch(/save/i);
  });
});
