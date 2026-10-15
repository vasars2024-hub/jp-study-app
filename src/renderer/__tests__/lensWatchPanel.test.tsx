// @vitest-environment jsdom
/**
 * Reading Lens watch region: the panel that shows each new read beside the
 * watched region — never over it, since main samples those pixels.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import LensWatchPanel, { watchPanelPlacement } from '../components/lens/LensWatchPanel';
import type { JpToken } from '../tokenizer';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

const tok = (surface: string): JpToken => ({ surface, lemma: surface } as JpToken);
const VIEW = { width: 1920, height: 1080 };

describe('watchPanelPlacement', () => {
  it('goes under the region when there is room', () => {
    const at = watchPanelPlacement({ x: 120, y: 200, width: 1680, height: 360 }, VIEW);
    expect(at.top).toBe(570);
    expect(at.bottom).toBeUndefined();
    expect(at.top! >= 200 + 360).toBe(true);
  });

  it('goes over the region when it sits at the bottom of the screen', () => {
    const at = watchPanelPlacement({ x: 120, y: 820, width: 1680, height: 220 }, VIEW);
    expect(at.top).toBeUndefined();
    // Anchored from the bottom, ending above the region's top edge.
    expect(VIEW.height - at.bottom!).toBeLessThanOrEqual(820);
  });

  it('stays on screen horizontally', () => {
    const at = watchPanelPlacement({ x: 1800, y: 100, width: 100, height: 60 }, VIEW);
    expect(at.left + at.width).toBeLessThanOrEqual(VIEW.width);
    expect(at.left).toBeGreaterThanOrEqual(8);
  });
});

describe('LensWatchPanel', () => {
  async function render(props: Partial<Parameters<typeof LensWatchPanel>[0]> = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const onWordClick = vi.fn();
    const onStop = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <LensWatchPanel
          t={(key) => key}
          region={{ x: 120, y: 200, width: 1680, height: 360 }}
          viewport={VIEW}
          lines={[{ text: '猫が寝た。', tokens: [tok('猫'), tok('が'), tok('寝た'), tok('。')] }]}
          status="ready"
          onWordClick={onWordClick}
          onStop={onStop}
          onClose={onClose}
          {...props}
        />,
      );
    });
    return { host, onWordClick, onStop, onClose };
  }

  it('shows the latest read with clickable words, and a frame outside the region', async () => {
    const { host, onWordClick } = await render();
    const frame = host.querySelector<HTMLElement>('.lens-watch-frame')!;
    expect(frame.style.left).toBe('116px');
    expect(frame.style.width).toBe('1688px');
    const words = [...host.querySelectorAll<HTMLElement>('.lens-watch-text .lens-word')].map((w) => w.textContent);
    expect(words).toEqual(['猫', 'が', '寝た']);
    await act(async () => host.querySelector<HTMLElement>('.lens-word')!.click());
    expect(onWordClick).toHaveBeenCalledWith(expect.anything(), '猫', '猫が寝た。', expect.any(Array));
    // The panel is the interactive part; the frame never takes the mouse.
    expect(host.querySelector('.lens-watch-panel')!.classList.contains('lens-interactive')).toBe(true);
    expect(frame.classList.contains('lens-interactive')).toBe(false);
  });

  it('says when a new read is running, and when the region is empty', async () => {
    const reading = await render({ status: 'reading' });
    expect(reading.host.querySelector('.lens-watch-status')!.textContent).toBe('lensOcr.watch.reading');
    await act(async () => root?.unmount());
    root = null;
    const empty = await render({ status: 'empty', lines: [] });
    expect(empty.host.querySelector('.lens-watch-status')!.textContent).toBe('lensOcr.watch.empty');
    expect(empty.host.querySelector('.lens-watch-hint')!.textContent).toBe('lensOcr.watch.waiting');
  });

  it('shows a failed read', async () => {
    const { host } = await render({ status: 'error', message: 'Could not capture the screen.' });
    expect(host.querySelector('.lens-watch-error')!.textContent).toBe('Could not capture the screen.');
  });

  it('stops watching and closes from its own buttons', async () => {
    const { host, onStop, onClose } = await render();
    await act(async () => host.querySelector<HTMLButtonElement>('.lens-watch-stop')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.lens-watch-close')!.click());
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
