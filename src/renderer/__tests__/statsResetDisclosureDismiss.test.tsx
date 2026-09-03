// @vitest-environment jsdom
/**
 * The Statistics "Reset" disclosure is a POPOVER, and a native `<details>` has no light dismiss.
 *
 * Measured live 2026-09-03 (cat1 on the populated surface, `hit.occluded`): with the disclosure
 * open its 132x45 panel sits at (753,143), directly over the Word Knowledge "Sync from Anki"
 * button at (752,157) 133x32, and `document.elementFromPoint` at that button's own centre
 * returned `BUTTON.btn.danger` — the Reset action. The only gesture that reads as "never mind"
 * therefore pressed Reset.
 *
 * jsdom has no layout, so the overlap itself is not what this file asserts — that is what the
 * live probe is for. What it asserts is the behaviour that removes it: an outside `pointerdown`
 * and Escape both close the panel, an inside one does not, and the listeners are gone once it is
 * closed. `pointerdown` capture, not `click`, because a press that starts outside and ends
 * inside a re-rendered popover never arrives as one document `click`.
 */
import { act, createElement, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDismissableDisclosure } from '../components/ui/useDismissableDisclosure';

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useDismissableDisclosure(ref, open);
  return createElement(
    'div',
    null,
    createElement(
      'details',
      {
        className: 'stats-data-tools',
        ref,
        onToggle: (e: { currentTarget: HTMLDetailsElement }) => setOpen(e.currentTarget.open),
      },
      createElement('summary', { className: 'btn' }, 'Reset'),
      createElement(
        'div',
        { className: 'stats-data-tools-panel' },
        createElement('button', { type: 'button', className: 'btn danger' }, 'Reset'),
      ),
    ),
    createElement('button', { type: 'button', className: 'btn small' }, 'Sync from Anki'),
  );
}

async function mount(): Promise<HTMLDetailsElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(createElement(Harness)); });
  return host.querySelector('details') as HTMLDetailsElement;
}

/** jsdom fires `toggle` asynchronously, so opening has to be flushed like any other effect. */
async function open(details: HTMLDetailsElement): Promise<void> {
  await act(async () => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
}

async function pointerDownOn(node: Element): Promise<void> {
  await act(async () => {
    node.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('the Statistics Reset disclosure', () => {
  it('closes on a pointerdown outside it, so the click that means "never mind" is not Reset', async () => {
    const details = await mount();
    await open(details);
    expect(details.open).toBe(true);

    const sync = host!.querySelector('.btn.small') as HTMLButtonElement;
    await pointerDownOn(sync);

    expect(details.open).toBe(false);
  });

  it('stays open for a pointerdown on its own panel', async () => {
    const details = await mount();
    await open(details);

    await pointerDownOn(host!.querySelector('.stats-data-tools-panel > .btn.danger')!);

    expect(details.open).toBe(true);
  });

  it('closes on Escape and puts focus back on the summary', async () => {
    const details = await mount();
    await open(details);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(details.querySelector('summary'));
  });

  it('detaches both document listeners once it is closed', async () => {
    // Counted, not inferred from behaviour: jsdom fires `toggle` when `open` is assigned, so a
    // re-opened panel legitimately re-arms and a behavioural probe cannot tell a live listener
    // from a leaked one. The pair has to balance, or every closed Statistics window leaves a
    // capture-phase `pointerdown` handler on the document for the rest of the session.
    const added: string[] = [];
    const removed: string[] = [];
    const realAdd = document.addEventListener.bind(document);
    const realRemove = document.removeEventListener.bind(document);
    const spyAdd = vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions,
    ) => { added.push(type); realAdd(type, fn, opts); }) as typeof document.addEventListener);
    const spyRemove = vi.spyOn(document, 'removeEventListener').mockImplementation(((
      type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions,
    ) => { removed.push(type); realRemove(type, fn, opts); }) as typeof document.removeEventListener);

    try {
      const details = await mount();
      await open(details);
      expect(added.filter((t) => t === 'pointerdown' || t === 'keydown')).toEqual(['pointerdown', 'keydown']);
      expect(removed.filter((t) => t === 'pointerdown' || t === 'keydown')).toEqual([]);

      await act(async () => {
        details.open = false;
        details.dispatchEvent(new Event('toggle'));
      });

      expect(removed.filter((t) => t === 'pointerdown' || t === 'keydown')).toEqual(['pointerdown', 'keydown']);
    } finally {
      spyAdd.mockRestore();
      spyRemove.mockRestore();
    }
  });

  it('MUTATION CONTROL: without the hook the outside press leaves the panel open', async () => {
    function Bare() {
      return createElement(
        'div',
        null,
        createElement(
          'details',
          { className: 'stats-data-tools' },
          createElement('summary', null, 'Reset'),
          createElement('button', { type: 'button', className: 'btn danger' }, 'Reset'),
        ),
        createElement('button', { type: 'button', className: 'btn small' }, 'Sync from Anki'),
      );
    }
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root!.render(createElement(Bare)); });
    const details = host.querySelector('details') as HTMLDetailsElement;
    await open(details);

    await pointerDownOn(host.querySelector('.btn.small')!);

    expect(details.open).toBe(true);
  });
});
