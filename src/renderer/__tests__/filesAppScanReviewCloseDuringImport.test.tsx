// @vitest-environment jsdom
/**
 * Register row D11 — "the Close button stays enabled while the import is
 * actually moving files".
 *
 * `b31facb6` made **Escape** refuse while `importing` and deliberately left the
 * visible Close button alone, so the reflex key was safe and the control the
 * user actually clicks was not: one click took the sheet away while the import
 * loop kept running with nothing on screen admitting it existed.
 *
 * The claim under test is about the CONTROL, not the state machine, so the
 * importer is stalled on a promise this file resolves by hand and the button is
 * read at three points: before, during, and after. A test that only asserted
 * `disabled` at the end would pass against a button that was never disabled.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanReviewSheet } from '../components/filesapp/ScanReviewSheet';
import { buildScanReport, scanEntryFor, type FilesScanReport } from '../../shared/filesApp/scan';
import type { DropCandidate } from '../../shared/fileRouting';
import { clearImportLedger } from '../filesImportLedgerStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MKV = 'C:\\dl\\ep01.mkv';
const CANDIDATES: Record<string, DropCandidate[]> = {
  [MKV]: [{ target: 'media', confidence: 'exact', reasonKey: 'fileDrop.reason.media' }],
};

function report(): FilesScanReport {
  return buildScanReport({
    roots: ['C:\\dl'],
    entries: Object.entries(CANDIDATES).map(([path, candidates]) =>
      scanEntryFor({ path, name: path.split('\\').pop() as string, sizeBytes: 100 }, candidates),
    ),
    skips: [],
    truncated: false,
    elapsedMs: 4,
  });
}

const filesScan = vi.fn<(roots: string[]) => Promise<FilesScanReport>>();
const fileDropClassify = vi.fn();
const addMediaPaths = vi.fn();

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let releaseImport: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  clearImportLedger();
  releaseImport = null;
  for (const fn of [filesScan, fileDropClassify, addMediaPaths]) fn.mockReset();
  filesScan.mockImplementation(async () => report());
  fileDropClassify.mockImplementation(async (paths: string[]) =>
    paths.map((path) => ({
      path,
      name: path.split('\\').pop() as string,
      isDirectory: false,
      sizeBytes: 100,
      candidates: CANDIDATES[path] ?? [],
    })),
  );
  // The stall. `executeImport` awaits this, so the component sits in
  // `status: 'importing'` for exactly as long as this test wants it to.
  addMediaPaths.mockImplementation(
    () =>
      new Promise((resolve) => {
        releaseImport = () => resolve([{ id: 'med-1' }]);
      }),
  );
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      filesScan,
      fileDropClassify,
      addMediaPaths,
      importPaths: vi.fn(async () => [{ id: 'lib-1' }]),
      dictImportYomitan: vi.fn(async () => ({ ok: true })),
      attachSubtitleFile: vi.fn(async () => ({ ok: true, message: '', lang: 'ja' })),
      setWallpaperFromPath: vi.fn(),
      getWallpaper: vi.fn(async () => 'C:\\old.jpg'),
      removeMedia: vi.fn(),
      removeItem: vi.fn(),
      fileDropFolderFiles: vi.fn(),
      filesClipboardFolders: vi.fn(async () => []),
    },
  });
});

afterEach(async () => {
  releaseImport?.();
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function q<T extends Element = HTMLElement>(selector: string): T {
  const el = host?.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el as unknown as T;
}

async function mount(onClose: () => void): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<ScanReviewSheet onClose={onClose} />));
}

async function scan(): Promise<void> {
  const input = q<HTMLInputElement>('.fa-review-root-input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      input,
      'C:\\dl',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    q('.fa-review-scan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('D11 — Close cannot take the sheet away mid-import', () => {
  it('is enabled before, disabled while files are moving, enabled again after', async () => {
    const onClose = vi.fn();
    await mount(onClose);
    await scan();

    const close = () => q<HTMLButtonElement>('.fa-review-close');
    expect(close().disabled).toBe(false);

    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    // The progress line is on screen, so the import is genuinely in flight —
    // without this the `disabled` below could be true for some other reason.
    expect(q('.fa-review-progress')).toBeTruthy();
    expect(close().disabled).toBe(true);

    // And it does not merely LOOK disabled: a real click gets nowhere.
    await act(async () => {
      close().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      releaseImport?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(close().disabled).toBe(false);
    await act(async () => {
      close().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
