// @vitest-environment jsdom
/**
 * D346 — pressing "Clean up" used to look like nothing happened.
 *
 * Measured live 2026-09-08 (window 2, pid 4652, Files at 820x580): the sheet
 * mounts as a `position: static` section appended to `.fwin-body`. Its top
 * landed at exactly the window's bottom edge — 580 px into a 580 px window —
 * the body scroller grew to 12,995 px against a 545 px viewport, `scrollTop`
 * stayed **0**, and **0 pixels of the sheet were on screen**. The user pressed
 * the app's only maintenance button and saw nothing at all.
 *
 * jsdom has no layout, so this cannot assert pixels. It asserts the two things
 * that CAUSE the pixels: the panel asks to be brought into view, and it takes
 * the keyboard — which is also the half a mouse-less user needs.
 *
 * The role assertion is the other half and it is deliberately negative. The
 * sheet used to claim `role="dialog"`, and the obvious "fix" is to add
 * `aria-modal` and a focus trap. That would be WRONG here: the file list above
 * stays live and 113 controls behind it stay legitimately tabbable, so
 * claiming modality would tell a screen reader the rest of the window is
 * hidden when it is not — which is register row D9's failure, committed rather
 * than fixed. The scan sheet next door is a real overlay and keeps its trap.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CleanupSheet } from '../components/filesapp/CleanupSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let scrolled: Element[] = [];

beforeEach(() => {
  localStorage.clear();
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element): void {
    scrolled.push(this);
  };
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    // The dry run is not what this file is about; an absent bridge makes the
    // sheet render its own "could not look" state, which still mounts the
    // panel — the thing under test.
    value: {},
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

async function mountSheet(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<CleanupSheet onClose={() => undefined} onChanged={() => undefined} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  const panel = host.querySelector<HTMLElement>('.fa-cleanup');
  expect(panel).toBeTruthy();
  return panel as HTMLElement;
}

describe('D346 — the cleanup sheet arrives where the user can see it', () => {
  it('brings itself into view and takes the keyboard when it opens', async () => {
    const panel = await mountSheet();
    expect(scrolled).toContain(panel);
    expect(document.activeElement).toBe(panel);
    // Focusable at all — without this the focus call above is a silent no-op.
    expect(panel.getAttribute('tabindex')).toBe('-1');
  });

  it('is a named REGION, not a modal dialog it cannot honour', async () => {
    const panel = await mountSheet();
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-modal')).toBeNull();
    expect(panel.getAttribute('aria-label')).toBeTruthy();
  });

  it('CONTROL: nothing else in the sheet asked to be scrolled to', async () => {
    // Guards the lazy version of this fix — a `scrollIntoView` sprayed over
    // every child would also make the assertion above pass while moving the
    // window somewhere the user did not ask for.
    const panel = await mountSheet();
    expect(scrolled.filter((el) => el !== panel)).toHaveLength(0);
  });
});
