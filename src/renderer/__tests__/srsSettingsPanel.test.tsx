// @vitest-environment jsdom
/**
 * The new scheduling controls, driven through the panel over the real setting:
 * steps parse or are refused, the Anki preset applies, leech and spreading
 * settings persist, the session preferences persist, and the optimiser refuses
 * an empty history out loud rather than pretending to fit it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));
vi.mock('../reviewLog', () => ({
  loadReviewLog: () => Promise.resolve([]),
  onReviewLogChanged: () => () => undefined,
  appendReviewLog: (entry: object) => ({ ...entry, id: 'x', at: 0 }),
  removeReviewLogEntry: () => undefined,
}));

import SchedulingPreferencesPanel from '../components/flashcards/SchedulingPreferences';
import { loadSchedulingConfig } from '../flashcardScheduling';
import { loadReviewSessionPrefs } from '../reviewSessionPrefs';

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(SchedulingPreferencesPanel)); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

function textInputs(): HTMLInputElement[] {
  return Array.from(host.querySelectorAll('input[type="text"]'));
}

/** React tracks the value through its own setter; set it the way a keystroke does. */
function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('same-day steps', () => {
  it('starts from the old schedule and commits typed steps on blur', () => {
    mount();
    const [learning, relearning] = textInputs();
    expect(learning.value).toBe('');
    expect(relearning.value).toBe('10m');
    type(learning, '1m 10m 1h');
    expect(loadSchedulingConfig().learningStepsMinutes).toEqual([1, 10, 60]);
  });

  it('refuses a typo out loud and keeps the previous steps', () => {
    mount();
    const [learning] = textInputs();
    type(learning, '1m tenm');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('srs2.steps.invalid');
    expect(learning.getAttribute('aria-invalid')).toBe('true');
    expect(loadSchedulingConfig().learningStepsMinutes).toEqual([]);
  });

  it('applies the Anki preset in one press', () => {
    mount();
    act(() => { button('srs2.steps.ankiPreset').click(); });
    expect(loadSchedulingConfig().learningStepsMinutes).toEqual([1, 10]);
    expect(textInputs()[0].value).toBe('1m 10m');
  });
});

describe('leeches, spreading and the sitting', () => {
  it('persists every control it shows', () => {
    mount();
    const select = host.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = 'suspend';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(loadSchedulingConfig().leechAction).toBe('suspend');
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes).toHaveLength(3);
    act(() => { boxes[0].click(); });
    expect(loadSchedulingConfig().fuzz).toBe(true);
    act(() => { boxes[1].click(); });
    act(() => { boxes[2].click(); });
    expect(loadReviewSessionPrefs()).toEqual({ showTimer: true, autoplayOnReveal: true });
  });
});

describe('FSRS', () => {
  it('shows the workload of the retention, and refuses to fit an empty history', async () => {
    mount();
    const fsrs = host.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
    act(() => { fsrs.click(); });
    expect(host.textContent).toContain('srs2.workload.perCard(');
    expect(host.textContent).toContain('srs2.optimizer.defaults');
    await act(async () => {
      button('srs2.optimizer.run').click();
    });
    // The optimiser is loaded on demand: wait for it, not for a fixed delay.
    for (let i = 0; i < 100 && !host.textContent?.includes('srs2.optimizer.tooFew'); i += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    expect(host.textContent).toContain('srs2.optimizer.tooFew(count=0,min=100)');
    expect(loadSchedulingConfig().fsrsWeights).toBeUndefined();
  });
});
