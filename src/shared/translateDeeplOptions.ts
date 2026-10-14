/**
 * DeepL's two request options the Translate workbench exposes: formality and context.
 *
 *  - `formality`: DeepL renders the target more or less formally — です/ます against plain
 *    form into Japanese, вы against ты into Russian, Sie against du into German. It is sent as
 *    `prefer_more` / `prefer_less`, the variants DeepL documents as "use it where the target
 *    language supports it, otherwise ignore it", so English or Chinese output (no formality)
 *    translates normally instead of failing with HTTP 400.
 *  - `context`: text DeepL reads to choose words but does not translate or bill — "dialogue from
 *    a school anime", "a cooking recipe". The learner writes it once; it goes with every DeepL
 *    request, and the engine bar says so beside the box.
 *
 * Main owns the stored copy (`translateRouter.ts`, `translate/deepl-options.json`) and reads it
 * at send time; the renderer only shows and edits it.
 */

export type DeeplFormality = 'default' | 'more' | 'less';

export interface DeeplOptions {
  formality: DeeplFormality;
  /** Sent as DeepL's `context`. Empty = not sent. */
  context: string;
}

export const DEEPL_FORMALITIES: readonly DeeplFormality[] = ['default', 'more', 'less'];

/** Long enough for a paragraph of background; DeepL bills none of it. */
export const DEEPL_CONTEXT_MAX_CHARS = 1_000;

export const DEFAULT_DEEPL_OPTIONS: DeeplOptions = { formality: 'default', context: '' };

export function normalizeDeeplOptions(raw: unknown): DeeplOptions {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DEEPL_OPTIONS };
  const value = raw as { formality?: unknown; context?: unknown };
  const formality = DEEPL_FORMALITIES.includes(value.formality as DeeplFormality)
    ? value.formality as DeeplFormality
    : 'default';
  const context = typeof value.context === 'string'
    ? value.context.replace(/\r\n?/g, '\n').trim().slice(0, DEEPL_CONTEXT_MAX_CHARS)
    : '';
  return { formality, context };
}

/** The fields these options add to a `/v2/translate` body (none for the defaults). */
export function deeplRequestFields(options: DeeplOptions): { formality?: string; context?: string } {
  return {
    ...(options.formality !== 'default' ? { formality: `prefer_${options.formality}` } : {}),
    ...(options.context ? { context: options.context } : {}),
  };
}

/**
 * The part of a cached DeepL answer's key these options make up: the same passage asked for
 * formally and informally is two different translations.
 */
export function deeplOptionsCacheVariant(options: DeeplOptions): string {
  return options.formality === 'default' && !options.context
    ? ''
    : `deepl:${options.formality}:${options.context}`;
}
