// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReadingSiteDetail } from '../components/reading/ReadingFinderContent';
import type { ReadingSite } from '../data/readingSites';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const site: ReadingSite = {
  id: 'aozora',
  name: '青空文庫',
  url: 'https://example.invalid/aozora',
  levels: [3, 4, 5],
  genres: ['literature'],
  furigana: true,
  lengthKinds: ['short'],
  lang: 'ja',
  pricing: 'Free',
  notes: 'Public-domain Japanese literature.',
  lastVerified: '2026-01-01',
};

async function mount(onClose = vi.fn()): Promise<{ host: HTMLElement; onClose: ReturnType<typeof vi.fn> }> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<ReadingSiteDetail site={site} onClose={onClose} onOpenBook={vi.fn()} />);
  });
  return { host, onClose };
}

const drawer = (): HTMLElement => {
  const el = document.querySelector<HTMLElement>('[role="dialog"].rf-drawer');
  if (!el) throw new Error('no drawer rendered');
  return el;
};

describe('reading site detail drawer', () => {
  it('is a dialog labelled by the site it is showing, not by a fixed string', async () => {
    await mount();
    const labelledBy = drawer().getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('青空文庫');
  });

  it('leaves the grid it was opened from uncovered', async () => {
    await mount();
    // The centred modal this replaced blacked out the catalogue behind it; the
    // drawer is docked and its scrim is a dismiss target, not a cover.
    expect(document.querySelector('.nov-modal-backdrop')).toBeNull();
    expect(document.querySelector('.rf-drawer-scrim')).not.toBeNull();
  });

  it('closes on Escape, and on the scrim, but not on another key', async () => {
    const { onClose } = await mount();
    await act(async () => {
      drawer().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      drawer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.querySelector<HTMLElement>('.rf-drawer-scrim')?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('takes focus on open and hands it back to the card that opened it', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    await mount();
    expect(document.activeElement).toBe(drawer());

    await act(async () => root?.unmount());
    root = null;
    expect(document.activeElement).toBe(opener);
  });
  /**
   * Boss-audit follow-up, 2026-09-08 (register row D390). The drawer already
   * took focus and already closed on Escape, and BOTH of those passed while the
   * two halves that make a scrim honest were missing.
   *
   * `.rf-drawer-layer` is `position: fixed; inset: 0` and `.rf-drawer-scrim`
   * paints `rgb(0 0 0 / 0.28)` across the whole viewport and swallows clicks. So
   * the catalogue behind is already unusable to a sighted user, and the drawer
   * owed a screen reader the same statement plus a keyboard that cannot walk out
   * into it.
   */
  it('declares the modality its scrim already enforces', async () => {
    await mount();
    expect(drawer().getAttribute('aria-modal')).toBe('true');
  });

  it('keeps Tab inside the drawer, so focus never lands behind the scrim', async () => {
    await mount();
    const focusables = [
      ...drawer().querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ];
    expect(focusables.length).toBeGreaterThan(1);

    // Standing on the last control, a plain Tab would leave the dialog.
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(focusables[0]);

    // And Shift+Tab off the first wraps to the last rather than to the taskbar.
    focusables[0].focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(last);
  });

  it('closes on Escape from OUTSIDE the drawer, not only from within it', async () => {
    const { onClose } = await mount();
    // Escape used to live on the panel's own onKeyDown, so it stopped working
    // the moment focus was anywhere else - which, with no trap, was one Tab away.
    const stray = document.createElement('button');
    document.body.append(stray);
    stray.focus();

    await act(async () => {
      stray.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
