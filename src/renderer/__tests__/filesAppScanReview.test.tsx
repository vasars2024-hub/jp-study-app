// @vitest-environment jsdom
/**
 * Gate 27's surface — "Ambiguity goes to review, not into the library. A file
 * the router settles only by guessing lands in the review queue; a
 * high-confidence match may auto-import. Both paths demonstrated with a real
 * file each."
 *
 * The real files are in `main/__tests__/filesAppIngest.test.ts`, where the
 * production `scanRoots` walks them on disk. This file drives the PRODUCTION
 * component over that scan's own answer, because the model being right is not
 * the gate — the gate is that a guess does not reach the library.
 *
 * So the importers are the thing that is spied on, and the claim every test
 * here makes is about what `window.api.importPaths`/`addMediaPaths`/
 * `dictImportYomitan` were called with. A row that renders in the right list
 * and then imports anyway would pass a DOM-only assertion and fail the gate.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanReviewSheet } from '../components/filesapp/ScanReviewSheet';
import { buildScanReport, scanEntryFor, type FilesScanReport } from '../../shared/filesApp/scan';
import type { DropCandidate } from '../../shared/fileRouting';
import { clearImportLedger } from '../filesImportLedgerStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* The four files, with the candidate lists the production router returns for
   them — copied from the real classifier's own output, which the main-process
   test asserts against real files on disk. */
const SRT = 'C:\\dl\\ep01.srt';
const MKV = 'C:\\dl\\ep01.mkv';
const CSV = 'C:\\dl\\vocab.csv';
const PNG = 'C:\\dl\\page001.png';
const XYZ = 'C:\\dl\\notes.xyz';

const CANDIDATES: Record<string, DropCandidate[]> = {
  [SRT]: [{ target: 'subtitle', confidence: 'exact', reasonKey: 'fileDrop.reason.subtitle' }],
  [MKV]: [{ target: 'media', confidence: 'exact', reasonKey: 'fileDrop.reason.media' }],
  [CSV]: [{ target: 'deck-csv', confidence: 'likely', reasonKey: 'fileDrop.reason.deckTable' }],
  [PNG]: [
    { target: 'wallpaper', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.imageWallpaper' },
    { target: 'library-manga', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.imagePage' },
  ],
  [XYZ]: [{ target: 'unknown', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.unrecognised' }],
};

function report(): FilesScanReport {
  return buildScanReport({
    roots: ['C:\\dl'],
    entries: Object.entries(CANDIDATES).map(([path, candidates]) =>
      scanEntryFor(
        { path, name: path.split('\\').pop() as string, sizeBytes: 100 },
        candidates,
      ),
    ),
    skips: [{ path: 'C:\\dl\\ep02.mkv.crdownload', reasonKey: 'filesApp.scan.skip.incomplete' }],
    truncated: false,
    elapsedMs: 4,
  });
}

const filesScan = vi.fn<(roots: string[]) => Promise<FilesScanReport>>();
const fileDropClassify = vi.fn();
const importPaths = vi.fn();
const addMediaPaths = vi.fn();
const dictImportYomitan = vi.fn();
const setWallpaperFromPath = vi.fn();
const getWallpaper = vi.fn();
const removeMedia = vi.fn();

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  // `localStorage.clear()` alone does NOT isolate these tests: the ledger store
  // keeps an in-module `memory` fallback so a quota error degrades to
  // "forgotten on restart" rather than to "gate 29 stops working". That
  // fallback survives a cleared localStorage, so the leak has to be cut here.
  clearImportLedger();
  for (const fn of [
    filesScan,
    fileDropClassify,
    importPaths,
    addMediaPaths,
    dictImportYomitan,
    setWallpaperFromPath,
    getWallpaper,
    removeMedia,
  ]) {
    fn.mockReset();
  }
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
  importPaths.mockImplementation(async () => [{ id: 'lib-1' }]);
  addMediaPaths.mockImplementation(async () => [{ id: 'med-1' }]);
  dictImportYomitan.mockImplementation(async () => ({ ok: true }));
  getWallpaper.mockImplementation(async () => 'C:\\old.jpg');
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      filesScan,
      fileDropClassify,
      importPaths,
      addMediaPaths,
      dictImportYomitan,
      setWallpaperFromPath,
      getWallpaper,
      removeMedia,
      removeItem: vi.fn(),
      fileDropFolderFiles: vi.fn(),
    },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(onImported?: () => void): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<ScanReviewSheet onClose={() => undefined} onImported={onImported} />));
  return host;
}

