// Per-site extraction rules: the selector set that turns one site's episode
// listing into rows.
//
// The catalogue path (AniList / Jikan) covers titles that a metadata provider
// knows about. Site rules are the escape hatch for everything else — a page
// that lists episodes in its own markup and is not in any catalogue.
//
// Everything here is pure and DOM-agnostic: the caller passes a parsed document
// in, so the renderer can use its own DOMParser and a test can use any
// implementation with `querySelector`. Nothing in this file touches the network.

/** The subset of the DOM this module needs. Keeps it testable without jsdom. */
export interface RuleElement {
  querySelector(selectors: string): RuleElement | null;
  querySelectorAll(selectors: string): ArrayLike<RuleElement>;
  getAttribute(name: string): string | null;
  textContent: string | null;
}

export interface RuleDocument {
  querySelectorAll(selectors: string): ArrayLike<RuleElement>;
}

export interface ScraperSiteRule {
  id: string;
  /** Hostname this rule applies to, e.g. `example.com`. Matched case-insensitively. */
  host: string;
  /** A page on the site the rule is validated against. */
  sampleUrl: string;
  /** Selector for one episode row. Everything else is resolved inside a row. */
  episodeSelector: string;
  /** Selector for the title, relative to the row. Empty means the row's own text. */
  titleSelector: string;
  /** Selector for the link, relative to the row. Empty means the row itself. */
  linkSelector: string;
  /** Attribute the link is read from. Empty means `href`. */
  linkAttribute: string;
  /**
   * Selector for the cell holding the episode number, relative to the row.
   * Empty reads the row's whole text — which is only safe when the row does not
   * begin with some other number. A real listing very often does (an overall
   * number next to a season number reads as "11" for episode 1), so pointing
   * this at the number's own cell is usually the difference between correct
   * numbering and nonsense.
   */
  numberSelector: string;
  /**
   * Regex applied to the number text. Empty falls back to the first integer
   * found. The first capture group wins when there is one.
   */
  numberPattern: string;
  enabled: boolean;
  /** Populated by a validation run; null until one has happened. */
  lastValidatedAt: string | null;
  lastMatchCount: number;
}

export const DEFAULT_SITE_RULE: Omit<ScraperSiteRule, 'id' | 'host' | 'sampleUrl'> = {
  episodeSelector: '',
  titleSelector: '',
  linkSelector: '',
  linkAttribute: '',
  numberSelector: '',
  numberPattern: '',
  enabled: false,
  lastValidatedAt: null,
  lastMatchCount: 0,
};

export interface ExtractedRow {
  /** 1-based position in the document, always present. */
  index: number;
  /** Parsed from the row, or null when no number could be read. */
  number: number | null;
  title: string;
  /** Absolute where the rule's sample URL allowed resolution, else as written. */
  link: string;
  /** Raw link before resolution — shown when resolution failed. */
  rawLink: string;
}

export type RuleCheckId =
  | 'rows-found'
  | 'titles-present'
  | 'links-present'
  | 'links-absolute'
  | 'numbers-parsed'
  | 'numbers-unique'
  | 'numbers-sequential';

export interface RuleCheck {
  id: RuleCheckId;
  label: string;
  ok: boolean;
  detail: string;
}

export interface RuleExtraction {
  rows: ExtractedRow[];
  checks: RuleCheck[];
  /** True when every check passed. */
  ok: boolean;
  /** Set when the rule itself could not be applied at all. */
  error: string;
}

