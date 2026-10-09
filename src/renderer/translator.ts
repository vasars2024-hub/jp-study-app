// Renderer-side manager for offline translation via Qwen3 in the main process.
// One shared model serves the Translate view, readers, media subtitles, and
// Anki mining field translation.

import {
  sanitizeTranslateSegments,
  type TranslateSegment,
  type TranslateSenseHint,
  type TranslateStyle,
} from '../shared/translateCore';
import { t } from './i18n';

export interface ModelProgress {
  status?: string;
  file?: string;
  progress?: number;
}

export type TranslateLang = 'ja' | 'zh' | 'ru';
/** Any BCP-47-ish language code; Qwen handles arbitrary pairs. */
export type TransLang = string;

let nextId = 1;
let modelProgressHooked = false;
const modelProgressListeners = new Set<(p: ModelProgress) => void>();
const partialListeners = new Set<(p: { id: number; progress: number }) => void>();

function ensureIpcHooks(): void {
  if (modelProgressHooked) return;
  modelProgressHooked = true;
  window.api.onTranslateModelProgress((p) => {
    // Copied before iterating: a listener that unsubscribes itself on `ready` mutates this set
    // mid-broadcast, and the next listener would be skipped.
    for (const cb of [...modelProgressListeners]) cb(p);
  });
  window.api.onTranslatePartial((p) => {
    for (const cb of partialListeners) cb(p);
  });
}

/**
 * Subscribe to model-load progress. Returns the unsubscribe.
 *
 * This was ONE global slot until 2026-08-24, and the single slot was a real defect on a surface
 * where two consumers coexist: the Translate view, `SentenceTranslatePopup` and
 * `ReaderCollectionPanel` all register while a 15 s Qwen3 load is in flight. Whoever registered
 * last took the progress away from the others, and the first one to finish called
 * `onModelProgress(null)` and took it away from everyone — including a load still running, which
 * then sat at a frozen "Loading model…" with no percentage. `DictionaryResults.tsx` had already
 * routed around it by subscribing to the preload binding directly, with a comment naming this
 * exact hazard; the fix belongs here instead, so no further caller has to know.
 *
 * Same shape as `partialListeners` two lines up, which was always a Set.
 */
export function onModelProgress(cb: (p: ModelProgress) => void): () => void {
  ensureIpcHooks();
  modelProgressListeners.add(cb);
  let off = false;
  return () => {
    if (off) return;
    off = true;
    modelProgressListeners.delete(cb);
  };
}

/** Translate Japanese/Chinese → English offline. `onProgress` reports 0..1 per sentence. */
export function translate(
  text: string,
  lang: TranslateLang = 'ja',
  onProgress?: (p: number) => void,
): Promise<string> {
  return translateTo(text, lang, 'en', onProgress);
}

/**
 * Translate `text` from `source` to `target` offline via Qwen3. Any language
 * pair is handled directly (no English pivot). `onProgress` reports 0..1.
 *
 * `senseHints` are the reader's own pinned word senses. They are optional and
 * omitted entirely when absent, so every existing caller sends the exact
 * request it sent before sense pinning existed.
 */
export interface TranslateRunOptions {
  /** `literal` asks for the structure-preserving rendering. Omitted = natural. */
  style?: TranslateStyle;
  /** Receives the sentence pairs when main reports them (the aligned view). */
  onSegments?: (segments: TranslateSegment[]) => void;
}

export function translateTo(
  text: string,
  source: TransLang,
  target: TransLang,
  onProgress?: (p: number) => void,
  senseHints?: readonly TranslateSenseHint[],
  options?: TranslateRunOptions,
): Promise<string> {
  ensureIpcHooks();
  const id = nextId++;
  const onPartial = (p: { id: number; progress: number }): void => {
    if (p.id === id) onProgress?.(p.progress);
  };
  partialListeners.add(onPartial);
  return window.api
    .translateRun({
      id,
      text,
      source,
      target,
      ...(senseHints?.length ? { senseHints: [...senseHints] } : {}),
      // Only sent when it changes the prompt, so every existing request is unchanged.
      ...(options?.style === 'literal' ? { style: 'literal' as const } : {}),
    })
    .then((res) => {
      // Errors main words itself arrive with a catalog key and are said in the UI language.
      if (!res.ok) throw new Error(res.errorKey ? t(res.errorKey) : res.error ?? t('translate.error.failed'));
      const segments = sanitizeTranslateSegments(res.segments);
      if (segments) options?.onSegments?.(segments);
      return res.text ?? '';
    })
    .finally(() => partialListeners.delete(onPartial));
}
