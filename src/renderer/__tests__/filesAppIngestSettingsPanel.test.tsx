// @vitest-environment jsdom
/**
 * Gates 31 and 36 — the halves that were missing: "set to" as a product
 * surface.
 *
 * Gate 36: "With subtitles set to auto-import and video set to review, a folder
 * containing both routes each one differently in a single scan."
 * Gate 31: "The stability window is honoured **and adjustable**."
 *
 * Both models were already measured — gate 36's routing in
 * `shared/__tests__/filesAppIngest.test.ts` against a hand-built settings
 * object, gate 31's window in `main/__tests__/filesAppStabilitySetting.test.ts`
 * against the real handler. Neither could be *set*. So this file drives the
 * PRODUCTION `ScanReviewSheet`'s own controls and then measures what the app
 * did with them: which pile each real row landed in, what `filesScan` was
 * called with, and which importers ran.
 *
 * The rule every test here follows: never assert on the control's own value.
 * A `<select>` showing "review" proves the select works. What the gates ask is
 * whether the scan then behaved differently, so the claims are about
 * `filesScan`'s arguments, the rendered piles, and the importer spies.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScanReviewSheet } from '../components/filesapp/ScanReviewSheet';
import { buildScanReport, scanEntryFor, type FilesScanReport } from '../../shared/filesApp/scan';
import type { DropCandidate } from '../../shared/fileRouting';
import { clearImportLedger } from '../filesImportLedgerStore';
import { resetIngestSettingsMemoryForTests } from '../filesIngestSettingsStore';
import { DEFAULT_STABILITY_MS } from '../../shared/filesApp/stability';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRT = 'C:\\dl\\ep01.srt';
const MKV = 'C:\\dl\\ep01.mkv';

/** The production router's own answers for these two, both `exact`. */
const CANDIDATES: Record<string, DropCandidate[]> = {
  [SRT]: [{ target: 'subtitle', confidence: 'exact', reasonKey: 'fileDrop.reason.subtitle' }],
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
    elapsedMs: 3,
  });
}

const filesScan = vi.fn<(roots: string[], options?: unknown) => Promise<FilesScanReport>>();
const fileDropClassify = vi.fn();
const importPaths = vi.fn();
const addMediaPaths = vi.fn();

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  localStorage.clear();
  clearImportLedger();
  // `localStorage.clear()` does not touch the settings store's in-module
  // fallback, and a window set by the previous test would survive into this one.
  resetIngestSettingsMemoryForTests();
  for (const fn of [filesScan, fileDropClassify, importPaths, addMediaPaths]) fn.mockReset();
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
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { filesScan, fileDropClassify, importPaths, addMediaPaths },
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<ScanReviewSheet onClose={() => undefined} />));
}

