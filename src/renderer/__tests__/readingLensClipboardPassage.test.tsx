// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import LensClipboardPassage from '../components/lens/LensClipboardPassage';
import { normalizeReadingLensCapture } from '../../shared/readingLens';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('Reading Lens clipboard passage', () => {
  it('renders localized source chrome and keeps Japanese words interactive', async () => {
    const capture = normalizeReadingLensCapture({ source: 'clipboard', text: '猫です。' }, 100);
    if (!capture) throw new Error('expected capture');
    const onWordClick = vi.fn();
    const onAskAgent = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <LensClipboardPassage
          capture={capture}
          tokens={[
            { surface: '猫', lemma: '猫' },
            { surface: 'です。', lemma: 'です' },
          ]}
          region={{ x: 20, y: 30, width: 480, height: 360 }}
          mode="dictionary"
          t={(key) => key}
          onModeChange={() => undefined}
          onWordClick={onWordClick}
          onAskAgent={onAskAgent}
          onNewRegion={() => undefined}
          onClose={() => undefined}
        />,
      );
    });

    expect(host.textContent).toContain('lens.badge.source.clipboard');
    expect(host.querySelector('section')?.getAttribute('style')).toContain('width: 480px');
    const word = host.querySelector<HTMLButtonElement>('.lens-clipboard-word');
    if (!word) throw new Error('missing Japanese word action');
    await act(async () => word.click());
    expect(onWordClick).toHaveBeenCalledWith(expect.anything(), '猫');

    const ask = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'lens.action.askAgent',
    );
    await act(async () => ask?.click());
    expect(onAskAgent).toHaveBeenCalledOnce();
  });

  it('shows a retryable localized lookup action only when a receiver exists', async () => {
    const capture = normalizeReadingLensCapture({ source: 'clipboard', text: '猫' }, 100);
    if (!capture) throw new Error('expected capture');
    const onLookUp = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <LensClipboardPassage
          capture={capture}
          tokens={[{ surface: '猫', lemma: '猫' }]}
          region={{ x: 0, y: 0, width: 320, height: 240 }}
          mode="dictionary"
          t={(key) => key}
          onModeChange={() => undefined}
          onWordClick={() => undefined}
          onAskAgent={() => undefined}
          lookUpState="error"
          onLookUp={onLookUp}
          onNewRegion={() => undefined}
          onClose={() => undefined}
        />,
      );
    });

    const lookup = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'lens.action.lookUpFailed',
    );
    expect(lookup?.classList.contains('lens-lookup-error')).toBe(true);
    await act(async () => lookup?.click());
    expect(onLookUp).toHaveBeenCalledOnce();
  });
});