function cleanText(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Reads an episode number out of a row's text. A rule may supply its own
 * pattern; the first capture group wins, else the whole match.
 */
export function readEpisodeNumber(text: string, pattern: string): number | null {
  if (pattern) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch {
      // An unparseable pattern is reported by validateSiteRule; here it simply
      // means "no number", rather than throwing mid-extraction.
      return null;
    }
    const match = regex.exec(text);
    if (!match) return null;
    const captured = match[1] ?? match[0];
    const value = Number.parseFloat(captured);
    return Number.isFinite(value) ? value : null;
  }
  const match = /\d+(?:\.\d+)?/.exec(text);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** Absolute URL where possible; the input unchanged when it cannot be resolved. */
export function resolveLink(raw: string, baseUrl: string): string {
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

export interface SiteRuleProblem {
  field:
    | 'host'
    | 'sampleUrl'
    | 'episodeSelector'
    | 'titleSelector'
    | 'linkSelector'
    | 'numberSelector'
    | 'numberPattern';
  message: string;
}

/**
 * Static validation — what can be judged without fetching anything. Used to
 * stop a rule being enabled while it is still obviously incomplete.
 */
export function validateSiteRule(rule: ScraperSiteRule): SiteRuleProblem[] {
  const problems: SiteRuleProblem[] = [];
  if (!rule.host.trim()) {
    problems.push({ field: 'host', message: 'A host is required.' });
  } else if (/[/\s]/.test(rule.host.trim())) {
    problems.push({ field: 'host', message: 'Use a bare hostname, with no scheme or path.' });
  }

  if (!rule.sampleUrl.trim()) {
    problems.push({ field: 'sampleUrl', message: 'A sample URL is required to validate against.' });
  } else if (!/^https?:\/\//i.test(rule.sampleUrl.trim())) {
    problems.push({ field: 'sampleUrl', message: 'The sample URL must start with http:// or https://.' });
  }

  if (!rule.episodeSelector.trim()) {
    problems.push({ field: 'episodeSelector', message: 'An episode row selector is required.' });
  }

  if (rule.numberPattern) {
    try {
      new RegExp(rule.numberPattern);
    } catch (error) {
      problems.push({
        field: 'numberPattern',
        message: error instanceof Error ? error.message : 'Not a valid regular expression.',
      });
    }
  }
  return problems;
}

function check(id: RuleCheckId, label: string, ok: boolean, detail: string): RuleCheck {
  return { id, label, ok, detail };
}

/**
 * Whether an element is one the page does not show.
 *
 * Attribute-based rather than computed-style based, because there is no layout
 * here — only a parsed document. That covers what actually causes the problem
 * this setting exists for: a `<template>`-style hidden row, a duplicate mobile
 * layout kept in the markup with `hidden`, and the `display:none` clone a site
 * uses to hold data for its own scripts. It does not and cannot cover a row
 * hidden by a stylesheet rule, which the setting's hint does not promise either.
 */
export function isHiddenElement(element: RuleElement): boolean {
  if (element.getAttribute('hidden') !== null) return true;
  if ((element.getAttribute('aria-hidden') ?? '').toLowerCase() === 'true') return true;
  const style = (element.getAttribute('style') ?? '').toLowerCase();
  if (/display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style)) return true;
  // `class="… hidden …"`, the near-universal utility-class spelling.
  return /(?:^|\s)(?:hidden|is-hidden|d-none|sr-only|visually-hidden)(?:\s|$)/
    .test(element.getAttribute('class') ?? '');
}

export interface RuleExtractionOptions {
  /**
   * `extraction.ignoreHiddenElements`. Defaults off so a caller that has no
   * settings in hand — a test, a preview built before this existed — keeps the
   * behaviour it had.
   */
  ignoreHiddenElements?: boolean;
}

/**
 * Applies a rule to a parsed document and reports what it produced.
 *
 * The checks are the point: a selector that matches 400 elements but produces
 * no titles is worse than one that matches 12 and produces 12, and a count
 * alone cannot tell those apart.
 */
export function extractWithRule(
  doc: RuleDocument,
  rule: ScraperSiteRule,
  baseUrl = rule.sampleUrl,
  options: RuleExtractionOptions = {},
): RuleExtraction {
  const empty = (error: string): RuleExtraction => ({ rows: [], checks: [], ok: false, error });

  if (!rule.episodeSelector.trim()) return empty('No episode row selector is set.');

  let matched: ArrayLike<RuleElement>;
  try {
    matched = doc.querySelectorAll(rule.episodeSelector);
  } catch (error) {
    return empty(error instanceof Error ? error.message : 'The episode selector is not valid CSS.');
  }

  const linkAttribute = rule.linkAttribute.trim() || 'href';
  const rows: ExtractedRow[] = [];
  let skippedHidden = 0;
  // `index` walks the matched elements; `position` numbers the rows that were
  // kept, so a skipped hidden row does not leave a hole in the positional
  // fallback numbering downstream.
  let position = 0;
  for (let index = 0; index < matched.length; index += 1) {
    const element = matched[index];
    if (!element) continue;
    if (options.ignoreHiddenElements && isHiddenElement(element)) {
      skippedHidden += 1;
      continue;
    }
    position += 1;

    let titleNode: RuleElement | null = element;
    if (rule.titleSelector.trim()) {
      try {
        titleNode = element.querySelector(rule.titleSelector);
      } catch (error) {
        return empty(error instanceof Error ? error.message : 'The title selector is not valid CSS.');
      }
    }

    let linkNode: RuleElement | null = element;
    if (rule.linkSelector.trim()) {
      try {
        linkNode = element.querySelector(rule.linkSelector);
      } catch (error) {
        return empty(error instanceof Error ? error.message : 'The link selector is not valid CSS.');
      }
    }

    let numberNode: RuleElement | null = element;
    if (rule.numberSelector.trim()) {
      try {
        numberNode = element.querySelector(rule.numberSelector);
      } catch (error) {
        return empty(error instanceof Error ? error.message : 'The number selector is not valid CSS.');
      }
    }

    const rawLink = linkNode?.getAttribute(linkAttribute) ?? '';
    rows.push({
      index: position,
      number: readEpisodeNumber(cleanText(numberNode?.textContent ?? ''), rule.numberPattern),
      title: cleanText(titleNode?.textContent ?? ''),
      link: resolveLink(rawLink, baseUrl),
      rawLink,
    });
  }

  const withTitle = rows.filter((row) => row.title).length;
  const withLink = rows.filter((row) => row.rawLink).length;
  const absolute = rows.filter((row) => /^https?:\/\//i.test(row.link)).length;
  const numbers = rows.map((row) => row.number).filter((value): value is number => value !== null);
  const unique = new Set(numbers).size;
  const sorted = [...numbers].sort((a, b) => a - b);
  const sequential = numbers.every((value, index) => value === sorted[index]);

  const checks: RuleCheck[] = [
    check(
      'rows-found',
      'Episode rows matched',
      rows.length > 0,
      skippedHidden
        ? `${rows.length} row(s), ${skippedHidden} hidden row(s) skipped`
        : `${rows.length} row(s)`,
    ),
    check(
      'titles-present',
      'Every row has a title',
      rows.length > 0 && withTitle === rows.length,
      `${withTitle}/${rows.length}`,
    ),
    check(
      'links-present',
      'Every row has a link',
      rows.length > 0 && withLink === rows.length,
      `${withLink}/${rows.length} via [${linkAttribute}]`,
    ),
    check(
      'links-absolute',
      'Links resolve against the site origin',
      rows.length > 0 && absolute === rows.length,
      `${absolute}/${rows.length}`,
    ),
    check(
      'numbers-parsed',
      'Every row has an episode number',
      rows.length > 0 && numbers.length === rows.length,
      `${numbers.length}/${rows.length}`,
    ),
    check(
      'numbers-unique',
      'Episode numbers are unique',
      numbers.length > 0 && unique === numbers.length,
      unique === numbers.length ? `${unique} distinct` : `${numbers.length - unique} duplicate(s)`,
    ),
    check(
      'numbers-sequential',
      'Episode numbers are already in order',
      numbers.length > 0 && sequential,
      sequential ? 'ascending' : 'out of order — rows will be sorted',
    ),
  ];

  return { rows, checks, ok: checks.every((item) => item.ok), error: '' };
}

/** The rule that applies to a URL, or null. Longest host match wins. */
export function ruleForUrl(rules: ScraperSiteRule[], url: string): ScraperSiteRule | null {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;

  let best: ScraperSiteRule | null = null;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const ruleHost = rule.host.trim().toLowerCase();
    if (!ruleHost) continue;
    // `example.com` also covers `www.example.com`, which is what people expect
    // from a per-site rule; an exact-only match would need a rule per subdomain.
    const applies = host === ruleHost || host.endsWith(`.${ruleHost}`);
    if (!applies) continue;
    if (!best || ruleHost.length > best.host.trim().length) best = rule;
  }
  return best;
}
