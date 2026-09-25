// @vitest-environment jsdom
/**
 * Round-2 shell keyboard and focus (K6, K7, K12) and the two shell journeys (J11, widgets):
 *
 * - K6: the Start panel is a labelled dialog that takes focus on open, moves with the arrow
 *   keys as one tab stop, closes on Escape and hands focus back to the Start button; the
 *   per-tile pin is not a second tab stop.
 * - K7: a closing surface hands focus back to its opener, unless the user already moved it.
 * - K12: the apps with no heading get a screen-reader-only one.
 * - Widgets ▸ Reset layout asks first and can be undone.
 * - J11: the empty desktop after the tour offers three first actions.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import StartPanel from '../components/shell/StartPanel';
import { startKeyTarget } from '../components/shell/startPanelNav';
import { restoreFocus } from '../components/shell/focusReturn';
import { resetWidgetLayoutWithUndo } from '../components/shell/widgetLayoutReset';
import SectionHeading from '../components/shell/SectionHeading';
import StartHereCard from '../components/shell/StartHereCard';
import { markTourComplete } from '../onboardingStore';
import type { WidgetSnapshot } from '../../shared/desktop';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" id="start-btn" onClick={() => setOpen((o) => !o)}>Start</button>
      {open && (
        <StartPanel
          id="panel"
          className="os-start"
          label="Start"
          onClose={() => setOpen(false)}
          returnFocusTo={() => document.getElementById('start-btn')}
        >
          <button type="button">Watch</button>
          <button type="button" tabIndex={-1} data-start-secondary>Pin</button>
          <button type="button">Music</button>
          <button type="button">Dictionary</button>
        </StartPanel>
      )}
    </>
  );
}

describe('the Start panel (K6)', () => {
  it('is a labelled dialog that focuses its first item and roves with the arrows', async () => {
    const host = await render(<Harness />);
    const panel = host.querySelector('#panel') as HTMLElement;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Start');
    const [watch, pin, music, dict] = Array.from(panel.querySelectorAll('button'));
    expect(document.activeElement).toBe(watch);
    expect([watch?.tabIndex, music?.tabIndex, dict?.tabIndex]).toEqual([0, -1, -1]);
    await act(async () => {
      watch?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    // The pin is skipped: it is reached through the tile's context menu.
    expect(document.activeElement).toBe(music);
    expect(pin?.tabIndex).toBe(-1);
    await act(async () => {
      music?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(dict);
  });

  it('Escape closes it and puts focus back on the Start button', async () => {
    const host = await render(<Harness />);
    const first = host.querySelector('#panel button') as HTMLElement;
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('#panel')).toBeNull();
    expect(document.activeElement?.id).toBe('start-btn');
  });

  it('wraps at both ends, and ignores keys that are not movement', () => {
    expect(startKeyTarget('ArrowRight', 3, 4)).toBe(0);
    expect(startKeyTarget('ArrowUp', 0, 4)).toBe(3);
    expect(startKeyTarget('Home', 2, 4)).toBe(0);
    expect(startKeyTarget('Enter', 1, 4)).toBeNull();
  });
});

describe('focus hand-back (K7)', () => {
  it('returns focus to the opener only while the closing surface still owns it', () => {
    const opener = document.createElement('button');
    const surface = document.createElement('div');
    const inside = document.createElement('button');
    const elsewhere = document.createElement('button');
    surface.append(inside);
    document.body.append(opener, surface, elsewhere);
    inside.focus();
    expect(restoreFocus(opener, { container: surface })).toBe(opener);
    elsewhere.focus();
    expect(restoreFocus(opener, { container: surface })).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
  });

  it('falls back when the opener is gone', () => {
    const fallback = document.createElement('button');
    document.body.append(fallback);
    const gone = document.createElement('button');
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(restoreFocus(gone, { fallbacks: [() => fallback] })).toBe(fallback);
  });
});

describe('Reset widget layout', () => {
  const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
  const widgets = [{ id: 'w1' }, { id: 'w2' }] as unknown as WidgetSnapshot[];

  it('asks first, and changes nothing when the answer is no', async () => {
    const apply = vi.fn();
    const ok = await resetWidgetLayoutWithUndo({ current: widgets, confirm: async () => false, apply, toast: vi.fn(), t });
    expect(ok).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });

  it('resets, then Undo brings every widget back around anything added since', async () => {
    let list: WidgetSnapshot[] = [...widgets];
    const apply = (update: (prev: WidgetSnapshot[]) => WidgetSnapshot[]) => {
      list = update(list);
    };
    let undo: (() => void) | undefined;
    const toast = vi.fn((_m: string, _k?: string, action?: { run: () => void }) => {
      if (action) undo = action.run;
    });
    await resetWidgetLayoutWithUndo({ current: widgets, confirm: async () => true, apply, toast, t });
    expect(list).toEqual([]);
    list = [{ id: 'w3' } as unknown as WidgetSnapshot];
    undo?.();
    expect(list.map((w) => w.id)).toEqual(['w1', 'w2', 'w3']);
  });
});

describe('headings and first steps', () => {
  it('K12: an app with no heading gets a screen-reader-only one; others get none', async () => {
    const host = await render(
      <>
        <SectionHeading section="youtube" />
        <SectionHeading section="flashcards" />
      </>,
    );
    const headings = host.querySelectorAll('h2.sr-only');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.textContent).toBe('YouTube');
  });

  it('J11: after the tour, an empty desktop offers three first actions, and Dismiss sticks', async () => {
    markTourComplete();
    const onOpen = vi.fn();
    const host = await render(<StartHereCard desktopEmpty onOpen={onOpen} />);
    const actions = host.querySelectorAll('.os-start-here-action');
    expect(actions).toHaveLength(3);
    await act(async () => {
      (actions[0] as HTMLButtonElement).click();
    });
    expect(onOpen).toHaveBeenCalledWith('player');
    await act(async () => {
      (host.querySelector('.os-start-here-dismiss') as HTMLButtonElement).click();
    });
    expect(host.querySelector('.os-start-here')).toBeNull();
  });
});
