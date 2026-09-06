// @vitest-environment jsdom
/**
 * A visual `active` class is paint. It is not a state, and nothing announces it.
 *
 * Measured live 2026-09-06 through the debug bridge, across the four open windows
 * that use this button idiom (`button.gram-level-btn`, `button.gram-mode-btn`,
 * `button.guide-item`): **six controls carried `active` while exposing no
 * `aria-pressed`, `aria-current`, `aria-selected` or `aria-checked` at all** —
 * Grammar's guide-category filter and its open guide, Reading Finder's `Beginner`
 * and `N5`, Dictionary's `日本語` toggle and Translate's `Translate` tab. A screen
 * reader announced every category filter identically whichever one was on.
 *
 * Grammar's two are fixed here. The other four live in files that were dirty with
 * other tracks' work at the time and are filed in
 * `docs/ACTIVE/LIVE_DEFECTS_PRESWEEP.md` row D6 with their exact sites.
 *
 * This guard renders the real component, so it fails on a regression rather than
 * on a rename — and the negative control is built in: it checks the state MOVES
 * with the selection, not merely that an attribute exists. A hardcoded
 * `aria-pressed={true}` on every button passes the first assertion and fails the
 * second.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { GuidesBrowser } from '../components/grammar/GrammarContent';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(<GuidesBrowser />);
  });
  return host;
}

afterEach(() => {
  // Unmount before detaching: an orphaned root outlives the test and eats the
  // next one's module state (banked trap in this repo).
  if (root) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const buttons = (el: HTMLElement, sel = 'button'): HTMLButtonElement[] =>
  Array.from(el.querySelectorAll<HTMLButtonElement>(sel));

/** Every button that paints itself selected must also say so. */
function silentlyActive(el: HTMLElement): string[] {
  return buttons(el)
    .filter((b) => /(^|\s)active(\s|$)/.test(b.className))
    .filter(
      (b) =>
        !b.getAttribute('aria-pressed') &&
        !b.getAttribute('aria-current') &&
        !b.getAttribute('aria-selected') &&
        !b.getAttribute('aria-checked'),
    )
    .map((b) => (b.textContent ?? '').trim().slice(0, 30));
}

describe('grammar guides announce which filter and which guide are selected', () => {
  it('no button paints itself active without exposing that state', () => {
    expect(silentlyActive(mount())).toEqual([]);
  });

  it('the category filter is a toggle whose pressed state follows the selection', () => {
    const el = mount();
    const cats = buttons(el, 'button.gram-level-btn');
    expect(cats.length).toBeGreaterThan(1);

    const pressed = (): HTMLButtonElement[] =>
      buttons(el, 'button.gram-level-btn').filter(
        (b) => b.getAttribute('aria-pressed') === 'true',
      );

    // Exactly one category is on at a time, and at first load it is the first one.
    expect(pressed()).toHaveLength(1);
    const first = pressed()[0];
    expect(first).toBe(cats[0]);

    const other = cats.find((c) => c !== first) as HTMLButtonElement;
    act(() => other.click());

    expect(pressed()).toHaveLength(1);
    expect(pressed()[0]).toBe(other);
    expect(first.getAttribute('aria-pressed')).toBe('false');
  });

  it('the open guide is the current item, and only one is', () => {
    const el = mount();
    const current = (): HTMLButtonElement[] => buttons(el, 'button.guide-item[aria-current]');

    expect(current()).toHaveLength(1);
    const before = current()[0];

    const items = buttons(el, 'button.guide-item');
    expect(items.length).toBeGreaterThan(1);
    const other = items.find((i) => i !== before) as HTMLButtonElement;
    act(() => other.click());

    expect(current()).toHaveLength(1);
    expect(current()[0]).toBe(other);
    // Removed, not set to "false": an unselected row must not appear in the
    // current-item set at all.
    expect(before.hasAttribute('aria-current')).toBe(false);
  });
});
