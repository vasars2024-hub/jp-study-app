// @vitest-environment jsdom
/**
 * a11y3 — the app's modal dialogs and the Aero Flip overlay: axe-core (plus
 * the house ARIA audit) while open, focus moved inside on open, Tab and
 * Shift+Tab kept inside from any position (including the panel itself, where
 * these dialogs put initial focus and from where Shift+Tab used to escape),
 * and focus handed back to the opener on close.
 */
import { act, createElement, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

beforeAll(() => {
  installJsdomShims();
  stubBridge();
});

afterEach(async () => {
  await cleanup();
});

const key = async (k: string, shiftKey = false): Promise<void> => {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }),
    );
  });
};

function opener(): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = 'Open';
  document.body.append(b);
  b.focus();
  return b;
}

describe('dialogs — axe-core and focus', () => {
  it('confirm, alert and prompt dialogs', async () => {
    const { confirmDialog, alertDialog, promptDialog } = await import('../components/ui/dialogService');
    const cases: [string, () => Promise<unknown>][] = [
      ['confirm', () => confirmDialog({ title: 'Remove deck', message: 'Remove these cards?', danger: true })],
      ['alert', () => alertDialog({ title: 'Saved', message: 'Your deck was saved.' })],
      ['prompt', () => promptDialog({ title: 'Rename', message: 'New name', defaultValue: 'Deck' } as never)],
    ];
    for (const [name, open] of cases) {
      const from = opener();
      let settled = false;
      await act(async () => {
        void open().then(() => {
          settled = true;
        });
      });
      await settle(20);
      const dialog = document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]');
      expect(dialog, `${name}: open`).not.toBeNull();
      expect(dialog?.contains(document.activeElement), `${name}: focus inside`).toBe(true);
      expect(await a11yViolations(document.body), name).toEqual([]);
      // Shift+Tab and Tab from wherever focus is now keep it inside.
      for (const shift of [true, true, false, false, false]) {
        await key('Tab', shift);
        expect(dialog?.contains(document.activeElement), `${name}: Tab stayed inside`).toBe(true);
      }
      await key('Escape');
      await settle(250);
      expect(settled, `${name}: Escape closed it`).toBe(true);
      expect(document.activeElement, `${name}: focus back on the opener`).toBe(from);
      from.remove();
    }
  });

  it('the shared Dialog wraps Shift+Tab from its own panel and restores focus', async () => {
    const { Dialog } = await import('../components/ui/Dialog');
    const from = opener();
    function Host() {
      const [open, setOpen] = useState(true);
      return createElement(Dialog, {
        open,
        onClose: () => setOpen(false),
        title: 'Settings',
        children: createElement('input', { 'aria-label': 'Name' }),
        footer: createElement('button', { type: 'button', onClick: () => setOpen(false) }, 'Done'),
      });
    }
    await mount(createElement(Host), 20);
    const panel = document.querySelector<HTMLElement>('.ui-dialog');
    expect(document.activeElement).toBe(panel);
    await key('Tab', true);
    // The panel is not a tab stop; the old trap let Shift+Tab walk out of it here.
    expect(document.activeElement?.textContent).toBe('Done');
    expect(await a11yViolations(document.body)).toEqual([]);
    await key('Escape');
    await settle(10);
    expect(document.activeElement).toBe(from);
  });

  it('Aero Flip: named listbox, focus inside while open, back to the opener on Escape', async () => {
    const { default: AeroFlip, AERO_FLIP_EVENT } = await import('../components/shell/AeroFlip');
    const from = opener();
    const cards = [
      { id: 'w1', section: 'stats', label: 'Statistics', glyph: 'stats', z: 2 },
      { id: 'w2', section: 'flashcards', label: 'Flashcards', glyph: 'flashcards', z: 1 },
    ];
    await mount(createElement(AeroFlip, { cards: cards as never, onPick: () => undefined }), 10);
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AERO_FLIP_EVENT));
    });
    await settle(20);
    const stage = document.querySelector<HTMLElement>('[role="listbox"]');
    expect(stage, 'flip open').not.toBeNull();
    expect(stage?.contains(document.activeElement) || document.activeElement === stage).toBe(true);
    expect(await a11yViolations(document.body)).toEqual([]);
    await key('Escape');
    await settle(20);
    expect(document.activeElement).toBe(from);
  });
});
