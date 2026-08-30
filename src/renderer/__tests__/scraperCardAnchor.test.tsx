// @vitest-environment jsdom
/**
 * L8 — a Scraper search result must land ON its card, not merely on its page.
 *
 * ScrCard used to set `data-scr-card` and nothing else, so `navigate('profiles',
 * 'profile-history')` switched pages and highlighted 0 of 11 cards. The search
 * index read as complete while every hit dumped the user at the top of a long
 * page. probes/l8-searchability.cjs credited it anyway, because it assumed the
 * SettingsCard contract held here; both the primitive and the probe are fixed,
 * and this file is what keeps the primitive half fixed.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScrCard from '../components/scraper/ScrCard';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import type { ScraperController } from '../components/scraper/types';

let host: HTMLDivElement;
let root: Root | null = null;

/**
 * ScrCard reads exactly one field off the controller. A full fixture would pin
 * this file to every unrelated addition to ScraperController, so the cast is
 * deliberate and the narrowness is the point.
 */
const focusedOn = (id: string | null) =>
  ({ focusSettingId: id }) as unknown as ScraperController;

function render(focus: string | null, cardId?: string) {
  act(() => {
    root = createRoot(host);
    root.render(
      createElement(
        ScraperProvider,
        { value: focusedOn(focus) },
        createElement(ScrCard, { id: cardId, title: 'Revision history' }, 'body'),
      ),
    );
  });
  return host.querySelector('.scr-card') as HTMLElement;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  // jsdom has no layout, so it ships no scrollIntoView at all. Configurable, or
  // the test that swaps in its own spy cannot.
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('ScrCard anchoring', () => {
  it('highlights the card the shell is focusing', () => {
    const card = render('profile-history', 'profile-history');
    expect(card.className).toContain('is-highlight');
    expect(card.getAttribute('data-scr-card')).toBe('profile-history');
  });

  it('leaves every other card alone', () => {
    // The control: the same card, the same shell, a focus id belonging to a
    // sibling. Without this a primitive that highlighted unconditionally would
    // pass the test above.
    const card = render('profile-presets', 'profile-history');
    expect(card.className).not.toContain('is-highlight');
  });

  it('does not highlight an id-less card', () => {
    expect(render('profile-history', undefined).className).not.toContain('is-highlight');
  });

  it('scrolls the focused card into view', () => {
    // jsdom's own scrollIntoView is non-configurable, so it is assigned over and
    // put back rather than redefined.
    const original = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render('qbit-connection', 'qbit-connection');
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' });
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('renders outside the shell instead of throwing', () => {
    // ScrCard is presentational; a harness or test that mounts a page without
    // ScraperProvider must still get a card, just never a highlighted one.
    act(() => {
      root = createRoot(host);
      root.render(createElement(ScrCard, { id: 'runtime', title: 'Runtime' }, 'body'));
    });
    const card = host.querySelector('.scr-card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.className).not.toContain('is-highlight');
  });
});
