// @vitest-environment jsdom
/**
 * The lens → Reading workspace passage lane, from the consumer's end.
 *
 * Two properties are load-bearing and neither is implied by the other, so both
 * are asserted here rather than in one happy-path test:
 *
 * - **The cold open.** The lens stages, `popOut('reading')` creates the window,
 *   and the claim has to happen on mount — with the tab switching to Captures,
 *   because arriving at Discover with the passage loaded one tab over is
 *   indistinguishable from the gesture having failed.
 * - **Every passage after the first.** `popOut` focuses the existing window, so
 *   a mount-only claim would silently drop the second capture of a session. The
 *   announcement is what fixes it, and the negative control is the same mount
 *   with nothing staged: it must stay on Discover rather than opening an empty
 *   reader.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PARAGRAPH = [
  '彼は図書館で本を読んでいた。',
  '窓の外では雨が降り続いていて、誰も帰ろうとしなかった。',
  '司書は静かに棚のあいだを歩き、時々こちらを見た。',
].join('');

interface StagedPassage {
  route: { version: 1; section: 'captures'; intent: 'browse' };
  text: string;
  kind: 'paragraph';
  lines: string[];
  source: 'screen';
  sourceLabel: string;
  captureId: string;
  language: string;
  stagedAt: number;
}

function passage(captureId: string, sourceLabel: string, lines: string[]): StagedPassage {
  return {
    route: { version: 1, section: 'captures', intent: 'browse' },
    text: PARAGRAPH,
    kind: 'paragraph',
    lines,
    source: 'screen',
    sourceLabel,
    captureId,
    language: 'ja',
    stagedAt: 1_700_000_000_000,
  };
}

const slot: { staged: StagedPassage | null; listeners: Array<() => void> } = {
  staged: null,
  listeners: [],
};

function installApiStub(): void {
  const api: Record<string, unknown> = {
    readingPassageHandoffTake: async () => {
      const claimed = slot.staged;
      slot.staged = null;
      return { ok: true, handoff: claimed };
    },
    onReadingPassageHandoffStaged: (cb: () => void) => {
      slot.listeners.push(cb);
      return () => {
        slot.listeners = slot.listeners.filter((listener) => listener !== cb);
      };
    },
    lensHistoryList: async () => [],
    listLibrary: async () => [],
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): void => undefined;
      return async (): Promise<unknown> => [];
    },
  });
}

let View: typeof import('../views/ReadingWorkspaceView').default;
let container: HTMLDivElement;
let root: Root;

/**
 * Lets the lazy chunk, the claim promise and the history read all settle.
 *
 * A fixed number of microtask flushes is not enough and produced a false
 * failure here: `ReadingCapturesView` is behind `lazy()`, so the first mount of
 * a module registry has to load a chunk before any of its DOM exists. Poll for
 * the condition instead, and let the assertion — not the loop — decide.
 */
async function settle(until: () => boolean = () => false): Promise<void> {
  for (let index = 0; index < 60; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    if (until()) return;
  }
}

beforeEach(async () => {
  vi.resetModules();
  slot.staged = null;
  slot.listeners = [];
  installApiStub();
  View = (await import('../views/ReadingWorkspaceView')).default;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function section(): string | null {
  return container.querySelector('.reading-workspace')?.getAttribute('data-reading-section') ?? null;
}

describe('Reading workspace passage claim', () => {
  it('stays on the opening section when nothing is staged', async () => {
    await act(async () => {
      root.render(<View initialSection="discover" onOpenBook={() => undefined} />);
    });
    await settle(() => section() === 'captures');
    expect(section()).toBe('discover');
    expect(container.querySelector('.reading-captures')).toBeNull();
  });

  it('claims on mount, switches to Captures and renders the passage lines', async () => {
    slot.staged = passage('cap-1', 'Notepad', ['彼は図書館で', '本を読んでいた。']);
    await act(async () => {
      root.render(<View initialSection="discover" onOpenBook={() => undefined} />);
    });
    await settle(() => container.querySelectorAll('.reading-captures-passage p').length > 0);

    expect(section()).toBe('captures');
    const lines = [...container.querySelectorAll('.reading-captures-passage p')]
      .map((node) => node.textContent);
    expect(lines).toEqual(['彼は図書館で', '本を読んでいた。']);
    expect(container.textContent).toContain('Notepad');
  });

  it('claims again on the announcement, so the second passage is not dropped', async () => {
    slot.staged = passage('cap-1', 'Notepad', ['一行目']);
    await act(async () => {
      root.render(<View initialSection="discover" onOpenBook={() => undefined} />);
    });
    await settle(() => container.querySelectorAll('.reading-captures-passage p').length > 0);
    expect(section()).toBe('captures');

    // Navigate away, exactly as a user reading something else would.
    const discoverTab = container.querySelector<HTMLButtonElement>('#reading-workspace-tab-discover');
    await act(async () => {
      discoverTab?.click();
    });
    expect(section()).toBe('discover');

    slot.staged = passage('cap-2', 'Firefox', ['二行目']);
    expect(slot.listeners.length).toBeGreaterThan(0);
    await act(async () => {
      for (const listener of slot.listeners) listener();
    });
    await settle(() => container.textContent?.includes('二行目') === true);

    expect(section()).toBe('captures');
    const lines = [...container.querySelectorAll('.reading-captures-passage p')]
      .map((node) => node.textContent);
    expect(lines).toEqual(['二行目']);
    expect(container.textContent).toContain('Firefox');
  });
});
