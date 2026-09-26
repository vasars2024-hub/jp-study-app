// @vitest-environment jsdom
/**
 * The one "Make a sentence deck" dialog, as a user drives it: it opens on the
 * video's study track with the helper track on the back, previews what Make
 * will write (and why the rest was left out) before anything is written, the
 * options change that preview, Make cuts and files the deck, Undo takes it
 * back, and "Listen now" hands the new folder to Flashcards as an audio-first
 * sitting. A video with no text at all offers Whisper instead of a dead end.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import type { SentenceDeckCue, SentenceDeckSources } from '../../shared/sentenceDeck';
import { loadDeck } from '../flashcardDeck';
import { takeFlashcardsFocus } from '../openIntents';
import { SentenceDeckDialog, parseClock, type SentenceDeckRequest } from '../components/sentenceDeck/SentenceDeckDialog';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIDEO = 'E:/anime/[Group] Yuru Camp - 01 (1080p).mkv';
const JA = `sidecar:E:/anime/[Group] Yuru Camp - 01 (1080p).ja.srt`;
const EN = `sidecar:E:/anime/[Group] Yuru Camp - 01 (1080p).en.srt`;
const JA_CUES: SentenceDeckCue[] = [
  { startMs: 0, endMs: 2000, text: '♪ オープニング' },
  { startMs: 3000, endMs: 5000, text: 'おはようございます。' },
  { startMs: 6000, endMs: 8000, text: '散歩に行きませんか？' },
  { startMs: 9000, endMs: 9400, text: 'え？' },
  { startMs: 12_000, endMs: 14_000, text: '（拍手）' },
];
const EN_CUES: SentenceDeckCue[] = [{ startMs: 3000, endMs: 5000, text: 'Good morning.' }];

let sources: SentenceDeckSources;
let host: HTMLDivElement;
let root: Root;
let closed = 0;
let queued: unknown[] = [];

function api(): Record<string, unknown> {
  return {
    sentenceDeckSources: async () => sources,
    sentenceDeckReadTrack: async (_video: string, id: string) => ({
      ok: true,
      cues: id === JA ? JA_CUES : id === EN ? EN_CUES : [],
    }),
    onSentenceDeckProgress: () => () => undefined,
    sentenceDeckExtractAudio: async (request: { clips: Array<{ id: string }> }) => ({
      ok: true,
      cancelled: false,
      results: request.clips.map((clip) => ({ id: clip.id, ok: true, audioPath: `C:/ud/mined/${clip.id}.mp3`, durationSec: 2.4 })),
    }),
    sentenceDeckCancel: async () => true,
    addMediaPaths: async (paths: string[]) => paths.map((path) => ({ id: 'new-id', path })),
    enqueueTranscription: async (request: unknown) => { queued.push(request); return { ok: true }; },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function open(request: SentenceDeckRequest = { videoPath: VIDEO }): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<SentenceDeckDialog request={request} onClose={() => { closed += 1; }} />);
  });
  await flush();
}

const q = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
};
const planCount = (): number => Number(q('[data-sd-plan-count]').getAttribute('data-sd-plan-count'));
const byText = (text: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>('button, label')].find((el) => el.textContent?.includes(text));
  if (!found) throw new Error(`no control "${text}"`);
  return found;
};

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  closed = 0;
  queued = [];
  sources = {
    ok: true,
    videoPath: VIDEO,
    mediaId: 'm1',
    title: '[Group] Yuru Camp - 01 (1080p)',
    tracks: [
      { id: JA, label: 'Yuru Camp - 01.ja.srt', lang: 'ja', kind: 'sidecar' },
      { id: EN, label: 'Yuru Camp - 01.en.srt', lang: 'en', kind: 'sidecar' },
    ],
    primaryId: JA,
    secondaryId: EN,
  };
  (window as unknown as { api: unknown }).api = api();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
});

describe('SentenceDeckDialog', () => {
  it('previews the deck from the study track, names it after the episode, and says what it left out', async () => {
    await open();
    expect(q<HTMLInputElement>('[data-sd-field="deck-name"]').value).toBe('Yuru Camp - 01');
    expect(q<HTMLSelectElement>('[data-sd-field="primary"]').value).toBe(JA);
    expect(q<HTMLSelectElement>('[data-sd-field="secondary"]').value).toBe(EN);
    // The opening song and the applause are not dialogue; "え？" is merged into nothing
    // (no neighbour within the gap) and is too short on its own.
    expect(planCount()).toBe(2);
    const preview = q('.sd-preview').textContent ?? '';
    expect(preview).toContain('おはようございます。');
    expect(preview).toContain('Good morning.');
    expect(preview).toMatch(/2 not dialogue/);
    expect(preview).toMatch(/1 too short/);
    // Nothing is written by looking.
    expect(loadDeck()).toHaveLength(0);
  });

  it('keeps focus in the deck-name field while it is typed in', async () => {
    await open();
    const input = q<HTMLInputElement>('[data-sd-field="deck-name"]');
    input.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setValue?.call(input, 'Yuru Camp - 01 (mine)');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('Yuru Camp - 01 (mine)');
    expect(document.activeElement).toBe(input);
  });

  it('changes the preview when an option changes', async () => {
    await open();
    await act(async () => { byText('Dialogue only').querySelector('input')?.click(); });
    // The song line is kept now; the applause-only line is kept as text too, but
    // has no study text once nothing strips it, so it still counts.
    expect(planCount()).toBeGreaterThan(2);
  });

  it('makes the deck, can undo it, and hands "Listen now" to Flashcards', async () => {
    await open();
    await act(async () => { q<HTMLButtonElement>('[data-sd-action="make"]').click(); });
    await flush();
    const status = q('[data-sd-added]');
    expect(status.getAttribute('data-sd-added')).toBe('2');
    expect(status.getAttribute('data-sd-folder')).toBe('Yuru Camp - 01');
    expect(loadDeck().map((card) => card.sentence).sort()).toEqual(['おはようございます。', '散歩に行きませんか？'].sort());
    expect(loadDeck().every((card) => card.audioPath && card.textProvenance === 'human-subs')).toBe(true);

    await act(async () => { q<HTMLButtonElement>('[data-sd-action="listen"]').click(); });
    expect(closed).toBe(1);
    expect(takeFlashcardsFocus()).toEqual({ folder: 'Yuru Camp - 01', cardId: null, review: 'listening' });
  });

  it('undoes the whole batch', async () => {
    await open();
    await act(async () => { q<HTMLButtonElement>('[data-sd-action="make"]').click(); });
    await flush();
    await act(async () => { q<HTMLButtonElement>('[data-sd-action="undo"]').click(); });
    expect(loadDeck()).toHaveLength(0);
    expect(document.body.textContent).toContain('Removed 2 cards.');
  });

  it('starts from the track the player is showing when opened from the player', async () => {
    await open({
      videoPath: VIDEO,
      playerTrack: { label: 'Japanese', cues: [{ startMs: 1000, endMs: 3000, text: '行ってきます。' }] },
    });
    expect(q<HTMLSelectElement>('[data-sd-field="primary"]').value).toBe('player');
    expect(planCount()).toBe(1);
  });

  it('offers Whisper when the video has no text at all, adding it to the library first', async () => {
    sources = { ok: true, videoPath: VIDEO, title: 'x', tracks: [] };
    await open();
    await act(async () => { byText('Transcribe with Whisper').click(); });
    await flush();
    expect(queued).toEqual([{
      mediaId: 'new-id',
      lang: 'ja',
      cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
    }]);
    expect(document.body.textContent).toContain('Transcription queued');
  });

  it('says the Whisper model downloads first, with its size, only when it is not here yet', async () => {
    sources = { ok: true, videoPath: VIDEO, title: 'x', tracks: [] };
    await open();
    expect(q('[data-sd-model-download]').textContent).toMatch(/downloads first.*\d+(\.\d)? MB/);
    await act(async () => { root.unmount(); });
    host.remove();
    // The study language's default tier, downloaded for the backend in use.
    const { loadWhisperModelTier } = await import('../whisperSettings');
    const { markTierDownloaded } = await import('../whisperModelCache');
    markTierDownloaded(loadWhisperModelTier('ja'), 'wasm', 'cpu');
    localStorage.setItem('jp-study-whisper-device', 'cpu');
    await open();
    expect(document.querySelector('[data-sd-model-download]')).toBeNull();
  });

  it('says why when there is no video to cut', async () => {
    sources = { ok: false, reasonKey: 'sentenceDeck.error.noVideoForSubtitle', tracks: [] };
    await open({ subtitlePath: 'E:/x/Lonely.ja.srt' });
    expect(document.body.textContent).toContain('No video with a matching name');
  });
});

describe('parseClock', () => {
  it('reads m:ss, h:mm:ss and seconds, and refuses anything else', () => {
    expect(parseClock('1:05')).toBe(65_000);
    expect(parseClock('01:02:05')).toBe(3_725_000);
    expect(parseClock('90')).toBe(90_000);
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('')).toBeNull();
  });
});
