// @vitest-environment jsdom
/**
 * Track 6 bullet 2 — the Media shell's own sidebar reaches Readiness and Review.
 *
 * Both destinations existed only inside the adopted workspace overlay, which is
 * `position: fixed; inset: 0` over the whole viewport (`styles.css`, `.seanime-host`), so
 * the shell that owns Media navigation could not reach two of its own destinations.
 *
 * Two halves are pinned here, because the defect could come back through either:
 *
 *   1. **The loader is one loader.** `useStudyReadiness` is what both shells call; a second
 *      copy is a second opinion about when the readiness document is fresh.
 *   2. **The nav entries exist and their strings are real.** The two entries deliberately
 *      reuse the overlay's own label keys, so a check that the keys resolve in all four
 *      catalogues is what stands in for "no new key was needed".
 */
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';
import type { StudyOrchestratorDocument } from '../../shared/mediaStudyOrchestrator';
import type { SeanimeStudyLibraryEntry } from '../../shared/seanimeStudyLibrary';
import { useStudyReadiness } from '../useStudyReadiness';

const SRC = resolve(__dirname, '..', '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf8');

/* ----------------------------------------------------------------------------------- *
 * The orchestrator module is `await import()`ed by the hook precisely so it stays out of
 * every caller's chunk. That is also what makes it mockable here without dragging the
 * known-words store, the level lists and the frequency dictionaries into a unit test.
 * ----------------------------------------------------------------------------------- */
const initializeStudyOrchestrator = vi.fn();
const currentStudyReadinessFingerprints = vi.fn();
const prepareStudyMediaById = vi.fn();

vi.mock('../mediaStudyOrchestrator', () => ({
  initializeStudyOrchestrator: (...args: unknown[]) => initializeStudyOrchestrator(...args),
  currentStudyReadinessFingerprints: (...args: unknown[]) =>
    currentStudyReadinessFingerprints(...args),
  prepareStudyMediaById: (...args: unknown[]) => prepareStudyMediaById(...args),
}));

const DOCUMENT = { version: 2, readiness: {} } as unknown as StudyOrchestratorDocument;
const FRESH = { version: 2, readiness: { 'readiness-1': {} } } as unknown as StudyOrchestratorDocument;
const FINGERPRINTS = {
  knowledgeFingerprint: 'known-v1',
  levelListsFingerprint: 'levels-v1',
  frequencyListsFingerprint: 'freq-v1',
};

let root: Root | null = null;
let broadcast: ((next: StudyOrchestratorDocument) => void) | null = null;
let released = 0;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  initializeStudyOrchestrator.mockReset().mockResolvedValue(DOCUMENT);
  currentStudyReadinessFingerprints.mockReset().mockResolvedValue(FINGERPRINTS);
  prepareStudyMediaById.mockReset().mockResolvedValue({
    status: 'prepared',
    candidateCount: 12,
    readinessCategory: 'ready-now',
  });
  broadcast = null;
  released = 0;
  (globalThis as unknown as { window: { api: unknown } }).window.api = {
    onStudyChanged: (fn: (next: StudyOrchestratorDocument) => void) => {
      broadcast = fn;
      return () => { released += 1; };
    },
  };
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/** Renders the hook and republishes its last value for assertions. */
function Probe({ active }: { active: boolean }) {
  const readiness = useStudyReadiness(active);
  latest = readiness;
  return null;
}

let latest: ReturnType<typeof useStudyReadiness> | null = null;

async function mount(active: boolean): Promise<void> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(<Probe active={active} />); });
}

async function setActive(active: boolean): Promise<void> {
  await act(async () => { root?.render(<Probe active={active} />); });
}

