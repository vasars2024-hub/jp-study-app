// @vitest-environment jsdom
/**
 * The radial wheel over other apps: it shows the slots main sent, keys 1–8 run
 * them, Esc and a click away close it.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildWheelActions, type CompanionWheelInit } from '../../shared/companion';

const calls: { run: string[]; close: number } = { run: [], close: 0 };
let init: CompanionWheelInit | null = null;
let push: ((next: CompanionWheelInit | null) => void) | null = null;

function installApiStub(): void {
  const api: Record<string, unknown> = {
    companionGetWheel: async () => init,
    onCompanionWheel: (cb: (next: CompanionWheelInit | null) => void) => {
      push = cb;
      return () => {
        push = null;
      };
    },
    companionWheelRun: async (id: string) => {
      calls.run.push(id);
      return true;
    },
    companionWheelClose: async () => {
      calls.close += 1;
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      return async (): Promise<unknown> => ({});
    },
  });
}

let Wheel: typeof import('../components/companion/CompanionWheel').default;
let root: Root | null = null;
let host: HTMLDivElement;

function wheelInit(audio: string | null): CompanionWheelInit {
  return {
    actions: buildWheelActions({ audioCommandId: audio }).map((a) => ({
      ...a,
      chord: a.id === 'lookup' ? 'Ctrl+Alt+J' : '',
    })),
    sourceTitle: 'Some game',
  };
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Wheel = (await import('../components/companion/CompanionWheel')).default;
});

beforeEach(async () => {
  calls.run.length = 0;
  calls.close = 0;
  init = wheelInit(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Wheel />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const slots = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('[data-wheel-action]')];

function key(k: string, code = ''): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
  });
}

describe('CompanionWheel', () => {
  it('shows one slot per action, numbered clockwise from the top', () => {
    expect(slots().map((b) => b.dataset.wheelAction)).toEqual([
      'lookup', 'cursor', 'lens', 'preview', 'sentence', 'translate', 'open',
    ]);
    expect(slots()[0]!.getAttribute('aria-keyshortcuts')).toBe('1');
    // The first slot sits at 12 o'clock, above the centre.
    expect(parseInt(slots()[0]!.style.top, 10)).toBeLessThan(parseInt(slots()[3]!.style.top, 10));
  });

  it('grows the audio slot when live captions registered its command', async () => {
    await act(async () => push?.(wheelInit('captions.mineRecent')));
    expect(slots()).toHaveLength(8);
    expect(slots()[6]!.dataset.wheelAction).toBe('audio');
  });

  it('keys 1–8 run the slot with that number', () => {
    key('3', 'Digit3');
    expect(calls.run).toEqual(['lens']);
  });

  it('names the highlighted action and its chord in the hub', () => {
    expect(host.querySelector('.companion-wheel-hub')?.textContent).toContain('Look up selection');
    expect(host.querySelector('.companion-wheel-hub')?.textContent).toContain('Ctrl+Alt+J');
    key('ArrowRight');
    expect(host.querySelector('.companion-wheel-hub')?.textContent).toContain('Word under cursor');
    key('Enter');
    expect(calls.run).toEqual(['cursor']);
  });

  it('a click runs that slot', () => {
    act(() => slots()[3]!.click());
    expect(calls.run).toEqual(['preview']);
  });

  it('Esc closes, and so does a click away from the ring', () => {
    key('Escape');
    expect(calls.close).toBe(1);
    const rootEl = host.querySelector('.companion-wheel-root')!;
    act(() => {
      rootEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(calls.close).toBe(2);
    // A press inside the disc is not "away".
    act(() => {
      host.querySelector('.companion-wheel')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(calls.close).toBe(2);
  });
});
