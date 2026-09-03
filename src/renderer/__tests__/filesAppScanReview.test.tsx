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
import {
  classifyArchiveMembers,
  type FilesScanReportWithArchives,
} from '../../shared/filesApp/archive';
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
// A dropped subtitle used to be routed by a `media:attach-subtitle` CustomEvent
// nothing listened to, so `ep01.srt` "imported" without any call at all. It now
// goes through `subtitleDiscovery:attachFile`, which means this gate's "3 of 4
// land" only holds if the route answers — the point of the change.
const attachSubtitleFile = vi.fn();
const setWallpaperFromPath = vi.fn();
const getWallpaper = vi.fn();
const removeMedia = vi.fn();
const filesClipboardFolders = vi.fn<() => Promise<string[]>>();

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
    attachSubtitleFile,
    setWallpaperFromPath,
    getWallpaper,
    removeMedia,
    filesClipboardFolders,
  ]) {
    fn.mockReset();
  }
  filesClipboardFolders.mockImplementation(async () => []);
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
  attachSubtitleFile.mockImplementation(async () => ({ ok: true, message: '', lang: 'ja' }));
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
      attachSubtitleFile,
      setWallpaperFromPath,
      getWallpaper,
      removeMedia,
      removeItem: vi.fn(),
      fileDropFolderFiles: vi.fn(),
      filesClipboardFolders,
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
    // The `.srt` counts toward "3 of 4" only because a real route answered.
    // Until 2026-09-03 it counted with NO importer call at all: the case
    // dispatched a `media:attach-subtitle` event nothing listened to, so this
    // gate's own summary was reporting a file that had been discarded.
    expect(attachSubtitleFile).toHaveBeenCalledWith(SRT);
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

/**
 * Gate 28's surface half.
 *
 * The archives section is deliberately CONTROL-FREE: a member's path is
 * `pack.zip!/ep01.srt`, which no importer can open, so offering a destination
 * picker there would be a control that cannot act. What the section owes the
 * user is the three words the gate names — placed, ambiguous, skipped — with a
 * reason on every skip, so a decision about the archive ITSELF is informed.
 *
 * The scored claim is therefore "the contents are reported and nothing is
 * importable", and both halves are asserted: the counts render, AND the
 * importer spies stay untouched after a scan that found five members.
 */
