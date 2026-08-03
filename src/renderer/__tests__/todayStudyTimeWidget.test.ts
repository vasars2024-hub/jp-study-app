// @vitest-environment jsdom
/**
 * Phase 6 slice 8 — the Today's-study-time widget's two channels.
 *
 * A real `createRoot` render rather than `renderToStaticMarkup`: the widget's numbers come
 * from an effect-subscribed summary, so under SSR it would render its initial state and
 * every assertion here would pass vacuously (the trap recorded for
 * `videoCoreMiningPanelStructure.test.ts`).
 *
 * The two assertions worth the file are the ones whose wrong version is invisible: a
 * reading-only day that has silently lost its character line to a split it does not need,
 * and a segment rendered for a channel with no time — a colour in the bar that the legend
 * never explains.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statsKey } from '../stats';

const store = new Map<string, string>();
let host: HTMLDivElement | null = null;

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function seedToday(entry: { seconds?: number; chars?: number; watchSeconds?: number }): void {
  store.set(
    statsKey(),
    JSON.stringify({
      days: { [todayKey()]: { seconds: entry.seconds ?? 0, chars: entry.chars ?? 0, watchSeconds: entry.watchSeconds ?? 0 } },
      books: {},
      shows: {},
    }),
  );
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

/** Default is the registry default frame's content box: 220 × 160 minus the 30px bar. */
async function render(size = { w: 220, h: 130 }): Promise<HTMLDivElement> {
  const { TodayStudyTime } = await import('../widgets/study');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(TodayStudyTime, { settings: {}, setSettings: () => undefined, size }));
  });
  return host;
}

describe('TodayStudyTime', () => {
  it('leads with reading plus watching, which is what its label promises', async () => {
    seedToday({ seconds: 1800, chars: 4200, watchSeconds: 900 });
    const el = await render();
    // 30m read + 15m watched. Before slice 8 this widget read `todaySeconds` alone, so an
    // evening that was half spent in the media player showed as 30m.
    expect(el.querySelector('.wgt-stat-value')?.textContent).toBe('45m');
    expect(el.querySelectorAll('.wgt-split-seg')).toHaveLength(2);
    expect(el.textContent).toContain('30m read');
    expect(el.textContent).toContain('15m watched');
  });

  it('keeps the split honest by weighting each segment with its own seconds', async () => {
    seedToday({ seconds: 1800, watchSeconds: 900 });
    const el = await render();
    const segments = Array.from(el.querySelectorAll<HTMLElement>('.wgt-split-seg'));
    // `flex-grow` is the proportion; a fixed 50/50 bar would be decoration, not data.
    expect(segments.map((s) => s.style.flexGrow)).toEqual(['1800', '900']);
    expect(segments[1].classList.contains('watch')).toBe(true);
  });

  it('renders no segment for a channel with nothing in it', async () => {
    seedToday({ watchSeconds: 900 });
    const el = await render();
    const segments = el.querySelectorAll('.wgt-split-seg');
    expect(segments).toHaveLength(1);
    expect(segments[0].classList.contains('watch')).toBe(true);
    // …and the legend explains exactly the colours that are on screen.
    expect(el.querySelectorAll('.wgt-split-key')).toHaveLength(1);
  });

  it('leaves a reading-only day exactly as it looked before the split existed', async () => {
    seedToday({ seconds: 1800, chars: 4200 });
    const el = await render();
    expect(el.querySelector('.wgt-split')).toBeNull();
    // The character line is the thing the split displaces, so it must survive where
    // there is no second channel to show instead.
    expect(el.querySelector('.wgt-stat-sub')?.textContent).toContain('4,200');
    expect(el.querySelector('.wgt-stat-value')?.textContent).toBe('30m');
  });

  it('describes the split to a screen reader as one label, not two bare colours', async () => {
    seedToday({ seconds: 1800, watchSeconds: 900 });
    const el = await render();
    const bar = el.querySelector('.wgt-split');
    expect(bar?.getAttribute('role')).toBe('img');
    expect(bar?.getAttribute('aria-label')).toBe('30m reading, 15m watching');
  });

  it('drops to durations-only at the registry minimum, keeping the words in the tooltip', async () => {
    seedToday({ seconds: 1800, watchSeconds: 900 });
    // 160 × 130 frame minus WidgetFrame's 30px bar — the size at which the full layout
    // was measured to clip and the split bar was measured to collapse to 0px.
    const el = await render({ w: 160, h: 100 });
    const keys = Array.from(el.querySelectorAll('.wgt-split-key'));
    expect(keys.map((k) => k.textContent)).toEqual(['30m', '15m']);
    expect(keys.map((k) => k.getAttribute('title'))).toEqual(['30m read', '15m watched']);
    // The legend is what explains the headline once the label is gone, so the label goes
    // and the legend stays — never the other way round.
    expect(el.querySelector('.wgt-stat-label')).toBeNull();
    expect(el.querySelector('.wgt-split')).not.toBeNull();
  });

  it('keeps the full layout at the registry default size', async () => {
    seedToday({ seconds: 1800, watchSeconds: 900 });
    const el = await render({ w: 220, h: 130 });
    expect(el.querySelector('.wgt-stat-label')?.textContent).toBe('studied today');
    expect(
      Array.from(el.querySelectorAll('.wgt-split-key')).map((k) => k.textContent),
    ).toEqual(['30m read', '15m watched']);
  });

  it('never drops the label on a reading-only day, however small the frame', async () => {
    seedToday({ seconds: 1800, chars: 4200 });
    const el = await render({ w: 160, h: 100 });
    // Compact only trades away chrome the split needs room for; with no split there is
    // nothing to trade, and a bare number with no label is not a widget.
    expect(el.querySelector('.wgt-stat-label')?.textContent).toBe('studied today');
  });
});
