/**
 * Dev-only harness for the Phase 6 Study Mode surface, so the panel can actually be
 * LOOKED AT without Electron. Follows mangaReaderHarness.tsx's pattern.
 *
 *   npx vite --config vite.renderer.config.ts --port 5174
 *   → http://127.0.0.1:5174/src/renderer/__devharness__/study-library-harness.html
 *
 * `?state=` picks the scenario, because the states that matter most are the ones that are
 * hard to reach in the real app:
 *   populated (default) · empty · offline · anki-down · scored
 *   analyse-queued · analyse-failure  (the two non-obvious outcomes of the analyse action)
 *
 * `empty` and `offline` are not hypotheticals — the user's real Seanime profile has an
 * empty library (docs/migration/proof/phase6-join-20260730/), so those are the two states
 * they would actually see first.
 *
 * Not imported by the app and not in the production build — `vite build` emits index.html
 * only.
 */
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import SeanimeStudyLibraryPanel from '../components/reading/SeanimeStudyLibraryPanel';
import '../styles.css';

const scenario = new URLSearchParams(location.search).get('state') ?? 'populated';

const FILES = [
  { path: 'C:\\Anime\\Frieren\\Sousou no Frieren - 01.mkv', mediaId: 154587, episode: 1 },
  { path: 'C:\\Anime\\Frieren\\Sousou no Frieren - 02.mkv', mediaId: 154587, episode: 2 },
  { path: 'C:\\Anime\\Frieren\\Sousou no Frieren - 03.mkv', mediaId: 154587, episode: 3 },
  { path: 'C:\\Anime\\The Big O\\The Big O - 01 [BDRip 1440x1080 x265 FLAC].mkv', mediaId: 329, episode: 1 },
  { path: 'C:\\Anime\\The Big O\\The Big O - 02 [BDRip 1440x1080 x265 FLAC].mkv', mediaId: 329, episode: 2 },
  { path: 'C:\\Anime\\Unimported\\Never seen this one.mkv', mediaId: 999, episode: 1 },
].map((file, index) => ({
  ...file,
  title: index < 3 ? 'Sousou no Frieren' : index < 5 ? 'The Big O' : undefined,
}));

const jaSub = { id: 'sub-ja', lang: 'ja', source: 'embedded', format: 'srt', path: 's.srt' };

/** Mirrors the real distribution: mostly missing subtitles, one analysable, one unlinked. */
const MEDIA = FILES.slice(0, 5).map((file, index) => ({
  id: `study-${index}`,
  title: `${file.title} ${String(file.episode).padStart(2, '0')}`,
  path: file.path,
  fileName: file.path.split('\\').pop(),
  addedAt: index,
  subtitles: index === 0 ? [jaSub] : [],
}));

const api = {
  seanimeStudyLibrary: async () => (
    scenario === 'offline'
      ? { ok: false, error: 'Seanime sidecar is stopped.' }
      : { ok: true, files: scenario === 'empty' ? [] : FILES }
  ),
  listMedia: async () => MEDIA,
  addMediaPaths: async () => MEDIA,
  ankiStatus: async () => (
    scenario === 'anki-down'
      ? { connected: false, decks: [], models: [], error: 'AnkiConnect is not responding on port 8765.' }
      : { connected: true, decks: ['JP Study::Immersion', 'StudyOS::Sentences'], models: [] }
  ),
  profileRulesGet: async () => ({
    schemaVersion: 2,
    rules: scenario === 'scored'
      ? [{ id: 'r1', enabled: true, label: 'Immersion subtitles', match: { source: 'subtitle' }, profileId: 'ja-immersion' }]
      : [],
  }),
};
(window as unknown as { api: typeof api }).api = api;

/**
 * A stand-in for `prepareStudyMediaById`, shaped to the same signature the real one has.
 *
 * The harness supplies the analyse action for the same reason it supplies `api`: the panel
 * offers the capability and never reaches for it, so without an injected action the button
 * does not exist and cannot be looked at. `?state=analyse-queued` drives the other outcome
 * — no Japanese subtitle, so the work goes to the transcription queue instead — which is
 * the branch a reader is most likely to assume is a failure path.
 */
const analyse = async (): Promise<
  { status: 'prepared'; candidateCount: number } | { status: 'queued-transcription' }
> => {
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (scenario === 'analyse-failure') throw new Error('The tokenizer is not available.');
  return scenario === 'analyse-queued'
    ? { status: 'queued-transcription' }
    : { status: 'prepared', candidateCount: 137 };
};

createRoot(document.getElementById('root') as HTMLElement).render(
  createElement(SeanimeStudyLibraryPanel, { onAnalyse: analyse }),
);
