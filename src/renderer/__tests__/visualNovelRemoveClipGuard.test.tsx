// @vitest-environment jsdom
/**
 * D147 — "Remove voice clip" destroyed an attachment on one click while its
 * NEIGHBOUR, the larger destruction of the whole capture, already asked twice.
 *
 * `visual-novel:removeCaptureAudio` clears `audioPath` on the capture and saves
 * the database (main/immersion/visualNovels.ts:1079). The managed copy is left
 * orphaned on disk under userData, so recovery is not "undo" — it is the native
 * picker again plus finding the original clip. One misclick, no question asked.
 *
 * The guard here is a two-step arm rather than a modal, deliberately: `remove()`
 * eleven lines above uses exactly that shape in this same component, and the
 * scanner cannot see it (that is the third guard shape recorded in 90a19fc3).
 * So the arm is asserted from the USER's side — label text and call count —
 * never by grepping for a token.
 *
 * `window.api` is installed before the component is imported, following
 * `visualNovelRemoveReports.test.tsx`: this import graph touches `window.api`
 * at module-eval time.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';
import type { VisualNovelEntry, VisualNovelTextCapture } from '../../shared/visualNovel';

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{
    id: 'vn-1',
    title: 'Sample Visual Novel',
    engine: 'kirikiri',
    executablePath: 'C:/Games/Sample/sample.exe',
    routes: [],
  }],
});
const entry = seed.entries[0] as VisualNovelEntry;

function makeCapture(id: string): VisualNovelTextCapture {
  return {
    id,
    visualNovelId: 'vn-1',
    kind: 'dialogue',
    japanese: 'これはテストです。',
    translation: '',
    speaker: '',
    routeId: '',
    chapter: '',
    scene: '',
    screenshotPath: '',
    audioPath: 'C:/userData/vn/clips/clip-1.mp3',
    source: 'manual',
    capturedAt: 1_700_000_000_000,
  };
}

let removeAudioCalls: string[] = [];
let attachCalls: string[] = [];

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelRemoveCaptureAudio: async (id: string) => {
      removeAudioCalls.push(id);
      return { ok: true, database: seed };
    },
    // Cancelled, so the neighbouring control changes nothing except the arm.
    visualNovelAttachCaptureAudio: async (id: string) => {
      attachCalls.push(id);
      return { ok: false, canceled: true };
    },
    visualNovelReadCaptureImage: async () => ({ ok: false }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => ({ ok: false });
    },
  });
}

let Assist: typeof import('../components/immersion/VisualNovelSentenceAssist').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Assist = (await import('../components/immersion/VisualNovelSentenceAssist')).default;
});

afterEach(() => {
  root?.unmount();
  root = null;
  removeAudioCalls = [];
  attachCalls = [];
  document.body.replaceChildren();
});

async function mount(capture: VisualNovelTextCapture): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(
      <Assist
        entry={entry}
        capture={capture}
        onDatabase={() => undefined}
        onStatus={() => undefined}
        onSaveCard={() => undefined}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

async function rerender(capture: VisualNovelTextCapture): Promise<void> {
  await act(async () => {
    root?.render(
      <Assist
        entry={entry}
        capture={capture}
        onDatabase={() => undefined}
        onStatus={() => undefined}
        onSaveCard={() => undefined}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); });
}

const button = (label: string): HTMLButtonElement => {
  const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.visual-novel-sentence-actions button'));
  const found = buttons.find((b) => (b.textContent ?? '').trim() === label);
  if (!found) throw new Error(`no "${label}" among [${buttons.map((b) => (b.textContent ?? '').trim()).join(' | ')}]`);
  return found;
};

describe('removing an attached voice clip asks first', () => {
  it('the first click ARMS and destroys nothing', async () => {
    await mount(makeCapture('cap-1'));
    await act(async () => { button('Remove voice clip').click(); });
    expect(removeAudioCalls, 'the clip was detached on the first click').toEqual([]);
    // The button says what the next click will do, so the arm is visible.
    expect(button('Confirm remove')).not.toBeNull();
  });

  it('the second click removes it', async () => {
    await mount(makeCapture('cap-1'));
    await act(async () => { button('Remove voice clip').click(); });
    await act(async () => { button('Confirm remove').click(); });
    expect(removeAudioCalls).toEqual(['cap-1']);
  });

  it('reaching for Replace disarms it — a half-abandoned intent cannot fire later', async () => {
    await mount(makeCapture('cap-1'));
    await act(async () => { button('Remove voice clip').click(); });
    await act(async () => { button('Replace voice clip').click(); });
    expect(attachCalls).toEqual(['cap-1']);
    // Back to the safe label, so the next click on it arms rather than destroys.
    expect(button('Remove voice clip')).not.toBeNull();
    await act(async () => { button('Remove voice clip').click(); });
    expect(removeAudioCalls, 'a stale arm fired on a different intent').toEqual([]);
  });

  it('selecting a different sentence disarms it', async () => {
    await mount(makeCapture('cap-1'));
    await act(async () => { button('Remove voice clip').click(); });
    await rerender(makeCapture('cap-2'));
    expect(button('Remove voice clip')).not.toBeNull();
    await act(async () => { button('Remove voice clip').click(); });
    expect(removeAudioCalls, 'the arm carried across captures').toEqual([]);
  });

  it('the whole-capture Remove still arms too — this fix did not disturb it', async () => {
    await mount(makeCapture('cap-1'));
    await act(async () => { button('Remove sentence').click(); });
    expect(button('Confirm remove')).not.toBeNull();
  });
});
