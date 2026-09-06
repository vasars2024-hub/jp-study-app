// @vitest-environment jsdom
/**
 * Aero v1.0 audit item 5.6, offline-assistant half.
 *
 * The assistant's whole risk is that it says something. A search box that finds
 * nothing looks broken; an assistant that finds nothing is TEMPTED to offer the
 * nearest six cards and let the user work it out, and that is indistinguishable
 * from a confident wrong answer. So the negative control is not an afterthought
 * here — it is the main assertion: a question about a capability this app does
 * not have must come back `none`, with an empty list.
 *
 * The positive half is equally specific. `searchSettings` scores per word, so
 * the failure mode being fixed is not "no results" but "the right result buried
 * under `how`, `do`, `i` and `the`". The test therefore asserts the question
 * form and the bare keyword reach the SAME setting, which is the only claim
 * that distinguishes a working question-answerer from a search box with a
 * different label.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsAssistantCard from '../components/settings/pages/SettingsAssistantCard';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';
import {
  answerSettingsQuestion,
  extractQuestionTerms,
} from '../settingsAssistant';
import { en } from '../../shared/i18n/catalogs/en';

const t = (key: string) => key;
const ask = (question: string, advanced = true) =>
  answerSettingsQuestion(question, t, { advanced });

let host: HTMLDivElement;
let root: Root | null = null;
const navigate = vi.fn();

function render() {
  act(() => {
    root = createRoot(host);
    root.render(
      <SettingsProvider
        value={
          { advancedMode: true, focusSettingId: null, navigate } as unknown as SettingsController
        }
      >
        <SettingsAssistantCard />
      </SettingsProvider>,
    );
  });
}

function submit(question: string) {
  const input = host.querySelector<HTMLInputElement>('#help-assistant-input');
  const form = host.querySelector('form');
  if (!input || !form) throw new Error('assistant did not render its form');
  // React installs its own `value` setter to track changes, so assigning
  // `input.value` directly leaves the tracker thinking nothing changed and the
  // `input` event is swallowed. Going through the prototype setter is the
  // documented way to type into a controlled input from a test.
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('no HTMLInputElement value setter');
  act(() => {
    setValue.call(input, question);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigate.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(), writable: true, configurable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

describe('offline settings assistant', () => {
  it('strips the question and keeps the content words', () => {
    expect(extractQuestionTerms('How do I change the wallpaper?')).toEqual(['change', 'wallpaper']);
    // "settings" separates nothing — every entry is one.
    expect(extractQuestionTerms('where are the scraper settings')).toEqual(['scraper']);
  });

  it('answers a real question with the same setting the bare keyword finds', () => {
    const asQuestion = ask('How do I change the language I translate into?');
    const asKeyword = ask('translator');
    expect(asQuestion.entries.length).toBeGreaterThan(0);
    expect(asQuestion.entries.map((e) => e.id)).toContain('translator-languages');
    expect(asKeyword.entries.map((e) => e.id)).toContain('translator-languages');
  });

  it('reports HOW it got there, so the caller cannot overstate the answer', () => {
    // A bare keyword is a phrase hit; a sentence is not, and must say so.
    expect(ask('wallpaper').strategy).toBe('phrase');
    const question = ask('How do I change the language I translate into?');
    expect(question.strategy).not.toBe('phrase');
    expect(question.usedQuery).not.toContain('how');
  });

  it('NEGATIVE CONTROL: refuses a question about a capability that does not exist', () => {
    const answer = ask('how do I print a fax to my toaster');
    expect(answer.entries).toEqual([]);
    expect(answer.strategy).toBe('none');
  });

  it('NEGATIVE CONTROL: does not match a word buried inside another word', () => {
    // This is the assertion that makes `matchesAtWordBoundary` load-bearing,
    // and it exists because the first version of the control above did NOT
    // distinguish it: with the boundary check mutated to a plain substring
    // test, all eight tests stayed green. "paper" inside "wallpaper" is the
    // case that tells them apart — `searchSettings` scores per word by
    // substring, so without the boundary check a question about paper answers
    // with the wallpaper settings.
    const hay = 'recycle paper';
    expect(hay).not.toContain('wallpaper');
    const answer = ask('where do I recycle paper');
    expect(answer.entries.map((e) => e.id)).not.toContain('page-wallpaper');
    expect(answer.entries).toEqual([]);
  });

  it('NEGATIVE CONTROL: an empty question is not a search for everything', () => {
    expect(ask('   ')).toEqual({ entries: [], usedQuery: '', strategy: 'none' });
    // And a question made entirely of stopwords must not fall through to the
    // widest pass, where every word would match something.
    expect(ask('how do i').entries).toEqual([]);
  });

  it('honours advanced-mode visibility, so it cannot offer a hidden setting', () => {
    const shown = ask('scraper', true).entries.map((e) => e.id);
    const hidden = ask('scraper', false).entries.map((e) => e.id);
    expect(shown.length).toBeGreaterThan(0);
    // Not an equality assertion on a fixed list — the claim is only that the
    // advanced view is a superset, which is what "cannot offer a hidden
    // setting" means.
    expect(hidden.every((id) => shown.includes(id))).toBe(true);
  });

  it('navigates into the setting it named, page and card', () => {
    render();
    submit('How do I change the language I translate into?');
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.help-assistant-hits button')];
    expect(buttons.length).toBeGreaterThan(0);
    act(() => buttons[0].click());
    expect(navigate).toHaveBeenCalledOnce();
    const [pageId, settingId] = navigate.mock.calls[0];
    expect(typeof pageId).toBe('string');
    expect(settingId).not.toBe('');
  });

  it('says nothing was found rather than listing unrelated settings', () => {
    render();
    submit('how do I print a fax to my toaster');
    expect(host.querySelectorAll('.help-assistant-hits button')).toHaveLength(0);
    // The rendered card resolves through the real catalog, so these are the
    // catalog's own strings — asserting on key names here would pass against a
    // card that rendered nothing but its title.
    const nothing = en['help.assistant.foundNothing'].split('{')[0];
    expect(host.textContent).toContain(nothing);
    expect(host.textContent).toContain(en['help.assistant.nothingNext']);
    // And the status is announced, not merely present.
    expect(host.querySelector('[role="status"]')?.textContent).toContain(nothing);
  });
});
