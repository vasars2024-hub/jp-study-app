// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesDeletionControls } from '../components/filesapp/FilesDeletionControls';
import {
  FilesDeletionSession,
  browserFilesSoftDeletePersistence,
  type FilesDeletionBridge,
  type FilesDeletionCatalogueItem,
} from '../components/filesapp/filesDeletionSession';

let root: Root | null = null;

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

function item(overrides: Partial<FilesDeletionCatalogueItem> = {}): FilesDeletionCatalogueItem {
  return {
    id: 'file:one',
    name: 'Episode one.mp4',
    kind: 'video',
    location: { store: 'file', path: 'C:\\fixture\\episode-one.mp4' },
    sizeBytes: 1_024,
    ...overrides,
  };
}

function setup(bridge?: FilesDeletionBridge) {
  const values = new Map<string, string>();
  const session = new FilesDeletionSession(
    bridge ?? { trash: async ({ itemId }) => ({ ok: true, itemId, mode: 'trash' }) },
    browserFilesSoftDeletePersistence(
      {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      () => undefined,
    ),
    () => 'undo:one',
    60_000,
  );
  return { session, values };
}

async function render(
  selected: FilesDeletionCatalogueItem,
  session: FilesDeletionSession,
  onChanged = vi.fn(),
) {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(FilesDeletionControls, { item: selected, session, t, onChanged }));
  });
  return {
    host,
    onChanged,
    rerender: async (next: FilesDeletionCatalogueItem) => {
      await act(async () => {
        root?.render(createElement(FilesDeletionControls, { item: next, session, t, onChanged }));
      });
    },
  };
}

async function click(element: Element | null) {
  if (!(element instanceof HTMLElement)) throw new Error('Missing control');
  await act(async () => element.click());
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe('FilesDeletionControls', () => {
  it('shows the irreplaceable-media wording and binds confirmation to the selected id', async () => {
    const trash = vi.fn<FilesDeletionBridge['trash']>(async ({ itemId }) => ({
      ok: true,
      itemId,
      mode: 'trash',
    }));
    const { session } = setup({ trash });
    const { host, onChanged } = await render(item(), session);

    await click(host.querySelector('.fa-delete-action'));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'filesApp.delete.confirmMediaTrash',
    );
    expect(trash).not.toHaveBeenCalled();

    await click(host.querySelector('.fa-delete-confirm-yes'));
    expect(trash).toHaveBeenCalledWith({ itemId: 'file:one', confirmedItemId: 'file:one' });
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'filesApp.delete.trashed',
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes an index row and exposes a working Undo action', async () => {
    const { session } = setup();
    const note = item({
      id: 'note:one',
      name: 'Study note',
      kind: 'note',
      location: { store: 'localStorage', key: 'notes', pointer: 'note:one' },
    });
    const { host, onChanged } = await render(note, session);

    await click(host.querySelector('.fa-delete-action'));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'filesApp.delete.confirmSoft',
    );
    await click(host.querySelector('.fa-delete-confirm-yes'));
    expect(session.isDeleted('note:one')).toBe(true);
    expect(host.querySelector('.fa-delete-undo')).not.toBeNull();

    await click(host.querySelector('.fa-delete-undo'));
    expect(session.isDeleted('note:one')).toBe(false);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'filesApp.delete.undoRestored',
    );
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('states the computed-row refusal and offers no delete button', async () => {
    const { session } = setup();
    const { host } = await render(
      item({
        id: 'stat:one',
        kind: 'statistic',
        location: { store: 'derived', describes: 'study total' },
      }),
      session,
    );

    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'filesApp.delete.refuseComputed',
    );
    expect(host.querySelector('button')).toBeNull();
  });

  it('never attaches a delayed delete receipt to a newly selected row', async () => {
    let settle: ((result: { ok: true; itemId: string; mode: 'trash' }) => void) | undefined;
    const trash = vi.fn<FilesDeletionBridge['trash']>(
      ({ itemId }) => new Promise((resolve) => {
        settle = () => resolve({ ok: true, itemId, mode: 'trash' });
      }),
    );
    const { session } = setup({ trash });
    const first = item({ id: 'file:first', kind: 'transcript', name: 'First transcript' });
    const second = item({ id: 'file:second', kind: 'transcript', name: 'Second transcript' });
    const { host, rerender, onChanged } = await render(first, session);

    await click(host.querySelector('.fa-delete-action'));
    const deleting = act(async () => {
      const button = host.querySelector<HTMLElement>('.fa-delete-confirm-yes');
      if (!button) throw new Error('Missing confirmation');
      button.click();
    });
    await rerender(second);
    await act(async () => settle?.({ ok: true, itemId: 'file:first', mode: 'trash' }));
    await deleting;

    expect(host.textContent).not.toContain('filesApp.delete.trashed');
    expect(host.querySelector('.fa-delete-action')).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
