// @vitest-environment jsdom
/**
 * The two toast buses, and the one that had no viewport.
 *
 * `components/ui/Toast.tsx` exports `showToast` on the `ui:toast` bus and says
 * "mount <ToastViewport/> once". Nothing did — measured live on 2026-08-16 by
 * driving the MAL subtitle harvest through the real UI: clicking *Mine 1,352
 * words* added 30 cards to the deck and produced **zero** `.ui-toast-host`
 * nodes, so the only confirmation the flow gives a user never appeared. Both
 * `SubtitleHarvestPanel.mine` and `MalDownloadDialog.announce` call it.
 *
 * These assertions are the negative control made permanent: remove the
 * `<ToastViewport />` from `ToastHost` and the first case fails.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ToastHost, { showOsToast } from '../components/ToastHost';
import { showToast } from '../components/ui/Toast';

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    root = createRoot(host);
    root.render(<ToastHost />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('ToastHost mounts both toast buses', () => {
  it('shows a ui:toast — the bus that had no viewport anywhere', () => {
    expect(host.querySelector('.ui-toast-host')).toBeNull();
    act(() => showToast({ kind: 'success', title: 'ONE PIECE', message: 'Mined 30 words' }));
    const toast = host.querySelector('.ui-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('ONE PIECE');
    expect(toast?.textContent).toContain('Mined 30 words');
    expect(toast?.className).toContain('ui-toast--success');
  });

  it('still shows an os:toast, unchanged', () => {
    act(() => showOsToast('Saved'));
    expect(host.querySelector('.os-toast-host')?.textContent).toContain('Saved');
  });

  /**
   * The regression the fix could reintroduce: `ToastHost` used to
   * `return null` while its own list was empty. Rendering `ToastViewport`
   * inside that early return would unmount the `ui:toast` listener whenever no
   * `os:toast` happened to be on screen — which is almost always.
   */
  it('receives a ui:toast with no os:toast on screen', () => {
    expect(host.querySelector('.os-toast-host')).toBeNull();
    act(() => showToast('mined'));
    expect(host.querySelector('.ui-toast')?.textContent).toContain('mined');
  });

  it('lets the two buses coexist without either replacing the other', () => {
    act(() => {
      showOsToast('os side');
      showToast('ui side');
    });
    expect(host.querySelector('.os-toast-host')?.textContent).toContain('os side');
    expect(host.querySelector('.ui-toast-host')?.textContent).toContain('ui side');
  });
});
