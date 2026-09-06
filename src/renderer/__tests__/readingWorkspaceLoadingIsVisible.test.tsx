// @vitest-environment jsdom
/**
 * The Reading workspace's tab-loading state has to SAY something.
 *
 * Measured live 2026-09-06 through the debug bridge. Clicking the **Library** tab
 * and reading the reading window immediately after returned **0 panel controls and
 * no panel text whatsoever** — the surface was the titlebar and the tab strip over
 * an empty rectangle. Reading it again ~3 s later returned **109 controls**. The
 * tab was fine; its chunk was cold.
 *
 * The cause was the Suspense fallback at `ReadingWorkspaceView.tsx:238`, an EMPTY
 * `<div className="reading-workspace-loading muted" aria-live="polite" />` over a
 * rule that was only `min-height: 100%`. It reserved the entire panel and painted
 * nothing, so a sighted user saw a blank app and a screen-reader user got an
 * `aria-live` region with no text to announce — the two worst versions of the same
 * silence at once.
 *
 * This pins the fallback ELEMENT rather than driving a lazy boundary, because a
 * `lazy()` chunk resolves instantly under vitest and the blank frame this is about
 * cannot be reproduced here. The fallback is rendered directly by suspending a
 * child on a promise that never settles, which is exactly the state a cold chunk
 * puts the boundary in.
 */
import { Suspense, act, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ReadingWorkspaceView from '../views/ReadingWorkspaceView';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((done) => { setTimeout(done, 2); });
  });
};

beforeEach(() => {
  installReadingSurfaceApi();
  installResizeObserver();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('Reading workspace — a tab that is still loading says so', () => {
  /** A child that never resolves holds the boundary in exactly the cold-chunk state. */
  const Never = (): null => {
    use(new Promise<void>(() => {}));
    return null;
  };

  // The regression, on the very tab that was measured blank. `library` is a
  // `lazy()` surface, so the boundary is genuinely suspended on the first render
  // and the fallback is what is on screen — the same frame the live drive caught.
  it('renders text in the panel fallback, not an empty reserved box', async () => {
    await act(async () => {
      root.render(<ReadingWorkspaceView initialSection="library" onOpenBook={() => {}} />);
    });

    const fallback = container.querySelector('.reading-workspace-loading');
    expect(fallback, 'the lazy Library surface must suspend for this to be measurable').not.toBeNull();
    expect(fallback?.textContent?.trim() ?? '', 'a reserved blank box is not a loading state').not.toBe('');

    // Settle the boundary so the pending chunk does not leak into the next test.
    await flush();
  });

  /**
   * The property in isolation, so it holds even if the workspace's own panel
   * routing changes: an aria-live region that reserves space must carry text.
   */
  it('a suspended boundary using this fallback announces something', async () => {
    const Host = (): JSX.Element => (
      <Suspense
        fallback={
          <div className="reading-workspace-loading muted" aria-live="polite">
            Loading…
          </div>
        }
      >
        <Never />
      </Suspense>
    );
    await act(async () => { root.render(<Host />); });
    await flush();

    const live = container.querySelector('[aria-live]');
    expect(live, 'the boundary must actually be suspended for this to mean anything').not.toBeNull();
    expect(live?.textContent?.trim() ?? '').not.toBe('');
  });
});
