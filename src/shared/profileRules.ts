/**
 * Ordered if-match → profileId rules for mining.
 * First enabled matching rule wins; otherwise the active profile is used.
 */

import type { ExtensionContentCategory } from './extensionCapture';

export type MineSource = 'extension' | 'epub' | 'audio' | 'reader' | 'dictionary' | 'other';
export type MineCardKind = 'word' | 'sentence';
export type MineLanguage = 'ja' | 'zh' | 'ru' | 'unknown';
/** Page content category for extension mines (optional rule dimension). */
export type MineCategory = ExtensionContentCategory;

export interface ProfileRuleMatch {
  /** Omit or 'any' = ignore this dimension. */
  source?: MineSource | 'any';
  cardKind?: MineCardKind | 'any';
  language?: MineLanguage | 'any';
  /** Extension page category (news / novel / …). Omit or 'any' = ignore. */
  category?: MineCategory | 'any';
}

export interface ProfileRule {
  id: string;
  enabled: boolean;
  /** Human label for settings UI. */
  label: string;
  match: ProfileRuleMatch;
  profileId: string;
}

export interface ProfileRuleContext {
  source: MineSource;
  cardKind: MineCardKind;
  language: MineLanguage;
  /** When omitted, category-constrained rules do not match. */
  category?: MineCategory;
}

export interface ProfileRulesStore {
  schemaVersion: 1;
  rules: ProfileRule[];
}

export const EMPTY_PROFILE_RULES: ProfileRulesStore = {
  schemaVersion: 1,
  rules: [],
};

export const MINE_CATEGORIES: readonly MineCategory[] = [
  'news',
  'novel',
  'manga',
  'youtube',
  'article',
  'other',
];

function dimMatches<T extends string>(want: T | 'any' | undefined, have: T): boolean {
  if (want == null || want === 'any') return true;
  return want === have;
}

export function ruleMatches(rule: ProfileRule, ctx: ProfileRuleContext): boolean {
  if (!rule.enabled) return false;
  const m = rule.match || {};
  if (!dimMatches(m.source, ctx.source)) return false;
  if (!dimMatches(m.cardKind, ctx.cardKind)) return false;
  if (!dimMatches(m.language, ctx.language)) return false;
  // Category is optional on the context: if the rule constrains it, require a value.
  if (m.category != null && m.category !== 'any') {
    if (ctx.category == null || ctx.category !== m.category) return false;
  }
  return true;
}

export interface ResolveProfileResult {
  profileId: string;
  matchedRule?: ProfileRule;
  usedDefault: boolean;
}

/** First matching enabled rule, else defaultProfileId. */
export function resolveProfileMatch(
  rules: ProfileRule[] | undefined,
  ctx: ProfileRuleContext,
  defaultProfileId: string,
): ResolveProfileResult {
  const list = Array.isArray(rules) ? rules : [];
  for (const rule of list) {
    if (ruleMatches(rule, ctx) && typeof rule.profileId === 'string' && rule.profileId.trim()) {
      return {
        profileId: rule.profileId.trim(),
        matchedRule: rule,
        usedDefault: false,
      };
    }
  }
  return { profileId: defaultProfileId, usedDefault: true };
}

/** First matching enabled rule's profileId, else defaultProfileId. */
export function resolveProfileId(
  rules: ProfileRule[] | undefined,
  ctx: ProfileRuleContext,
  defaultProfileId: string,
): string {
  return resolveProfileMatch(rules, ctx, defaultProfileId).profileId;
}

/** Routing hints supplied by a mining caller (all optional). */
export interface MineRoute {
  source?: MineSource;
  cardKind?: MineCardKind;
  /** Omit to auto-detect from text; 'unknown' is treated as "please detect". */
  language?: MineLanguage;
  category?: MineCategory;
}

export interface BuildRouteContextOpts {
  /** Sample text for language auto-detection when route.language is absent. */
  text?: string;
  /** Fallback language when detection is inconclusive (e.g. active profile targetLang). */
  fallbackLanguage?: MineLanguage;
}

/**
 * Turn a caller's optional routing hints into a full ProfileRuleContext,
 * filling sensible defaults (source→other, cardKind→word) and resolving the
 * language via explicit hint → text heuristic → fallback → 'unknown'. Pure.
 */
