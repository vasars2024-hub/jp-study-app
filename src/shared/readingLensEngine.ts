/**
 * The Reading Lens's OCR engine default, and the honest answer to "where does
 * my screen go when I scan it?".
 *
 * Two things live here because they are one question asked twice. The engine
 * choice decides *which* recognizer reads the crop; the processing fact decides
 * *where* that reading happens. Both are answered from the same table so a new
 * engine cannot be added without stating its processing location — the failure
 * mode this module exists to prevent is a cloud recognizer arriving later and
 * inheriting an "on this device" label nobody re-checked.
 *
 * Today every engine is on-device: `main/mangaOcr.ts` and `main/paddleOcr.ts`
 * both run ONNX sessions through `onnxruntime-node` over model files installed
 * under the app's own asset directory, and neither recognition path opens a
 * socket. The models are *downloaded* once, which is a network act — but that
 * is an install, not a per-capture upload, and the indicator says so rather
 * than eliding it.
 *
 * Scope, stated because an over-broad privacy claim is worse than none: this
 * describes RECOGNITION only. The lens's own "Ask the Agent" action hands the
 * recognised text (and optionally the crop) to whatever provider the Agent is
 * configured with, which may well be a cloud one. That is a separate, explicit
 * user gesture and is labelled where it is offered.
 */

/** The engine a scan may request. `auto` lets `ocrAuto` decide per crop. */
export type ReadingLensEngine = 'auto' | 'manga' | 'web';

/**
 * Offered in this order in the UI: the automatic pass first because it is the
 * only choice that cannot be wrong for the content, then the two forced ones.
 */
export const READING_LENS_ENGINE_CHOICES: readonly ReadingLensEngine[] = [
  'auto',
  'manga',
  'web',
] as const;

/**
 * `auto` is the default because a forced engine is wrong for half the screen:
 * manga-ocr letterboxes a whole speech bubble into one line and gives nonsense
 * on a paragraph, and the general recognizer splits a vertical bubble into
 * fragments. `auto` is also the only value that stays sensible when exactly one
 * of the two model sets is installed.
 */
export const READING_LENS_ENGINE_DEFAULT: ReadingLensEngine = 'auto';

/**
 * Where an engine's recognition actually runs.
 *
 * `device` means the pixels never leave this machine at capture time.
 * `network` is deliberately representable even though nothing uses it, so that
 * adding a cloud recognizer forces a value here rather than silently inheriting
 * the honest label.
 */
export type ReadingLensProcessing = 'device' | 'network';

export interface ReadingLensEngineFacts {
  /** Where recognition runs for this choice. */
  processing: ReadingLensProcessing;
  /** True when the engine needs model files installed before it can run. */
  needsModels: boolean;
}

export const READING_LENS_ENGINE_FACTS: Readonly<
  Record<ReadingLensEngine, ReadingLensEngineFacts>
> = {
  auto: { processing: 'device', needsModels: true },
  manga: { processing: 'device', needsModels: true },
  web: { processing: 'device', needsModels: true },
};

/**
 * True only when *every* engine recognises locally.
 *
 * Derived, never asserted: the indicator string this gates is a privacy claim,
 * and a claim computed from the table cannot drift away from the table the way
 * a hardcoded `true` would.
 */
export function readingLensOcrIsFullyOnDevice(): boolean {
  return READING_LENS_ENGINE_CHOICES.every(
    (engine) => READING_LENS_ENGINE_FACTS[engine].processing === 'device',
  );
}

/**
 * Coerce an unknown engine value to one the pipeline can honour.
 *
 * Falls back to the DEFAULT rather than to the nearest neighbour, for the same
 * reason retention does: `reading-lens.json` is user-writable and survives
 * across versions, so a value this build does not know is a value whose intent
 * this build cannot guess. Guessing "manga" for a typo would silently force the
 * wrong recognizer on every capture until someone noticed the text was wrong.
 */
export function normalizeReadingLensEngine(value: unknown): ReadingLensEngine {
  return READING_LENS_ENGINE_CHOICES.includes(value as ReadingLensEngine)
    ? (value as ReadingLensEngine)
    : READING_LENS_ENGINE_DEFAULT;
}

/** What main reports about the installed recognizers, for the settings surface. */
export interface ReadingLensEngineStatus {
  /** manga-ocr + comic-text-detector are installed. */
  manga: boolean;
  /** The general detector plus at least one language pack are installed. */
  web: boolean;
  /** Language codes the general recognizer can actually read today. */
  webLangs: readonly string[];
  /** True when no engine can run at all — every scan will refuse. */
  none: boolean;
}

/**
 * Whether a chosen default can actually run right now.
 *
 * `auto` is runnable when *either* engine is, because `ocrAuto` falls through to
 * whichever is installed. A forced engine needs its own models and nothing else
 * can stand in for it — which is exactly what the settings surface must say
 * before the user picks it, rather than after the next scan refuses.
 */
export function readingLensEngineRunnable(
  engine: ReadingLensEngine,
  status: ReadingLensEngineStatus,
): boolean {
  if (engine === 'manga') return status.manga;
  if (engine === 'web') return status.web;
  return status.manga || status.web;
}
