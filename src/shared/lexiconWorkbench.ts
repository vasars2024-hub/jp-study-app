// Shared contracts for the Lexicon Workbench migration.
//
// Dictionary and Translate remain compatibility routes for now. Keeping their
// alias resolution and input classification here lets the eventual Workbench
// route consume one deterministic contract without changing the desktop shell
// or either existing view in the middle of a dirty-tree reconciliation.

import { hasHan, hasKana } from './langs';

export const LEXICON_WORKBENCH_ROUTE = 'lexicon' as const;

export type LexiconRoute = typeof LEXICON_WORKBENCH_ROUTE;
export type LegacyLexiconRoute = 'dictionary' | 'translate';
export type LexiconLens = 'lookup' | 'translate' | 'analysis';
export type LexiconLensOverride = 'auto' | LexiconLens;

export interface LexiconRouteResolution {
  route: LexiconRoute;
  /** `auto` is the canonical Workbench route; aliases pin their legacy lens. */
  lens: LexiconLensOverride;
  compatibilityAlias?: LegacyLexiconRoute;
}

export const LEXICON_COMPATIBILITY_ALIASES = {
  dictionary: { route: LEXICON_WORKBENCH_ROUTE, lens: 'lookup' },
  translate: { route: LEXICON_WORKBENCH_ROUTE, lens: 'translate' },
} as const satisfies Record<LegacyLexiconRoute, { route: LexiconRoute; lens: LexiconLens }>;

/**
 * Resolve the old Dictionary and Translate route ids into the future Workbench.
 * The canonical route is accepted alongside its descriptive spelling so links
 * written during the migration do not become another compatibility problem.
 */
export function resolveLexiconRoute(value: string): LexiconRouteResolution | null {
  const route = value.trim().toLowerCase();
  if (route === LEXICON_WORKBENCH_ROUTE || route === 'lexicon-workbench') {
    return { route: LEXICON_WORKBENCH_ROUTE, lens: 'auto' };
  }

  if (route === 'dictionary' || route === 'translate') {
    const alias = route as LegacyLexiconRoute;
    return {
      ...LEXICON_COMPATIBILITY_ALIASES[alias],
      compatibilityAlias: alias,
    };
  }

  return null;
}

export type LexiconInputKind = 'empty' | 'character' | 'word' | 'sentence' | 'paragraph' | 'document';

export interface LexiconInputResolution {
  text: string;
  kind: LexiconInputKind;
  lens: LexiconLens;
  automatic: boolean;
}

/** Normalize user-entered text without collapsing paragraph boundaries. */
export function normalizeLexiconText(text: string): string {
  return text.replace(/\r\n?/g, '\n').normalize('NFKC').trim();
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

function sentenceBoundaryCount(text: string): number {
  return text.match(/[.!?。！？]+/gu)?.length ?? 0;
}

function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean).length;
}

function looksLikeUnpunctuatedCjkSentence(text: string): boolean {
  // Japanese and Chinese learners commonly paste a sentence without terminal
  // punctuation. A particle plus a moderately long CJK span is a useful,
  // conservative signal while short lexical compounds stay lookup-friendly.
  return (
    (hasKana(text) || hasHan(text)) &&
    codePointLength(text) >= 8 &&
    /[はがをにでとへも]/u.test(text)
  );
}

function looksLikeSingleLexicalUnit(text: string): boolean {
  if (/\n/u.test(text) || /[.!?。！？]/u.test(text)) return false;
  const tokens = text.split(/\s+/u).filter(Boolean);
  return tokens.length <= 3 && codePointLength(text) <= 80;
}

/**
 * Select a scale before a lookup starts. This is intentionally a heuristic,
 * not a language model: it is deterministic, cheap, and safe to run on every
 * keystroke. Manual lens selection remains available for ambiguous text.
 */
export function classifyLexiconInput(text: string): LexiconInputKind {
  const normalized = normalizeLexiconText(text);
  if (!normalized) return 'empty';

  if (codePointLength(normalized) === 1 && !/[\s\p{P}\p{S}]/u.test(normalized)) {
    return 'character';
  }

  const lines = normalized.split('\n').filter(Boolean);
  const paragraphs = paragraphCount(normalized);
  const boundaries = sentenceBoundaryCount(normalized);
  const size = codePointLength(normalized);

  if (size > 2_000 || paragraphs >= 3 || lines.length >= 8) return 'document';
  if (normalized.includes('\n') || paragraphs > 1 || boundaries >= 2 || size > 280) return 'paragraph';
  if (boundaries >= 1 || looksLikeUnpunctuatedCjkSentence(normalized)) return 'sentence';
  if (looksLikeSingleLexicalUnit(normalized)) return 'word';
  return 'sentence';
}

function defaultLens(kind: LexiconInputKind): LexiconLens {
  return kind === 'empty' || kind === 'character' || kind === 'word' ? 'lookup' : 'translate';
}

/** Resolve automatic scale selection, or honor an explicit Workbench lens. */
export function resolveLexiconInput(
  text: string,
  override: LexiconLensOverride = 'auto',
): LexiconInputResolution {
  const normalized = normalizeLexiconText(text);
  const kind = classifyLexiconInput(normalized);
  const automatic = override === 'auto';
  return {
    text: normalized,
    kind,
    lens: automatic ? defaultLens(kind) : override,
    automatic,
  };
}
