// @vitest-environment jsdom
//
// A settings card reached from search or the command palette must actually
// arrive on screen. `SettingsCard` asked for `scrollIntoView({behavior:'smooth'})`
// and stopped there — and measured live on 2026-08-31 in this Electron renderer
// (OS reduced-motion OFF), smooth scrolling is refused outright: the settings
// pane moved 0 px on the smooth call and 7,233 px on the identical `auto` call,
// and a freshly built plain scroller in the same document ignored smooth too.
// The card sat ~7,400 px below the fold for the whole 2.2 s its highlight
// lasts, which looks exactly like search having dumped you at the top.
//
// These cases pin the recovery: when the scroller does not move, land it; when
// it does, leave the animation alone.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCard from '../components/settings/SettingsCard';
import { SettingsProvider } from '../components/settings/SettingsContext';
import type { SettingsController } from '../components/settings/types';

let host: HTMLDivElement;
let root: Root;
let calls: (ScrollIntoViewOptions | boolean | undefined)[];

/** A real scrollable ancestor, so `nearestScroller` has something to find. */
function mount(focusSettingId: string | null, onScrollIntoView: () => void): Promise<void> {
  const ctrl = { advancedMode: true, focusSettingId } as unknown as SettingsController;
  return act(async () => {
    root.render(
      <SettingsProvider value={ctrl}>
        <SettingsCard id="subtitle-providers" title="Subtitle providers">
          <p>body</p>
        </SettingsCard>
      </SettingsProvider>,
    );
    onScrollIntoView();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  host = document.createElement('div');
  // jsdom reports 0 for every layout box, so the scroller is faked explicitly:
  // overflowY comes from the inline style, the two heights from own properties.
  host.style.overflowY = 'auto';
  Object.defineProperty(host, 'scrollHeight', { value: 9000, configurable: true });
  Object.defineProperty(host, 'clientHeight', { value: 500, configurable: true });
  host.scrollTop = 0;
  document.body.append(host);
  root = createRoot(host);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value(opts?: ScrollIntoViewOptions | boolean) {
      calls.push(opts);
    },
    configurable: true,
    writable: true,
  });
  // Every rect is offscreen: jsdom's default is an all-zero box, which the
  // guard would read as "top 0, in view" and never fire.
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    value: () => ({ top: 7400, bottom: 8000, left: 0, right: 100, width: 100, height: 600 }),
    configurable: true,
    writable: true,
  });
  vi.useFakeTimers();
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  host.remove();
});

describe('SettingsCard lands the highlighted card', () => {
  it('scrolls outright when the smooth request moved nothing', async () => {
    await mount('subtitle-providers', () => undefined);
    expect(calls).toEqual([{ behavior: 'smooth', block: 'nearest' }]);

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    // Second call, with no `behavior` — the instant landing.
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ block: 'nearest' });
  });

  it('NEGATIVE CONTROL: leaves a working smooth scroll alone', async () => {
    await mount('subtitle-providers', () => undefined);
    expect(calls).toHaveLength(1);

    // The scroller moved, which is what a live smooth animation looks like at
    // the 300 ms check. Without this half the assertion above would also pass
    // on a card that scrolls twice unconditionally.
    host.scrollTop = 1200;
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(calls).toHaveLength(1);
  });

  it('does not scroll a card that is not the focused one', async () => {
    await mount('some-other-card', () => undefined);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(calls).toEqual([]);
  });
});
