// @vitest-environment jsdom
/**
 * The knowledge-grade buttons on the dictionary popup speak the UI language
 * (round-4 journeys audit).
 *
 * Measured on the packaged app: in every UI language the four buttons under a
 * looked-up word read N / L / F / K with tooltips "New", "Learning", "Familiar",
 * "Known" — `knownWords.WK_LEVELS` is an English id list and both the popup and
 * the Lens reader printed it. The translated labels already existed
 * (`lexicon.knowledge.*`, used by the dictionary's results rows).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { UI_LANGS, type UiLang } from '../../shared/i18n/core';
import { setUiLang } from '../i18n';
import DictionaryPopup from '../components/DictionaryPopup';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const api = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('on')) return () => () => undefined;
        if (prop.startsWith('lookup')) return () => Promise.resolve({ entries: [] });
        return () => Promise.resolve(null);
      },
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
  setUiLang('en');
});

async function gradeButtons(lang: UiLang): Promise<HTMLButtonElement[]> {
  await ensureCatalog(lang);
  setUiLang(lang);
  await ensureCatalog(lang);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<DictionaryPopup query="窓" x={10} y={10} onClose={() => undefined} />);
  });
  return [...host.querySelectorAll<HTMLButtonElement>('.wk-grade-btn')];
}

const LEVELS = ['new', 'learning', 'familiar', 'known'];

describe('dictionary popup grade buttons', () => {
  it.each(UI_LANGS)('are labelled in %s, each with its own letter', async (lang) => {
    const buttons = await gradeButtons(lang);
    expect(buttons).toHaveLength(4);
    const faces = buttons.map((b) => b.textContent);
    expect(faces).toEqual(LEVELS.map((level) => CATALOGS[lang][`lexicon.knowledge.short.${level}`]));
    expect(new Set(faces).size, 'no two levels share a letter').toBe(4);
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(
      LEVELS.map((level) => CATALOGS[lang][`lexicon.knowledge.${level}`]),
    );
    if (lang !== 'en') {
      expect(buttons.map((b) => b.title)).not.toContain('New');
      expect(faces).not.toEqual(['N', 'L', 'F', 'K']);
    }
  });
});
