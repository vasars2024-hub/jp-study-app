/**
 * Visual novels 7.6: cleanup and filters for captured lines — the
 * texthooker-ui / LunaTranslator feature set. Pure; main applies the saved
 * filters to every hooked, copied or relayed line, the Capture settings preview
 * them. Its own module (not visualNovelStudy5) because the settings type in
 * visualNovel.ts embeds it, and visualNovelStudy5 reads visualNovel's types.
 */

/** `remove` deletes what the pattern matches; `drop` throws the whole line away. */
export type Vn5FilterMode = 'remove' | 'drop';

export interface Vn5FilterRule {
  pattern: string;
  mode: Vn5FilterMode;
  enabled: boolean;
}

export interface Vn5LineFilters {
  /** Collapse a texthooker's character repetition: `ここここんんににちちはは` -> `こんにちは`. */
  collapseRepeats: boolean;
  /** Strip inline furigana markup: `｜漢字《かんじ》`, `<rt>かんじ</rt>`, `[ruby text=…]`. */
  stripRuby: boolean;
  /** Skip a line that repeats one of the last few lines (a backlog scroll, a hook firing again). */
  dedupeRecent: boolean;
  /** The user's own regular expressions, applied in order. */
  rules: Vn5FilterRule[];
}

export const VN5_DEFAULT_LINE_FILTERS: Vn5LineFilters = {
  collapseRepeats: true,
  stripRuby: true,
  dedupeRecent: false,
  rules: [],
};

export const VN5_FILTER_RULE_MAX = 20;
export const VN5_FILTER_PATTERN_MAX = 200;
/** How many recent lines `dedupeRecent` compares against. */
export const VN5_DEDUPE_WINDOW = 6;

export function vn5NormalizeLineFilters(raw: unknown): Vn5LineFilters {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rules: Vn5FilterRule[] = [];
  if (Array.isArray(r.rules)) {
    for (const entry of r.rules) {
      if (!entry || typeof entry !== 'object') continue;
      const rule = entry as Record<string, unknown>;
      const pattern = typeof rule.pattern === 'string' ? rule.pattern.slice(0, VN5_FILTER_PATTERN_MAX) : '';
      if (!pattern) continue;
      rules.push({ pattern, mode: rule.mode === 'drop' ? 'drop' : 'remove', enabled: rule.enabled !== false });
      if (rules.length >= VN5_FILTER_RULE_MAX) break;
    }
  }
  return {
    collapseRepeats: r.collapseRepeats !== false,
    stripRuby: r.stripRuby !== false,
    dedupeRecent: r.dedupeRecent === true,
    rules,
  };
}

/** A rule's regular expression, or null when the pattern does not compile. */
export function vn5CompileRule(rule: Pick<Vn5FilterRule, 'pattern'>): RegExp | null {
  try {
    return new RegExp(rule.pattern, 'gu');
  } catch {
    return null;
  }
}

/**
 * Control characters, zero-width marks and stray replacement characters that
 * hookers leave in a line (and that break lookups and the deck's duplicate
 * check). Newlines and tabs stay; the text-box parser deals with them.
 */
export function vn5StripControlChars(text: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point.
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u2060-\u2064\ufeff\ufffd]/g, '');
}

/** Inline furigana markup out, the base text kept. */
export function vn5StripInlineRuby(text: string): string {
  return text
    // HTML ruby: drop the readings and parentheses, keep the base.
    .replace(/<r[tp]>[\s\S]*?<\/r[tp]>/gi, '')
    .replace(/<\/?(?:ruby|rb)>/gi, '')
    // KiriKiri / Tyrano style: [ruby text="かんじ"]漢字 -> 漢字
    .replace(/\[ruby\s+text\s*=\s*["']?[^\]"']*["']?\s*\]/gi, '')
    // Aozora style: ｜漢字《かんじ》 and 漢字《かんじ》
    .replace(/[｜|]([^｜|《》]+)《[^》]*》/g, '$1')
    // Without the ｜ marker, only a kana reading right after a kanji is furigana;
    // 《…》 as quotation marks (telepathy, titles) stays.
    .replace(/([\u3400-\u9fff々〆])《[\u3040-\u30ffー]+》/g, '$1');
}

/**
 * A line where every character arrived N times in a row (N = 2..4), the
 * classic texthooker repetition. Only collapsed when the whole line follows the
 * pattern and has at least three different characters, so `ああ` and
 * `はいはい` are left exactly as the game wrote them.
 */
export function vn5CollapseRepeats(text: string): string {
  const chars = [...text];
  for (let n = 4; n >= 2; n--) {
    if (chars.length < n * 3 || chars.length % n !== 0) continue;
    let ok = true;
    for (let i = 0; i < chars.length && ok; i += n) {
      for (let k = 1; k < n; k++) {
        if (chars[i + k] !== chars[i]) {
          ok = false;
          break;
        }
      }
    }
    if (!ok) continue;
    const collapsed = chars.filter((_, i) => i % n === 0);
    if (new Set(collapsed).size >= 3) return collapsed.join('');
  }
  // A whole sentence delivered two or more times back to back.
  const value = text.trim();
  for (let parts = 4; parts >= 2; parts--) {
    if (value.length % parts !== 0) continue;
    const unit = value.slice(0, value.length / parts);
    if (unit.length >= 4 && /[。！？!?」』…]$/.test(unit) && unit.repeat(parts) === value) return unit;
  }
  return text;
}

export interface Vn5CleanResult {
  text: string;
  dropped: boolean;
  /** Whether cleanup changed the text at all. */
  changed: boolean;
}

/**
 * One captured payload through the cleanup and the user's rules. `compiled`
 * lets a caller compile the rules once per session instead of once per line.
 */
export function vn5CleanLine(
  text: string,
  filters: Vn5LineFilters,
  compiled: readonly (RegExp | null)[] = filters.rules.map(vn5CompileRule),
): Vn5CleanResult {
  let out = vn5StripControlChars(text);
  if (filters.stripRuby) out = vn5StripInlineRuby(out);
  if (filters.collapseRepeats) out = vn5CollapseRepeats(out);
  for (let i = 0; i < filters.rules.length; i++) {
    const rule = filters.rules[i];
    const re = compiled[i];
    if (!rule.enabled || !re) continue;
    re.lastIndex = 0;
    if (rule.mode === 'drop') {
      if (re.test(out)) return { text: '', dropped: true, changed: true };
    } else {
      out = out.replace(re, '');
    }
  }
  out = out.trim();
  return { text: out, dropped: !out, changed: out !== text.trim() };
}

export interface Vn5FilterPreviewRow extends Vn5CleanResult {
  before: string;
}

/** The last captured lines as the filters would have saved them, for the settings preview. */
export function vn5FilterPreview(lines: readonly string[], filters: Vn5LineFilters): {
  rows: Vn5FilterPreviewRow[];
  invalidRules: number[];
} {
  const compiled = filters.rules.map(vn5CompileRule);
  return {
    rows: lines.map((before) => ({ before, ...vn5CleanLine(before, filters, compiled) })),
    invalidRules: compiled.flatMap((re, i) => (re ? [] : [i])),
  };
}
