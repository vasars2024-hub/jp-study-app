// @vitest-environment jsdom
/**
 * The one control on the Anki window that went dead without saying why — and then
 * said it only to a mouse.
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
 * what happened, not why pressing the button does nothing.
 *
 * Boss audit F4 (`audit-20260905-183822-04a7d2a3`) then measured the first repair live and
 * found it mouse-only: `disabled: true`, `aria-disabled: null`, `aria-describedby: null`,
 * with the whole sentence in the native `title`. A `disabled` button is not
 * keyboard-focusable and `title` is not reliably announced, so a keyboard or screen-reader
 * user still got the bare word "Saved".
 *
 * The previous version of this file read the contract out of the source text, because
 * jsdom performs no layout. That was the weaker instrument and it is why the a11y gap
 * survived a green suite: a `title=` string in source looks identical to a reason a user
 * can actually reach. This renders the real component instead and asks the questions an
 * assistive technology asks — is the control focusable, does `aria-describedby` resolve to
 * text, and does the refusal actually hold when the control is pressed anyway.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';
import { DEFAULT_PROFILE_ID, SEED_PROFILES } from '../../shared/seedProfiles';

const updateProfile = vi.fn();
vi.mock('../profileState', () => ({ updateProfile: (...a: unknown[]) => updateProfile(...a) }));
vi.mock('../components/AnkiCardPreview', () => ({ default: () => null }));

const CLEAN = 'anki.fieldMapping.saveDisabled.clean';
const SAVING = 'anki.fieldMapping.saveDisabled.saving';
const FIELDS = ['Front', 'Back'];

let root: Root;
let host: HTMLDivElement;

async function mountEditor() {
  const { default: FieldMappingEditor } = await import('../components/FieldMappingEditor');
  await act(async () => {
    root.render(
      <FieldMappingEditor profile={SEED_PROFILES[DEFAULT_PROFILE_ID]} fields={FIELDS} />,
    );
  });
}
function saveButton(): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>('.fm-actions button.btn.primary');
  if (!el) throw new Error('save button not rendered');
  return el;
}
/** What an assistive technology reads: the described-by text, never the control's own. */
function announcedReason(button: HTMLElement): string {
  const ids = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  // getElementById, not a selector: React's `useId` mints ids containing characters a
  // CSS selector must escape, and jsdom here has no `CSS.escape` to do it with.
  return ids
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updateProfile.mockReset().mockResolvedValue({ ok: true });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('anki field-mapping save button names its own disabled reason', () => {
  it('reaches a keyboard user: focusable, aria-disabled, and described by rendered text', async () => {
    await mountEditor();
    const button = saveButton();

    // The gap F4 measured. `disabled` would make all three of these unreachable.
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.focus();
    expect(document.activeElement).toBe(button);

    // The reason is real text in the document, not an attribute only a hover reveals.
    expect(announcedReason(button)).toBe(en[CLEAN]);
    expect(button.getAttribute('title')).toBe(en[CLEAN]);
    // And it is NOT the button's own label, which is what category 8 rejects.
    expect(announcedReason(button)).not.toBe(button.textContent?.trim());
  });

  it('still refuses the save it says it is refusing, when pressed anyway', async () => {
    await mountEditor();
    // aria-disabled leaves the control clickable, so the refusal has to be real code.
    await act(async () => {
      saveButton().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('drops both the reason and aria-disabled the moment the mapping is pressable', async () => {
    await mountEditor();
    const input = host.querySelector<HTMLInputElement>('.fm-rows input.fm-input');
    if (!input) throw new Error('field inputs not rendered');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, '{expression} edited');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const button = saveButton();
    // A permanent explanation is not what category 8 asked for: the string is a DISABLED
    // reason, so a pressable button must carry none of it.
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(button.getAttribute('aria-describedby')).toBe(null);
    expect(button.getAttribute('title')).toBe(null);
    expect(host.querySelector('.fm-action-reason')).toBe(null);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(updateProfile).toHaveBeenCalledTimes(1);
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