export function buildRouteContext(
  route: MineRoute | undefined,
  opts: BuildRouteContextOpts = {},
): ProfileRuleContext {
  const r = route || {};
  let language: MineLanguage =
    r.language && r.language !== 'unknown' ? r.language : detectMineLanguage(opts.text || '');
  if (language === 'unknown' && opts.fallbackLanguage && opts.fallbackLanguage !== 'unknown') {
    language = opts.fallbackLanguage;
  }
  return {
    source: r.source || 'other',
    cardKind: r.cardKind || 'word',
    language,
    category: r.category && r.category !== 'any' ? r.category : undefined,
  };
}

/** True when a rule leaves every dimension open (matches every mined card). */
export function ruleMatchesEverything(rule: ProfileRule): boolean {
  const m = rule.match || {};
  const open = (v: string | undefined) => v == null || v === 'any';
  return open(m.source) && open(m.cardKind) && open(m.language) && open(m.category);
}

function dimSupersets<T extends string>(a: T | 'any' | undefined, b: T | 'any' | undefined): boolean {
  // `a` covers everything `b` requires when a ignores the dimension, or pins the same value.
  if (a == null || a === 'any') return true;
  return a === b;
}

/** True when rule `a` matches every context that rule `b` matches. */
export function ruleSupersetOf(a: ProfileRule, b: ProfileRule): boolean {
  return (
    dimSupersets(a.match.source, b.match.source) &&
    dimSupersets(a.match.cardKind, b.match.cardKind) &&
    dimSupersets(a.match.language, b.match.language) &&
    dimSupersets(a.match.category, b.match.category)
  );
}

/**
 * Index of the first earlier enabled rule that makes `rules[index]` unreachable
 * (an earlier rule that is a superset always wins first), or -1 if reachable.
 */
export function firstShadowingRuleIndex(rules: ProfileRule[], index: number): number {
  const target = rules[index];
  if (!target || !target.enabled) return -1;
  for (let i = 0; i < index; i += 1) {
    const earlier = rules[i];
    if (earlier && earlier.enabled && ruleSupersetOf(earlier, target)) return i;
  }
  return -1;
}

/** Heuristic language from mined text (CJK / Cyrillic). */
export function detectMineLanguage(text: string): MineLanguage {
  const s = String(text || '');
  if (/[\u0400-\u04FF]/.test(s)) return 'ru';
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(s) && !/[\u3040-\u30FF]/.test(s)) return 'zh';
  if (/[\u3040-\u30FF\u4E00-\u9FFF]/.test(s)) return 'ja';
  return 'unknown';
}

function normalizeCategory(raw: unknown): MineCategory | 'any' {
  if (raw === 'any') return 'any';
  if (
    raw === 'news' ||
    raw === 'novel' ||
    raw === 'manga' ||
    raw === 'youtube' ||
    raw === 'article' ||
    raw === 'other'
  ) {
    return raw;
  }
  return 'any';
}

export function normalizeProfileRulesStore(raw: unknown): ProfileRulesStore {
  const base: ProfileRulesStore = { schemaVersion: 1, rules: [] };
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<ProfileRulesStore>;
  const rulesIn = Array.isArray(obj.rules) ? obj.rules : [];
  const rules: ProfileRule[] = [];
  for (const r of rulesIn) {
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `rule-${rules.length + 1}`;
    const profileId = typeof r.profileId === 'string' ? r.profileId.trim() : '';
    if (!profileId) continue;
    rules.push({
      id,
      enabled: r.enabled !== false,
      label: typeof r.label === 'string' && r.label.trim() ? r.label.trim() : id,
      profileId,
      match: {
        source:
          r.match?.source === 'extension' ||
          r.match?.source === 'epub' ||
          r.match?.source === 'audio' ||
          r.match?.source === 'reader' ||
          r.match?.source === 'dictionary' ||
          r.match?.source === 'other' ||
          r.match?.source === 'any'
            ? r.match.source
            : 'any',
        cardKind:
          r.match?.cardKind === 'word' || r.match?.cardKind === 'sentence' || r.match?.cardKind === 'any'
            ? r.match.cardKind
            : 'any',
        language:
          r.match?.language === 'ja' ||
          r.match?.language === 'zh' ||
          r.match?.language === 'ru' ||
          r.match?.language === 'unknown' ||
          r.match?.language === 'any'
            ? r.match.language
            : 'any',
        category: normalizeCategory(r.match?.category),
      },
    });
  }
  return { schemaVersion: 1, rules };
}
