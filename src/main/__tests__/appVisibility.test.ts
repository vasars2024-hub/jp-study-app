/**
 * Hide Gum / Show Gum: Show brings back what Hide took — the captions bar and
 * the desktop companions included — but not the surfaces that dismiss
 * themselves (wheel, notice, Lens, popup dictionary), and never steals focus.
 */
import { describe, expect, it } from 'vitest';
import type { BrowserWindow } from 'electron';
import { hideAllWindows, restoreHiddenWindows } from '../appVisibility';

class FakeWindow {
  visible = true;
  destroyed = false;
  shownInactive = 0;
  shown = 0;
  constructor(readonly url: string, visible = true) {
    this.visible = visible;
  }
  webContents = { getURL: (): string => this.url };
  isDestroyed(): boolean { return this.destroyed; }
  isVisible(): boolean { return this.visible; }
  hide(): void { this.visible = false; }
  show(): void { this.visible = true; this.shown += 1; }
  showInactive(): void { this.visible = true; this.shownInactive += 1; }
}

const as = (w: FakeWindow): BrowserWindow => w as unknown as BrowserWindow;

describe('Hide Gum / Show Gum', () => {
  it('shows again what Hide took, without focus, and leaves self-dismissing surfaces hidden', () => {
    const main = new FakeWindow('app://bundle/index.html');
    const bar = new FakeWindow('app://bundle/index.html?captionsOverlay=1');
    const pets = new FakeWindow('app://bundle/index.html?companionHost=1');
    const wheel = new FakeWindow('app://bundle/index.html?companion=wheel');
    const notice = new FakeWindow('app://bundle/index.html?companion=notice');
    const lens = new FakeWindow('app://bundle/index.html?readingLens=1');
    const capture = new FakeWindow('app://bundle/index.html?audioCapture=1', false);
    const all = [main, bar, pets, wheel, notice, lens, capture];

    hideAllWindows(all.map(as));
    expect(all.every((w) => !w.visible)).toBe(true);

    // The caller shows and focuses main itself.
    main.show();
    restoreHiddenWindows(as(main));
    expect(bar.visible).toBe(true);
    expect(pets.visible).toBe(true);
    expect(bar.shownInactive).toBe(1);
    expect(main.shownInactive).toBe(0);
    expect(wheel.visible).toBe(false);
    expect(notice.visible).toBe(false);
    expect(lens.visible).toBe(false);
    // A window that was hidden before (the hidden capture host) stays hidden.
    expect(capture.visible).toBe(false);
  });

  it('skips a window closed while Gum was hidden, and restores only once', () => {
    const main = new FakeWindow('app://bundle/index.html');
    const popout = new FakeWindow('app://bundle/index.html?popout=library');
    const bar = new FakeWindow('app://bundle/index.html?captionsOverlay=1');
    hideAllWindows([main, popout, bar].map(as));
    popout.destroyed = true;
    restoreHiddenWindows(as(main));
    expect(popout.shownInactive).toBe(0);
    expect(bar.shownInactive).toBe(1);
    bar.hide();
    restoreHiddenWindows(as(main));
    expect(bar.shownInactive).toBe(1);
  });
});
