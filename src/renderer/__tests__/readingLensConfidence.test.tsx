// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LensChrome } from '../components/lens/ReadingLensOverlay';

describe('ReadingLens confidence chrome', () => {
  it('renders the computed level and exposes the review count', () => {
    const t = vi.fn((key: string) => key);
    const markup = renderToStaticMarkup(
      <LensChrome
        t={t}
        engine="web"
        confidence={{ confidence: 0.72, percent: 72, level: 'review', reviewLineCount: 2 }}
        mode="dictionary"
        onModeChange={() => undefined}
        onRescan={() => undefined}
        onNewRegion={() => undefined}
        onClose={() => undefined}
        onAskAgent={() => undefined}
        visualNovelSaveState="idle"
        onSaveToVisualNovel={() => undefined}
      />,
    );

    expect(markup).toContain('lens-confidence-badge lens-confidence-review');
    expect(t).toHaveBeenCalledWith('lens.confidence.review', { percent: 72 });
    expect(t).toHaveBeenCalledWith('lens.confidence.reviewLines', { count: 2 });
  });
});
