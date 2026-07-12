// Renderer-side manager for offline translation via Qwen3 in the main process.
// One shared model serves the Translate view, readers, media subtitles, and
// Anki mining field translation.

export interface ModelProgress {
  status?: string;
  file?: string;
  progress?: number;
}

export type TranslateLang = 'ja' | 'zh';
/** Any BCP-47-ish language code; Qwen handles arbitrary pairs. */
export type TransLang = string;

let nextId = 1;
let modelProgressCb: ((p: ModelProgress) => void) | null = null;
let modelProgressHooked = false;
const partialListeners = new Set<(p: { id: number; progress: number }) => void>();

function ensureIpcHooks(): void {
  if (modelProgressHooked) return;
  modelProgressHooked = true;
  window.api.onTranslateModelProgress((p) => modelProgressCb?.(p));
  window.api.onTranslatePartial((p) => {
    for (const cb of partialListeners) cb(p);
  });
}

/** Register a callback for model-load progress (first use only). */
export function onModelProgress(cb: ((p: ModelProgress) => void) | null): void {
  ensureIpcHooks();
  modelProgressCb = cb;
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
 */
export function translateTo(
  text: string,
  source: TransLang,
  target: TransLang,
  onProgress?: (p: number) => void,
): Promise<string> {
  ensureIpcHooks();
  const id = nextId++;
  const onPartial = (p: { id: number; progress: number }): void => {
    if (p.id === id) onProgress?.(p.progress);
  };
  partialListeners.add(onPartial);
  return window.api
    .translateRun({ id, text, source, target })
    .then((res) => {
      if (!res.ok) throw new Error(res.error ?? 'Translation failed.');
      return res.text ?? '';
    })
    .finally(() => partialListeners.delete(onPartial));
}
