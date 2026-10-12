// @vitest-environment jsdom
/**
 * risk4: ui/Dialog and Escape.
 *  - `dismissable={false}` used to stop only the backdrop click: Escape still
 *    closed the dialog. Now Escape is swallowed (nothing behind reacts) and the
 *    dialog stays.
 *  - Every open dialog listened on `document`, so with a confirm stacked over
 *    another dialog one Escape closed both. Only the top-most handles it now.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog, openDialogCountForTests } from '../components/ui/Dialog';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function render(node: React.ReactNode): void {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

function escape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

describe('Dialog: Escape', () => {
  it('a dismissable dialog closes on Escape', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="A">body</Dialog>);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a non-dismissable dialog swallows Escape and stays open', () => {
    const onClose = vi.fn();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      render(<Dialog open onClose={onClose} dismissable={false} title="Busy">working</Dialog>);
      const event = escape();
      expect(onClose).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('with two stacked, Escape closes only the top one; the next Escape the one below', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    function Stack({ showUpper }: { showUpper: boolean }) {
      return (
        <>
          <Dialog open onClose={lower} title="Settings">
            <input aria-label="field" />
          </Dialog>
          <Dialog open={showUpper} onClose={upper} title="Confirm">
            sure?
          </Dialog>
        </>
      );
    }
    render(<Stack showUpper />);
    expect(openDialogCountForTests()).toBe(2);
    escape();
    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
    act(() => root!.render(<Stack showUpper={false} />));
    expect(openDialogCountForTests()).toBe(1);
    escape();
    expect(lower).toHaveBeenCalledTimes(1);
  });

  it('a non-dismissable dialog on top shields the one below', () => {
    const lower = vi.fn();
    const upper = vi.fn();
    render(
      <>
        <Dialog open onClose={lower} title="Settings">x</Dialog>
        <Dialog open onClose={upper} dismissable={false} title="Saving">y</Dialog>
      </>,
    );
    escape();
    expect(upper).not.toHaveBeenCalled();
    expect(lower).not.toHaveBeenCalled();
  });
});