function q<T extends Element = HTMLElement>(selector: string): T {
  const el = host?.querySelector(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el as unknown as T;
}

function rowNames(section: string): string[] {
  return Array.from(host?.querySelectorAll(`${section} .fa-review-name`) ?? []).map(
    (n) => n.textContent ?? '',
  );
}

async function scan(rootPath = 'C:\\dl'): Promise<void> {
  const input = q<HTMLInputElement>('.fa-review-root-input');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, rootPath);
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

describe('gate 27 — the review queue stands between a guess and the library', () => {
  it('splits the scan into the three piles the model decided', async () => {
    await mount();
    await scan();
    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt', 'ep01.mkv']);
    expect(rowNames('.fa-review-queue')).toEqual(['vocab.csv', 'page001.png']);
    expect(rowNames('.fa-review-refused')).toEqual(['notes.xyz']);
    // The skipped `.crdownload` is stated, not swallowed.
    expect(rowNames('.fa-review-skips')).toEqual(['ep02.mkv.crdownload']);
  });

  it('imports NOTHING until Import is pressed', async () => {
    await mount();
    await scan();
    expect(importPaths).not.toHaveBeenCalled();
    expect(addMediaPaths).not.toHaveBeenCalled();
    expect(dictImportYomitan).not.toHaveBeenCalled();
    expect(setWallpaperFromPath).not.toHaveBeenCalled();
  });

  it('the guessed .csv does not reach an importer when it is left alone', async () => {
    await mount();
    await scan();
    /*
     * The scored claim is "a guess does not reach an importer", so the
     * assertions below are about the importer spies and nothing else. Skipping
     * every review row is written defensively — `?? []` and a loop rather than
     * a length assertion — so that a build which wrongly put the guesses in the
     * AUTO pile fails on the import call it made, not on a missing `<select>`.
     */
    const selects = Array.from(
      host?.querySelectorAll('.fa-review-queue select') ?? [],
    ) as HTMLSelectElement[];
    for (const select of selects) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          'value',
        )?.set;
        setter?.call(select, 'skip');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Only the two certain files reached an importer.
    expect(addMediaPaths).toHaveBeenCalledWith([MKV]);
    expect(importPaths).not.toHaveBeenCalled();
    expect(setWallpaperFromPath).not.toHaveBeenCalled();
    expect(selects).toHaveLength(2);
  });

  it('a reviewed row imports to the destination the user PICKED, not the default', async () => {
    await mount();
    await scan();
    const pngSelect = (
      Array.from(host?.querySelectorAll('.fa-review-queue select') ?? []) as HTMLSelectElement[]
    )[1];
    // The ranked candidates the router offered, in its order, plus skip.
    expect(Array.from(pngSelect.options).map((o) => o.value)).toEqual([
      'wallpaper',
      'library-manga',
      'skip',
    ]);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      )?.set;
      setter?.call(pngSelect, 'library-manga');
      pngSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // It went to the library, not to the wallpaper the router ranked first.
    expect(importPaths).toHaveBeenCalledWith([PNG]);
    expect(setWallpaperFromPath).not.toHaveBeenCalled();
  });

  it('refuses a root it could not read instead of reporting an empty scan', async () => {
    // The control that stops "0 files found" from being said about a folder
    // that does not exist.
    filesScan.mockImplementation(async () =>
      buildScanReport({ roots: [], entries: [], skips: [], truncated: false, elapsedMs: 0 }),
    );
    await mount();
    await scan('C:\\nope');
    expect(q('.fa-review-error').textContent).toContain('could not be read');
    expect(host?.querySelector('.fa-review-confirm')).toBeNull();
  });

  it('names an empty root before it calls main', async () => {
    await mount();
    await act(async () => {
      q('.fa-review-scan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(filesScan).not.toHaveBeenCalled();
    expect(q('.fa-review-error').textContent).toContain('folder you want scanned');
  });
});

describe('gate 24 — the import half, and its reversal', () => {
  it('reports a per-item outcome and can undo exactly what it created', async () => {
    const onImported = vi.fn();
    await mount(onImported);
    await scan();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Four jobs: two auto plus two review rows left at their default target.
    // `deck-csv` has no path-in importer, so it refuses BY NAME rather than
    // reporting a success — the outcome list is the receipt.
    const outcomes = Array.from(host?.querySelectorAll('.fa-review-outcomes .fa-review-row') ?? []);
    expect(outcomes).toHaveLength(4);
    expect(q('.fa-review-outcomes .fa-review-summary').textContent).toContain('3 of 4');
    expect(outcomes[2]?.textContent).toContain('Nothing here can open vocab.csv yet');
    expect(onImported).toHaveBeenCalled();

    await act(async () => {
      q('.fa-review-undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The wallpaper is restored to what it was, and the media row removed by
    // its own id — not "the last one added".
    expect(setWallpaperFromPath).toHaveBeenLastCalledWith('C:\\old.jpg');
    expect(removeMedia).toHaveBeenCalledWith('med-1');
    expect(q('.fa-review-summary').textContent).toContain('Reversed 3 imports');
  });

  it('gate 29 — a second scan reports what landed as already held', async () => {
    await mount();
    await scan();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Three landed (the .csv refused), so three are held and the .csv is not.
    await scan();
    expect(rowNames('.fa-review-known').sort()).toEqual(
      ['ep01.srt', 'ep01.mkv', 'page001.png'].sort(),
    );
    expect(rowNames('.fa-review-auto')).toEqual([]);
    expect(rowNames('.fa-review-queue')).toEqual(['vocab.csv']);

    // And the second confirm calls no importer for the three it already has.
    importPaths.mockClear();
    addMediaPaths.mockClear();
    setWallpaperFromPath.mockClear();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(addMediaPaths).not.toHaveBeenCalled();
    expect(setWallpaperFromPath).not.toHaveBeenCalled();
    // Only the still-unheld .csv was attempted, and it refuses by name.
    expect(q('.fa-review-outcomes .fa-review-summary').textContent).toContain('0 of 1');
  });

  it('gate 29 — an undo forgets, so the file is offered again', async () => {
    await mount();
    await scan();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      q('.fa-review-undo').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await scan();
    // Reversed imports are not held. Without the forget, these would read as
    // already imported and the user could never bring them back.
    expect(rowNames('.fa-review-known')).toEqual([]);
    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt', 'ep01.mkv']);
  });

  it('one failing import does not abort the rest', async () => {
    addMediaPaths.mockImplementation(async () => {
      throw new Error('disk full');
    });
    await mount();
    await scan();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const outcomes = Array.from(host?.querySelectorAll('.fa-review-outcomes .fa-review-row') ?? []);
    expect(outcomes).toHaveLength(4);
    expect(outcomes[1]?.textContent).toContain('Could not import ep01.mkv');
    // The wallpaper, which is scheduled after the failing video, still landed.
    expect(setWallpaperFromPath).toHaveBeenCalledWith(PNG);
  });
});