/** A restart: the DOM goes, the in-memory fallback goes, localStorage stays. */
async function restart(): Promise<void> {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  resetIngestSettingsMemoryForTests();
  await mount();
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

async function setValue(el: HTMLElement, value: string, event = 'change'): Promise<void> {
  const proto =
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

/** The panel's per-destination control, addressed the way a user would. */
async function setCategory(target: string, policy: string): Promise<void> {
  await setValue(q<HTMLSelectElement>(`.fa-review-category select[data-target="${target}"]`), policy);
}

async function setStability(value: string): Promise<void> {
  const input = q<HTMLInputElement>('.fa-review-stability');
  await setValue(input, value, 'input');
  /*
   * Committed on blur, not per keystroke — "3000" is typed through "3". React's
   * `onBlur` is `focusout` under the hood, and a dispatched `blur` does not
   * bubble, so driving this with `blur` would commit nothing and report the
   * feature dead. This is the keyboard path a user takes, exactly.
   */
  await act(async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

async function scan(rootPath = 'C:\\dl'): Promise<void> {
  await setValue(q<HTMLInputElement>('.fa-review-root-input'), rootPath, 'input');
  await act(async () => {
    q('.fa-review-scan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function confirmImport(): Promise<void> {
  await act(async () => {
    q('.fa-review-confirm').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('gate 36 — subtitles auto, video review, one scan', () => {
  it('the SAME folder routes its two files differently once the panel is set', async () => {
    await mount();

    // The control first: with no overrides, both are recognised exactly and
    // both sit in the auto pile. A test that only ran the "after" could not
    // tell a working override from a scan that always splits this way.
    await scan();
    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt', 'ep01.mkv']);
    expect(rowNames('.fa-review-queue')).toEqual([]);

    await setCategory('subtitle', 'auto');
    await setCategory('media', 'review');
    await scan();

    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt']);
    expect(rowNames('.fa-review-queue')).toEqual(['ep01.mkv']);
  });

  it('the video that moved to review does not reach its importer when skipped', async () => {
    await mount();
    // Before: the media file is in the auto pile and Import calls addMediaPaths.
    await scan();
    await confirmImport();
    expect(addMediaPaths).toHaveBeenCalledWith([MKV]);

    addMediaPaths.mockClear();
    clearImportLedger();

    await setCategory('media', 'review');
    await scan();
    await setValue(q<HTMLSelectElement>('.fa-review-queue select'), 'skip');
    await confirmImport();

    // Same folder, same file, same button: the setting is the only difference.
    expect(addMediaPaths).not.toHaveBeenCalled();
  });

  it('`auto` narrows and never widens — it cannot promote a guess', async () => {
    // A .csv the router only guesses at, with subtitles-style `auto` set on its
    // own destination. Gate 27 must still hold: setting a category to auto is
    // not a licence to import what the router was not sure about.
    const CSV = 'C:\\dl\\vocab.csv';
    filesScan.mockImplementation(async () =>
      buildScanReport({
        roots: ['C:\\dl'],
        entries: [
          scanEntryFor({ path: CSV, name: 'vocab.csv', sizeBytes: 10 }, [
            { target: 'deck-csv', confidence: 'likely', reasonKey: 'fileDrop.reason.deckTable' },
          ]),
        ],
        skips: [],
        truncated: false,
        elapsedMs: 1,
      }),
    );
    await mount();
    await setCategory('deck-csv', 'auto');
    await scan();
    expect(rowNames('.fa-review-auto')).toEqual([]);
    expect(rowNames('.fa-review-queue')).toEqual(['vocab.csv']);
  });

  it('the two overrides survive a restart and still route the scan', async () => {
    await mount();
    await setCategory('subtitle', 'auto');
    await setCategory('media', 'review');
    await restart();
    // Nothing is re-set after the restart: this scan runs on what was stored.
    await scan();
    expect(rowNames('.fa-review-auto')).toEqual(['ep01.srt']);
    expect(rowNames('.fa-review-queue')).toEqual(['ep01.mkv']);
  });
});

describe('gate 31 — the window the user typed is the window the scan uses', () => {
  it('the default travels with the very first scan', async () => {
    await mount();
    await scan();
    expect(filesScan).toHaveBeenCalledWith(['C:\\dl'], { stabilityMs: DEFAULT_STABILITY_MS });
  });

  it('a changed window reaches main on the next scan', async () => {
    await mount();
    await setStability('30000');
    await scan();
    expect(filesScan).toHaveBeenLastCalledWith(['C:\\dl'], { stabilityMs: 30000 });

    await setStability('0');
    await scan();
    expect(filesScan).toHaveBeenLastCalledWith(['C:\\dl'], { stabilityMs: 0 });
  });

  it('an out-of-range window is refused by name, and the scan keeps the stored one', async () => {
    await mount();
    await setStability('30000');
    await setStability('9999999');

    const error = q('.fa-review-settings .fa-review-error');
    expect(error.textContent).toContain('600000');
    // The field shows what is stored, not what was typed — a control that kept
    // displaying a refused value would claim a setting the app does not hold.
    expect(q<HTMLInputElement>('.fa-review-stability').value).toBe('30000');

    await scan();
    expect(filesScan).toHaveBeenLastCalledWith(['C:\\dl'], { stabilityMs: 30000 });
  });

  it('an emptied field falls back to the stored window rather than to zero', async () => {
    await mount();
    await setStability('12000');
    await setStability('');
    expect(q<HTMLInputElement>('.fa-review-stability').value).toBe('12000');
    await scan();
    expect(filesScan).toHaveBeenLastCalledWith(['C:\\dl'], { stabilityMs: 12000 });
  });

  it('the window survives a restart', async () => {
    await mount();
    await setStability('45000');
    await restart();
    await scan();
    expect(filesScan).toHaveBeenLastCalledWith(['C:\\dl'], { stabilityMs: 45000 });
  });
});
