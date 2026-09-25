// @vitest-environment jsdom
/**
 * J11: the first-launch consent card is the first screen a new user sees, and it came
 * before any way to choose the UI language — a Japanese or Russian learner had to answer a
 * privacy question in English. The card now carries the UI-language picker and switching it
 * re-renders the card live.
 *
 * `setUiLang` lands on a promise (the catalog chunk), so each switch is followed by
 * `ensureCatalog` inside `act` to flush it — without that the assertions read the previous
 * language and pass vacuously.
 */
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { UI_LANGS } from '../../shared/i18n/core';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { getUiLang, setUiLang, t } from '../i18n';
import ConsentScreen from '../components/ConsentScreen';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  for (const lang of UI_LANGS) await ensureCatalog(lang);
});

beforeEach(() => {
  localStorage.removeItem(TELEMETRY_CONSENT_KEY);
});

afterEach(async () => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  setUiLang('en');
  await ensureCatalog('en');
  localStorage.removeItem(TELEMETRY_CONSENT_KEY);
});

async function mount(): Promise<HTMLDivElement> {
  const el = document.createElement('div');
  document.body.append(el);
  host = el;
  root = createRoot(el);
  await act(async () => {
    root!.render(<ConsentScreen />);
  });
  return el;
}

function langButton(el: HTMLElement, label: string): HTMLButtonElement {
  const btn = [...el.querySelectorAll<HTMLButtonElement>('.consent-lang button')].find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`no language button "${label}"`);
  return btn;
}

describe('ConsentScreen UI-language picker', () => {
  it('offers every UI language, with the current one pressed', async () => {
    const el = await mount();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.consent-lang button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['English', '日本語', '中文', 'Русский']);
    expect(langButton(el, 'English').getAttribute('aria-pressed')).toBe('true');
    expect(langButton(el, '日本語').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the UI language live, and the card re-renders in it', async () => {
    const el = await mount();
    const enTitle = el.querySelector('h1')?.textContent;

    await act(async () => {
      langButton(el, '日本語').click();
      await ensureCatalog('ja');
    });
    expect(getUiLang()).toBe('ja');
    const jaTitle = el.querySelector('h1')?.textContent;
    expect(jaTitle).toBe(t('consent.map.title'));
    expect(jaTitle).not.toBe(enTitle);
    expect(langButton(el, '日本語').getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      langButton(el, 'Русский').click();
      await ensureCatalog('ru');
    });
    expect(getUiLang()).toBe('ru');
    expect(el.querySelector('.consent-yes')?.textContent).toBe(t('consent.map.yes'));
    // Choosing a language is not an answer: the card stays up.
    expect(el.querySelector('.consent-card')).not.toBeNull();
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBeNull();
  });

  it('the Share button is painted with the deep accent red, not the salmon --accent-2', () => {
    // Computed colours are not available in jsdom; the rule itself is the contract.
    const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
    const rule = /\n\.consent-yes \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*var\(--red-deep\)/);
    expect(rule).not.toMatch(/(background|border-color):\s*var\(--accent-2\)/);
  });
});