describe('gate 28 — the surface reports what is inside an archive', () => {
  // Escaped, and it matters: `'C:\dl\...'` is the string `C:dlsubs-pack.zip` —
  // `\d` and `\s` are not escapes — so the archive under test was not in the
  // same folder as every other fixture here. Consistent, and therefore green,
  // but not the path it claimed to be.
  const ZIP = 'C:\\dl\\subs-pack.zip';

  /** The router's real answer for an unsniffable `.zip`: two ambiguous homes. */
  const ZIP_CANDIDATES: DropCandidate[] = [
    { target: 'dictionary-yomitan', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.zipDict' },
    { target: 'library-manga', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.zipManga' },
  ];

  function reportWithArchive(): FilesScanReportWithArchives {
    const base = report();
    return {
      ...base,
      entries: [
        ...base.entries,
        scanEntryFor({ path: ZIP, name: 'subs-pack.zip', sizeBytes: 4096 }, ZIP_CANDIDATES),
      ],
      archives: [
        {
          path: ZIP,
          // The real model, on the same index the main-process test writes to
          // disk — so the numbers the surface prints are the model's, not a
          // hand-typed set that could drift away from it.
          report: classifyArchiveMembers(ZIP, [
            { entryName: 'ep01.srt', sizeBytes: 40, isDirectory: false },
            { entryName: 'ep02.srt', sizeBytes: 40, isDirectory: false },
            { entryName: 'ep03.ass', sizeBytes: 14, isDirectory: false },
            { entryName: 'notes.xyz', sizeBytes: 18, isDirectory: false },
            { entryName: 'inner.zip', sizeBytes: 300, isDirectory: false },
          ]),
        },
      ],
    };
  }

  beforeEach(() => {
    filesScan.mockImplementation(async () => reportWithArchive());
  });

  it('renders the archive with its placed / ambiguous / skipped counts', async () => {
    await mount();
    await scan();
    const section = q('.fa-review-archives');
    expect(section.textContent).toContain('subs-pack.zip');
    /*
     * 4 classified — two .srt and one .ass placed, notes.xyz with no home —
     * and inner.zip skipped. The sentence names all four numbers on purpose:
     * `found` counts the unplaced one, so a summary that omitted it would
     * print "4 inside; 3 placed, 0 need a choice, 1 skipped" and quietly lose
     * a file in its own arithmetic.
     */
    expect(section.textContent).toContain(
      '4 inside; 3 placed, 0 need a choice, 1 have no home, 1 skipped',
    );
  });

  it('names the nested archive it refused to open, with its reason', async () => {
    await mount();
    await scan();
    const section = q('.fa-review-archives');
    expect(section.textContent).toContain('inner.zip');
    expect(section.textContent).toContain('An archive inside an archive');
  });

  it('says what the archive is mostly made of', async () => {
    await mount();
    await scan();
    expect(q('.fa-review-archives').textContent).toContain('Mostly Subtitles');
  });

  it('offers NO control over a member — the section is a report', async () => {
    await mount();
    await scan();
    const section = q('.fa-review-archives');
    expect(section.querySelectorAll('select')).toHaveLength(0);
    expect(section.querySelectorAll('button')).toHaveLength(0);
    expect(section.querySelectorAll('input')).toHaveLength(0);
  });

  it('no member path reaches an importer, even after Import is pressed', async () => {
    await mount();
    await scan();
    await act(async () => {
      q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const everyArg = [importPaths, addMediaPaths, dictImportYomitan, setWallpaperFromPath]
      .flatMap((spy) => spy.mock.calls.flat(2))
      .filter((arg): arg is string => typeof arg === 'string');
    expect(everyArg.length).toBeGreaterThan(0);
    for (const arg of everyArg) expect(arg).not.toContain('!/');
  });

  it('a report with no archives renders no archives section at all', async () => {
    filesScan.mockImplementation(async () => report());
    await mount();
    await scan();
    expect(host?.querySelector('.fa-review-archives')).toBeNull();
  });
});

/**
 * Gate 28's first three words — "**Paste a folder** sorts all of it".
 *
 * The scored claim is that the pasted folder is what gets SCANNED, so every
 * assertion here is about `filesScan`'s argument, not about the field's text. A
 * field that fills correctly and then scans the previous root would pass a
 * DOM-only assertion and fail the gate — and that is the exact failure this
 * component's `explicitRoot` parameter exists to prevent, since `setRoot(x)`
 * followed by `onScan()` reads the value from before the paste.
 */
describe('gate 28 — a pasted folder is the folder that gets scanned', () => {
  async function clickPaste(): Promise<void> {
    await act(async () => {
      q('.fa-review-paste').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('scans the pasted folder — not the one left in the field', async () => {
    // The control is the stale root: the field is deliberately loaded with a
    // DIFFERENT folder first, so "scanned the pasted one" cannot be satisfied
    // by scanning whatever was already there.
    localStorage.setItem('jp-filesapp-scan-root-v1', 'C:\\stale');
    filesClipboardFolders.mockImplementation(async () => ['C:\\dl\\anime']);
    await mount();
    expect(q<HTMLInputElement>('.fa-review-root-input').value).toBe('C:\\stale');
    await clickPaste();
    expect(filesScan).toHaveBeenCalledTimes(1);
    expect(filesScan.mock.calls[0][0]).toEqual(['C:\\dl\\anime']);
    expect(q<HTMLInputElement>('.fa-review-root-input').value).toBe('C:\\dl\\anime');
  });

  it('the pasted folder is walked and sorted, not merely accepted', async () => {
    // "sorts all of it" — the report the paste produced is the one on screen,
    // in the same three piles a typed scan produces.
    filesClipboardFolders.mockImplementation(async () => ['C:\\dl']);
    await mount();
    await clickPaste();
    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt', 'ep01.mkv']);
    expect(rowNames('.fa-review-queue')).toEqual(['vocab.csv', 'page001.png']);
    expect(rowNames('.fa-review-refused')).toEqual(['notes.xyz']);
    expect(rowNames('.fa-review-skips')).toEqual(['ep02.mkv.crdownload']);
  });

  it('an empty clipboard says so and scans NOTHING', async () => {
    filesClipboardFolders.mockImplementation(async () => []);
    await mount();
    await clickPaste();
    expect(filesScan).not.toHaveBeenCalled();
    expect(q('.fa-review-error').textContent).toContain('clipboard');
  });

  it('several pasted folders offer the first and refuse to choose', async () => {
    filesClipboardFolders.mockImplementation(async () => ['C:\\dl\\a', 'C:\\dl\\b']);
    await mount();
    await clickPaste();
    // Stated, not scanned: picking one silently is exactly the quiet decision
    // the review sheet exists to avoid.
    expect(filesScan).not.toHaveBeenCalled();
    expect(q<HTMLInputElement>('.fa-review-root-input').value).toBe('C:\\dl\\a');
    expect(q('.fa-review-error').textContent).toContain('Several folders');
  });

  it('a preload without the binding degrades to "nothing on the clipboard"', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: { ...window.api, filesClipboardFolders: undefined },
    });
    await mount();
    await clickPaste();
    expect(filesScan).not.toHaveBeenCalled();
    expect(q('.fa-review-error')).toBeTruthy();
  });

  it('Ctrl+V in the sheet pastes the folder; Ctrl+V in the FIELD does not', async () => {
    filesClipboardFolders.mockImplementation(async () => ['C:\\dl\\anime']);
    await mount();
    const paste = (target: Element) =>
      act(async () => {
        target.dispatchEvent(
          new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent,
        );
        await Promise.resolve();
      });

    // In the field, a paste is ordinary text editing and must be left alone,
    // or the field becomes impossible to correct by pasting a fragment.
    await paste(q('.fa-review-root-input'));
    expect(filesClipboardFolders).not.toHaveBeenCalled();

    // Anywhere else there is nothing to paste INTO, so it can only mean the
    // folder.
    await paste(q('.fa-review-title'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(filesScan.mock.calls.map((c) => c[0])).toEqual([['C:\\dl\\anime']]);
  });
});
