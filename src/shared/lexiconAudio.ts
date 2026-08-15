/**
 * Native pronunciation for a headword: the last v1 table that had no writer.
 *
 * `audio` shipped in the v1 schema with `provider`, `url` and `local_path`
 * columns and nothing has ever inserted a row. Meanwhile the app has had a
 * working native-audio provider since long before that table existed — but it
 * was reachable only from the Anki export path, where it fetched a clip, handed
 * it to Anki's media folder and forgot it. The Dictionary itself could not play
 * a word out loud, and every export re-paid the same network round trip.
 *
 * This module is the contract for both halves of the fix: the panel that plays a
 * word, and the cache row that makes the second play offline.
 *
 * ## What is and is not sent over the network
 *
 * A clip is fetched **only on an explicit play**, never with the lookup. The
 * request carries the word and its reading to the provider's CDN, so it is a
 * disclosure the user makes by clicking, not one a search makes for them. Once
 * cached, replay never touches the network again — which is also why a *negative*
 * answer is cached: without it, a word the provider has no recording for would
 * re-ask on every click forever.
 */

/**
 * Languages a provider exists for. Japanese only today.
 *
 * Exported as a list rather than an `=== 'ja'` at each call site so the surface
 * can decline to render a dead control for Chinese and Russian using the same
 * fact the main process uses to decline the fetch.
 */
export const LEXICON_AUDIO_LANGS = ['ja'] as const;

export type LexiconAudioLang = (typeof LEXICON_AUDIO_LANGS)[number];

export function supportsLexiconAudio(lang: string): lang is LexiconAudioLang {
  return (LEXICON_AUDIO_LANGS as readonly string[]).includes(lang);
}

/**
 * A word longer than this is not a headword a pronunciation provider indexes.
 *
 * Looser than the 16 the etymology and xref probes use: those are indexed
 * equalities against `headwords.norm`, while this bound only has to stop a
 * pasted paragraph from becoming a query string in an outbound URL.
 */
export const MAX_AUDIO_QUERY_CHARS = 32;

/** What a play attempt actually did, in the four shapes the surface must render. */
export type LexiconAudioStatus =
  /** A clip is attached and can be played. */
  | 'ready'
  /** The provider answered, and has no recording for this word. */
  | 'none'
  /** The network failed or timed out. The only status worth a retry. */
  | 'offline'
  /** No provider covers this language, or the query is not a word. */
  | 'unsupported';

export interface LexiconAudioClip {
  /** The provider that recorded it, shown as attribution beside the control. */
  provider: string;
  /** MIME type of `dataBase64`, so the surface does not have to guess a decoder. */
  mimeType: string;
  /** The clip itself. Real recordings are 1-3 KB, so this crosses IPC whole. */
  dataBase64: string;
  /** True when this play came off the disk cache rather than the network. */
  cached: boolean;
}

export interface LexiconAudioResult {
  query: string;
  status: LexiconAudioStatus;
  /** Present exactly when `status === 'ready'`. */
  clip?: LexiconAudioClip;
}

/** The word a clip belongs to, as the cache and the `audio` table both key it. */
export interface LexiconAudioIdentity {
  lang: LexiconAudioLang;
  /** The written form, verbatim — the provider matches on kanji, not on `norm`. */
  term: string;
  /** The kana reading. Equal to `term` when the lookup produced no separate one. */
  reading: string;
}

/**
 * Canonicalise a play request, or reject it.
 *
 * `null` is the `unsupported` status: an unsupported language, an empty word, or
 * something too long to be one. Doing this in shared code rather than in the
 * handler is what lets the panel decide whether to render a control at all
 * without duplicating the rule that the main process will apply anyway.
 *
 * NFC, because the cache key is a filename: macOS-style decomposed kana would
 * otherwise cache the same word twice and miss its own entry.
 */
export function normalizeAudioIdentity(input: {
  lang: string;
  term: string;
  reading?: string;
}): LexiconAudioIdentity | null {
  if (!supportsLexiconAudio(input.lang)) return null;
  const term = input.term.normalize('NFC').trim();
  if (!term || term.length > MAX_AUDIO_QUERY_CHARS) return null;
  const reading = (input.reading ?? '').normalize('NFC').trim();
  return {
    lang: input.lang,
    term,
    reading: reading && reading.length <= MAX_AUDIO_QUERY_CHARS ? reading : term,
  };
}

/**
 * The identity as one string, for hashing into a cache filename.
 *
 * A U+0001 separator rather than a printable one: it cannot occur in a headword, so
 * no pair of distinct words can collide by containing the delimiter themselves.
 */
export function audioCacheKey(identity: LexiconAudioIdentity): string {
  return `${identity.lang}\u0001${identity.term}\u0001${identity.reading}`;
}

/**
 * The provider's byte length and md5 for "we have no recording for this word".
 *
 * JapanesePod101 answers a miss with HTTP 200 and a fixed placeholder clip
 * instead of a 404, so the only way to tell a miss from a hit is to recognise
 * that clip. A size floor would be wrong in the other direction: genuine
 * recordings are *smaller* than the placeholder, around 1-3 KB.
 */
export const PLACEHOLDER_AUDIO_BYTES = 52288;
export const PLACEHOLDER_AUDIO_MD5 = '7e2c2f954ef6051373ba916f000168dc';

export function isPlaceholderAudio(byteLength: number, md5: string): boolean {
  return byteLength === PLACEHOLDER_AUDIO_BYTES || md5 === PLACEHOLDER_AUDIO_MD5;
}
