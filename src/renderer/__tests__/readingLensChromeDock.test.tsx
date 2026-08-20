// @vitest-environment jsdom
/**
 * The Reading Lens chrome dock, at the component boundary.
 *
 * `readingLensRegion.test.ts` decides which edge `auto` picks;
 * `readingLensRegionResize.test.tsx` proves the overlay re-picks it when the
 * read moves. This pins the part in between — that the resolved side actually
 * reaches the class the CSS keys off, that the control reports the stored
 * PREFERENCE rather than the resolved side (they differ exactly when `auto` is
 * doing its job, which is when a mislabelled control is most confusing), and
 * that its tooltip names where the bar currently is.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LensChrome } from '../components/lens/ReadingLensOverlay';
import { summarizeReadingLensConfidence } from '../../shared/readingLensConfidence';
import type { LensDockPreference } from '../../shared/readingLensRegion';

const CONFIDENCE = summarizeReadingLensConfidence([
  { text: '猫', box: [0, 0, 10, 10], vertical: false, confidence: 0.9 },
]);

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function renderChrome(props: {
  dock?: LensDockPreference;
  dockSide?: 'top' | 'bottom';
  onCycleDock?: () => void;
}): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <LensChrome
        t={(k: string, v?: Record<string, unknown>) =>
          v ? `${k}(${Object.values(v).join(',')})` : k
        }
        engine="auto"
        confidence={CONFIDENCE}
        mode="dictionary"
        onModeChange={() => undefined}
        onRescan={() => undefined}
        onNewRegion={() => undefined}
        onClose={() => undefined}
        onAskAgent={() => undefined}
        visualNovelSaveState="idle"
        onSaveToVisualNovel={() => undefined}
        {...props}
      />,
    );
  });
}

function chrome(): HTMLElement {
  const el = host.querySelector<HTMLElement>('.lens-chrome');
  if (!el) throw new Error('missing .lens-chrome');
  return el;
}

function dockButton(): HTMLButtonElement | null {
  return host.querySelector<HTMLButtonElement>('.lens-dock');
}

describe('Reading Lens chrome dock', () => {
  it('puts the resolved side on the bar, which is what the CSS positions from', async () => {
    await renderChrome({ dock: 'auto', dockSide: 'bottom', onCycleDock: () => undefined });
    expect(chrome().className).toContain('lens-chrome-bottom');
    expect(chrome().className).not.toContain('lens-chrome-top');

    await renderChrome({ dock: 'auto', dockSide: 'top', onCycleDock: () => undefined });
    expect(chrome().className).toContain('lens-chrome-top');
    expect(chrome().className).not.toContain('lens-chrome-bottom');
  });

  it('labels the control with the stored preference, not the side auto resolved to', async () => {
    // This is the pair that actually differ: the bar is at the top because the
    // read is at the bottom, and the control still says `auto` because that is
    // what another click would cycle away from.
    await renderChrome({ dock: 'auto', dockSide: 'top', onCycleDock: () => undefined });
    expect(dockButton()?.textContent).toBe('lens.dock.auto');
    expect(dockButton()?.className).toContain('lens-dock-auto');
    // …while the tooltip reports where the bar actually is.
    expect(dockButton()?.getAttribute('title')).toBe('lens.dock.hint(lens.dock.side.top)');
  });

  it('reports an explicit preference as itself', async () => {
    await renderChrome({ dock: 'top', dockSide: 'top', onCycleDock: () => undefined });
    expect(dockButton()?.textContent).toBe('lens.dock.top');
    await renderChrome({ dock: 'bottom', dockSide: 'bottom', onCycleDock: () => undefined });
    expect(dockButton()?.textContent).toBe('lens.dock.bottom');
  });

  it('cycles on click', async () => {
    const onCycleDock = vi.fn();
    await renderChrome({ dock: 'auto', dockSide: 'bottom', onCycleDock });
    await act(async () => {
      dockButton()?.click();
    });
    expect(onCycleDock).toHaveBeenCalledTimes(1);
  });

  it('renders no dock control at all when no host wired one, and still docks', async () => {
    // A dead control is worse than an absent one; the bar keeps its historical
    // bottom position rather than rendering a button that cannot move it.
    await renderChrome({});
    expect(dockButton()).toBeNull();
    expect(chrome().className).toContain('lens-chrome-bottom');
  });
});
