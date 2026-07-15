// Phase 2 — the translation core. Pure and framework-free so the main process
// (menus, dialogs) and the renderer share exactly one implementation.

export const UI_LANGS = ['en', 'ja', 'zh', 'ru'] as const;
export type UiLang = (typeof UI_LANGS)[number];

export const DEFAULT_LANG: UiLang = 'en';

export const LANG_LABELS: Record<UiLang, string> = {
  en: 'English',
  ja: '日本語',
  zh: '中文',
  ru: 'Русский',
};

/** BCP-47 tags for Intl and for the document's `lang` attribute. */
export const LANG_TAGS: Record<UiLang, string> = {
  en: 'en',
  ja: 'ja',
  zh: 'zh-Hans',
  ru: 'ru',
};

export function isUiLang(value: unknown): value is UiLang {
  return typeof value === 'string' && (UI_LANGS as readonly string[]).includes(value);
}

/**
 * A catalog entry is either a plain string or a set of plural forms.
 *
 * Plural forms are keyed by CLDR plural category, which is the only way to get
 * Russian right: it needs one/few/many (1 / 2–4 / 5+), and a naive
 * singular-vs-plural split ships visibly broken strings.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type CatalogEntry = string | PluralForms;
export type Catalog = Record<string, CatalogEntry>;

export type TVars = Record<string, string | number>;

function isPluralForms(entry: CatalogEntry): entry is PluralForms {
  return typeof entry === 'object' && entry !== null && 'other' in entry;
}

const pluralRules = new Map<UiLang, Intl.PluralRules>();

function rulesFor(lang: UiLang): Intl.PluralRules {
  let rules = pluralRules.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(LANG_TAGS[lang]);
    pluralRules.set(lang, rules);
  }
  return rules;
}

/** `{name}` and `{count}` placeholders. Numbers are localised via Intl. */
function interpolate(template: string, vars: TVars | undefined, lang: UiLang): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined) return match;
    return typeof value === 'number' ? new Intl.NumberFormat(LANG_TAGS[lang]).format(value) : value;
  });
}

const missingWarned = new Set<string>();

export interface TranslateOptions {
  lang: UiLang;
  catalog: Catalog;
  fallback: Catalog;
  /** Called once per missing key, for a dev-time warning. */
  onMissing?: (key: string, lang: UiLang) => void;
}

/**
 * Resolve one key. A key missing from the active catalog falls back to English
 * rather than rendering a raw dotted key at the user — a half-translated UI is
 * usable, `settings.storage.title` is not.
 */
export function translate(key: string, vars: TVars | undefined, opts: TranslateOptions): string {
  const { lang, catalog, fallback } = opts;
  let entry = catalog[key];

  if (entry === undefined) {
    entry = fallback[key];
    const warnKey = `${lang}:${key}`;
    if (!missingWarned.has(warnKey)) {
      missingWarned.add(warnKey);
      opts.onMissing?.(key, lang);
    }
  }
  // Not in English either — show the key, which at least makes the bug findable.
  if (entry === undefined) return key;

  if (isPluralForms(entry)) {
    const count = Number(vars?.count ?? 0);
    const category = rulesFor(lang).select(count);
    const form = entry[category] ?? entry.other;
    return interpolate(form, vars, lang);
  }

  return interpolate(entry, vars, lang);
}

/** Test hook — the "warn once" set is process-global otherwise. */
export function resetMissingWarnings(): void {
  missingWarned.clear();
}
