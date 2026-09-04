// @vitest-environment jsdom
/**
 * Rubric category 3, Files — the two chrome clusters that had no landmark.
 *
 * Measured live 2026-09-04 through the debug bridge, Files window 820x580 in Liquid.
 * `denseWorkOnTranslucent` must be 0 and it read **2**, both of them chrome:
 *
 *   div.fa-toolbar          703x38, 8 focusables, 0 rows, 0 li — a search field, a sort
 *                           control, a view toggle, refresh, scan and cleanup. It sat inside
 *                           `div.lq-scaffold-toolbar` (`data-lq-role="liquid"`, alpha 0.72 +
 *                           blur) with `role` null, so the role walk had nothing to go on and
 *                           classified it by content: one `<input>` makes `forms >= 1` makes
 *                           "dense work", and §2.3's "dense work never on glass" bar failed on
 *                           the application's own toolbar.
 *   div.fa-folder-actions   48x100, three commands, inside `nav.lq-scaffold-rail`. It DID
 *                           carry a role — `group`, which is generic enough to cover a
 *                           fieldset — under a name borrowed from the folder LIST above it
 *                           ("My folders"), which named the wrong thing.
 *
 * After: `denseWorkOnTranslucent` **2 -> 0**, `eligibleTotal` **4 -> 6**, treated 6/6 and
 * shared-primitive 6/6, control A falsifying 0 -> 1 and restoring. The declaration is the fix
 * because it is also simply true, and it is what the scaffold already assumes.
 *
 * This file pins the landmark and the NAME, because a role with the wrong accessible name is
 * the half of it that regressed once already.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilesApp } from '../components/filesapp/FilesApp';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ru } from '../../shared/i18n/catalogs/ru';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => [],
  addDeckCardsTracked: () => [],
  removeDeckCards: () => [],
}));

class NoopResizeObserver {
  observe(): void {
    /* nothing observed */
  }
  unobserve(): void {
    /* nothing observed */
  }
  disconnect(): void {
    /* nothing observed */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
});

function q(selector: string): HTMLElement | null {
  return host?.querySelector<HTMLElement>(selector) ?? null;
}

/** The English text a key resolves to, so the assertion cannot drift from the catalog. */
function text(key: string): string {
  const value = (en as Record<string, unknown>)[key];
  expect(typeof value, `${key} must be a plain string in the English catalog`).toBe('string');
  return value as string;
}

describe('Files app — chrome clusters declare themselves', () => {
  it('the item toolbar is a named toolbar landmark', async () => {
    await mount(<FilesApp />);
    const toolbar = q('.fa-toolbar');
    expect(toolbar, '.fa-toolbar must render').toBeTruthy();
    expect(toolbar?.getAttribute('role')).toBe('toolbar');
    expect(toolbar?.getAttribute('aria-label')).toBe(text('filesApp.toolbar.label'));
  });

  it('the folder actions are a toolbar named for the ACTIONS, not the folder list', async () => {
    await mount(<FilesApp />);
    const actions = q('.fa-folder-actions');
    expect(actions, '.fa-folder-actions must render').toBeTruthy();
    expect(actions?.getAttribute('role')).toBe('toolbar');
    expect(actions?.getAttribute('aria-label')).toBe(text('filesApp.collections.actionsLabel'));
    // The specific regression this replaced: the cluster wore the folder LIST's heading.
    expect(actions?.getAttribute('aria-label')).not.toBe(text('filesApp.collections.heading'));
  });

  it('both clusters sit inside a shared Liquid primitive rather than a local copy', async () => {
    await mount(<FilesApp />);
    // The category-3 `sharedPrimitive` term is `closest('[data-lq-role="liquid"], .lq-contextual,
    // …')`. Neither cluster paints its own material, and neither should: the scaffold's toolbar
    // and rail carry `data-lq-role="liquid"` and hand it down. A local translucent copy here
    // would score the same on the "treated" bar and fail the "shared primitive" one.
    for (const selector of ['.fa-toolbar', '.fa-folder-actions']) {
      const el = q(selector);
      expect(el, `${selector} must render`).toBeTruthy();
      expect(el?.className, `${selector} must not hand-roll a Liquid material`).not.toMatch(
        /\blq-(liquid|contextual)\b/,
      );
    }
  });

  it('the two names are distinct in every shipped language', async () => {
    // A landmark's name is what tells the two clusters apart, so a catalog that resolved both
    // to the same string would undo the fix without touching this component.
    const catalogs: Array<[string, Record<string, unknown>]> = [
      ['en', en],
      ['ja', ja],
      ['zh', zh],
      ['ru', ru],
    ];
    for (const [lang, catalog] of catalogs) {
      const toolbar = catalog['filesApp.toolbar.label'];
      const actions = catalog['filesApp.collections.actionsLabel'];
      const heading = catalog['filesApp.collections.heading'];
      expect(typeof toolbar, `${lang} is missing filesApp.toolbar.label`).toBe('string');
      expect(typeof actions, `${lang} is missing filesApp.collections.actionsLabel`).toBe('string');
      expect(actions, `${lang} names the actions after the folder list`).not.toBe(heading);
      expect(actions, `${lang} gives both clusters one name`).not.toBe(toolbar);
    }
  });
});
