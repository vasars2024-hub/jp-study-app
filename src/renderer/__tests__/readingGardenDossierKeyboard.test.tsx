// @vitest-environment jsdom
/**
 * Liquid Workplace L9 · City (the Reading Garden).
 *
 * The mushroom is an `aria-expanded` disclosure whose panel is a
 * `role="dialog"`, and it was missing both halves of that contract: Escape did
 * not close it, and closing it left focus on `document.body`, so a keyboard
 * user had to Tab back through the whole garden.
 *
 * Mounted for real rather than read from source — the point is where focus
 * lands, which only a render can answer. jsdom has no 2D canvas context, so
 * the garden's sprite work is expected to no-op; the disclosure is plain DOM
 * and is unaffected.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import ReadingGarden from '../components/reading-garden/ReadingGarden';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom ships neither of these. The garden repaints its sprite on resize and
  // schedules its own frames; both are irrelevant to a disclosure's keyboard
  // contract, so they are stubbed rather than guarded in product code.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ReadingGarden previewProgress={{ pagesRead: 12, lastEvolvedOn: null }} />);
  });
}

const trigger = (): HTMLButtonElement =>
  host.querySelector('.reading-garden-mushroom-hitbox') as HTMLButtonElement;
const panel = (): HTMLElement | null => host.querySelector('#reading-garden-info');

describe('Reading Garden dossier — keyboard', () => {
  it('opens from the keyboard and reports its state on the trigger', async () => {
    await mount();
    expect(trigger(), 'the mushroom is a real button').toBeTruthy();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(panel()).toBeNull();

    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    expect(panel(), 'the dossier opens').toBeTruthy();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe('reading-garden-info');
  });

  it('Escape closes it and focus comes back to the mushroom', async () => {
    await mount();
    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    expect(panel()).toBeTruthy();

    await act(async () => {
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(panel(), 'Escape closes the dossier').toBeNull();
    expect(document.activeElement, 'and focus returns to what opened it').toBe(trigger());
  });

  it('Escape works from inside the panel too, not only from the trigger', async () => {
    await mount();
    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    const close = host.querySelector('.reading-garden-info-close') as HTMLButtonElement;
    expect(close, 'the panel has a labelled close').toBeTruthy();
    await act(async () => {
      close.focus();
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('the close button also returns focus, rather than dropping it on the body', async () => {
    await mount();
    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    const close = host.querySelector('.reading-garden-info-close') as HTMLButtonElement;
    await act(async () => {
      close.focus();
      close.click();
    });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('the dossier is the garden\'s Liquid region, and the scene is not', async () => {
    // L12 b2. `city` became Liquid-presentable by giving its ONE disclosed
    // inspector the contextual role — not by making the painted world glass.
    // Mounted rather than grepped, because the claim is about which node carries
    // the role: a `ContextualSurface` that wrapped the scene, or that sat beside
    // the panel instead of on it, would read identically in source.
    await mount();
    await act(async () => {
      trigger().focus();
      trigger().click();
    });
    const dossier = panel()!;
    expect(dossier.classList.contains('lq-contextual')).toBe(true);
    expect(dossier.getAttribute('data-lq-role')).toBe('contextual');
    // The role survives `as="aside"` — the panel is still the labelled dialog
    // the disclosure points at, not a `div` the primitive defaulted to.
    expect(dossier.tagName).toBe('ASIDE');
    expect(dossier.getAttribute('role')).toBe('dialog');
    // NEGATIVE, and it is the half that matters: §2.3 keeps content on an
    // anchor, and this surface's content is a painted world. Nothing outside
    // the dossier may carry a Liquid-role class, or the toggle would put the
    // scene itself behind a material.
    const roled = [...host.querySelectorAll('[data-lq-role]')];
    expect(roled).toHaveLength(1);
    expect(roled[0]).toBe(dossier);
    expect(host.querySelector('.reading-garden')?.className).not.toMatch(/\blq-/);
  });

  it('Escape with the dossier already closed is not swallowed from the garden', async () => {
    await mount();
    let sawEscape = false;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') sawEscape = true;
    };
    window.addEventListener('keydown', onKey);
    await act(async () => {
      trigger().focus();
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    window.removeEventListener('keydown', onKey);
    // The shell owns Escape everywhere else; the garden may only claim it while
    // it has something of its own to close.
    expect(sawEscape, 'a closed dossier must not eat the shell key').toBe(true);
  });
});