describe('the readiness loader both Media shells call', () => {
  it('reads nothing while the destination is not showing', async () => {
    await mount(false);
    expect(initializeStudyOrchestrator).not.toHaveBeenCalled();
    expect(currentStudyReadinessFingerprints).not.toHaveBeenCalled();
    expect(latest?.document).toBeUndefined();
    expect(latest?.fingerprints).toBeUndefined();
  });

  it('supplies all three props once the destination shows', async () => {
    await mount(true);
    expect(initializeStudyOrchestrator).toHaveBeenCalledTimes(1);
    expect(latest?.document).toBe(DOCUMENT);
    expect(latest?.fingerprints).toBe(FINGERPRINTS);
    expect(typeof latest?.analyse).toBe('function');
  });

  it('re-supplies the document every time study:changed broadcasts a fresher one', async () => {
    await mount(true);
    expect(latest?.document).toBe(DOCUMENT);
    await act(async () => { broadcast?.(FRESH); });
    // The badge is a function of the last broadcast, not of anything the panel remembers.
    expect(latest?.document).toBe(FRESH);
  });

  it('releases the subscription when the destination is left', async () => {
    await mount(true);
    expect(released).toBe(0);
    await setActive(false);
    expect(released).toBe(1);
  });

  it('analyses with both arguments prepareStudyMediaById takes', async () => {
    await mount(true);
    const entry = {
      studyMediaId: 'media-1',
      subtitleRecordId: 'sub-ja-1',
    } as unknown as SeanimeStudyLibraryEntry;
    const result = await act(async () => latest?.analyse(entry));
    expect(prepareStudyMediaById).toHaveBeenCalledWith('media-1', 'sub-ja-1');
    expect(result).toEqual({
      status: 'prepared',
      candidateCount: 12,
      readinessCategory: 'ready-now',
    });
  });

  /**
   * The negative control. A row with no `studyMediaId` cannot reach `prepareStudyMediaById`
   * at all — the guard refuses in the panel's own `unlinked` wording rather than calling the
   * orchestrator with `undefined` and reporting whatever comes back.
   */
  it('refuses an unlinked row instead of calling the orchestrator', async () => {
    await mount(true);
    const unlinked = { subtitleRecordId: 'sub-ja-1' } as unknown as SeanimeStudyLibraryEntry;
    await expect(latest?.analyse(unlinked)).rejects.toThrow();
    expect(prepareStudyMediaById).not.toHaveBeenCalled();
  });
});

describe('the Media Center sidebar carries both study destinations', () => {
  const source = read('renderer/views/MediaCenterView.tsx');

  it('lists Readiness and Review as navigable destinations', () => {
    expect(source).toContain("id: 'readiness'");
    expect(source).toContain("id: 'review'");
    expect(source).toContain('<SeanimeStudyLibraryPanel');
    expect(source).toContain('<SeanimeWatchLoopPanel focus={reviewFocus}');
  });

  it('reuses the overlay label keys, so the same destination is not called two things', () => {
    for (const key of [
      'mediaWorkspace.viewReadiness',
      'mediaWorkspace.viewReview',
      'studyLibrary.title',
      'studyLoop.eyebrow',
    ] as const) {
      expect(source, key).toContain(key);
      for (const [name, catalog] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        expect(catalog[key], `${key} missing from ${name}`).toBeTruthy();
      }
    }
  });

  it('defers the orchestrator read the way the Discover feed is deferred', () => {
    expect(source).toContain("useStudyReadiness(tab === 'readiness')");
  });

  it('leaves the readiness loader in exactly one place', () => {
    // The player workspace no longer carries a Readiness pane (2026-09-23), so the Media
    // Center is the only caller left — and the host must not grow a second one back.
    const host = read('media/MediaWorkspaceHost.tsx');
    expect(source).toContain("useStudyReadiness(tab === 'readiness')");
    expect(host).not.toContain('useStudyReadiness');
    for (const [path, text] of [
      ['renderer/views/MediaCenterView.tsx', source],
      ['media/MediaWorkspaceHost.tsx', host],
    ] as const) {
      expect(text, `${path} re-derived the readiness document itself`)
        .not.toContain('initializeStudyOrchestrator');
      expect(text, `${path} re-derived the analyse call itself`)
        .not.toContain('prepareStudyMediaById');
    }
  });
});

/**
 * D63/D64 — the same sidebar and the same transport, driven live 2026-09-06 in the Music
 * window: the active destination carried only an `is-active` class across all eight
 * entries, Shuffle carried only that class beside a Like button that already had
 * `aria-pressed`, and Repeat's ONLY name was a raw `Repeat: ${ps.repeat}` template that
 * stayed English in every language.
 *
 * Asserted against the source the way this file's sidebar block already does — rendering
 * the whole shell would drag the orchestrator, the media store and the player in for two
 * attributes — plus a real four-catalogue resolution of the keys the fix reuses.
 */
describe('the Media Center rail and transport say which state they are in', () => {
  const source = read('renderer/views/MediaCenterView.tsx');

  it('marks the showing destination on the nav button, not only in its class', () => {
    expect(source).toContain("aria-current={tab === item.id ? 'page' : undefined}");
  });

  it('gives Shuffle a pressed state, the way the Like button beside it already has one', () => {
    expect(source).toContain('aria-pressed={ps.shuffle}');
  });

  it('names Repeat through the catalogue template the other two hosts use', () => {
    expect(source).toContain(
      "title={t('music.controls.repeatTitle', { mode: t(`music.repeat.${ps.repeat}`) })}",
    );
    expect(source, 'the raw English template is back').not.toContain('title={`Repeat: ');
  });

  it('resolves every string that fix depends on in all four catalogues', () => {
    for (const key of [
      'music.controls.repeatTitle',
      'music.repeat.off',
      'music.repeat.all',
      'music.repeat.one',
      'mediaCenter.player.shuffle',
    ] as const) {
      for (const [name, catalog] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        expect(catalog[key], `${key} missing from ${name}`).toBeTruthy();
      }
    }
  });
});
