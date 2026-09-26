/*
 * The Chrome extension's interface language (round-2 extension i18n).
 *
 * Every user-visible string in extension/ is read through chrome.i18n from
 * extension/_locales/<lang>/messages.json (en, ja, zh_CN, ru). Chrome shows the
 * key itself for a message that is missing, and refuses to load the extension
 * at all when the manifest names a default_locale that has no catalogue — so a
 * key used in code and absent from a catalogue is a failure here.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createI18nStub, EXTENSION_DIR, loadExtensionSandbox, readExtensionFile } from './extensionHarness';

const LANGS = ['en', 'ja', 'zh_CN', 'ru'] as const;
/** CLDR plural categories each catalogue must carry for a counted message. */
const PLURALS: Record<(typeof LANGS)[number], string[]> = {
  en: ['one', 'other'],
  ja: ['other'],
  zh_CN: ['other'],
  ru: ['one', 'few', 'many', 'other'],
};
const PLURAL_SUFFIX = /_(one|few|many|other)$/;

type Catalogue = Record<string, { message: string }>;
const catalogues = Object.fromEntries(
  LANGS.map((lang) => [
    lang,
    JSON.parse(readFileSync(path.join(EXTENSION_DIR, '_locales', lang, 'messages.json'), 'utf8')) as Catalogue,
  ]),
) as Record<(typeof LANGS)[number], Catalogue>;

const SCRIPTS = ['background.js', 'content.js', 'shared.js', 'popup.js', 'options.js', 'tabs.js'];
const PAGES = ['popup.html', 'options.html', 'tabs.html'];
const scriptSource = SCRIPTS.map(readExtensionFile).join('\n');
const PREFIXES = 'bg|menu|common|category|save|capture|clip|content|popup|opt|tabs|locale';

/** Keys the scripts name literally: t('x'), uiMsg('x'), jpMsg('x'), and key tables. */
function literalKeys(): Set<string> {
  const keys = new Set<string>();
  for (const m of scriptSource.matchAll(new RegExp(`'((?:${PREFIXES})_[A-Za-z0-9_]+)'`, 'g'))) keys.add(m[1]);
  return keys;
}

/** Keys read through the counted helpers (tn / jpMsgCount), which add a plural suffix. */
function countedKeys(): Set<string> {
  const keys = new Set<string>();
  for (const m of scriptSource.matchAll(/\b(?:tn|jpMsgCount)\(\s*'([A-Za-z0-9_]+)'/g)) keys.add(m[1]);
  return keys;
}

/** Keys the pages name in data-i18n / -html / -title / -aria-label / -placeholder. */
function pageKeys(): Set<string> {
  const keys = new Set<string>();
  for (const page of PAGES) {
    for (const m of readExtensionFile(page).matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) keys.add(m[1]);
  }
  return keys;
}

function manifestKeys(): Set<string> {
  return new Set([...readExtensionFile('manifest.json').matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((m) => m[1]));
}

/** Keys built at runtime: one per command in the registry, one per reading theme. */
function dynamicKeys(): Set<string> {
  const sandbox = loadExtensionSandbox({ files: ['shared.js'] });
  const ids = (sandbox as unknown as { jpStudyShared: { COMMANDS?: Array<{ id: string }> } }).jpStudyShared
    .COMMANDS;
  const commandIds =
    ids?.map((c) => c.id) ?? [...readExtensionFile('shared.js').matchAll(/^\s+id: '([a-z.A-Z]+)',$/gm)].map((m) => m[1]);
  const keys = new Set<string>();
  for (const id of commandIds) {
    const base = `cmd_${id.replace(/\./g, '_')}`;
    for (const part of ['label', 'short', 'desc']) keys.add(`${base}_${part}`);
  }
  const themes = /const THEMES = \[([^\]]*)\]/.exec(readExtensionFile('content.js'))?.[1] ?? '';
  for (const m of themes.matchAll(/'([a-z]+)'/g)) keys.add(`content_theme_${m[1]}`);
  keys.add('content_theme_off');
  return keys;
}

describe('extension _locales', () => {
  it('ships a catalogue for the manifest default locale and every UI language', () => {
    const manifest = JSON.parse(readExtensionFile('manifest.json')) as { default_locale?: string };
    expect(manifest.default_locale).toBe('en');
    for (const lang of LANGS) {
      expect(existsSync(path.join(EXTENSION_DIR, '_locales', lang, 'messages.json')), lang).toBe(true);
    }
  });

  it('uses only message names Chrome accepts and no stray $ signs', () => {
    for (const lang of LANGS) {
      for (const [key, { message }] of Object.entries(catalogues[lang])) {
        expect(key, `${lang} key`).toMatch(/^[A-Za-z0-9_]+$/);
        expect(typeof message, `${lang}.${key}`).toBe('string');
        // $1…$9 are substitutions and $$ a literal dollar; anything else is
        // read by Chrome as a named placeholder that no entry defines.
        expect(/\$(?![1-9$])/.test(message.replace(/\$\$/g, '')), `${lang}.${key}: ${message}`).toBe(false);
      }
    }
  });

  it('loads in Chrome: no message reads as an undefined named placeholder', () => {
    // Chrome's own load-time pass (MessageBundle::ReplaceVariables): from each
    // '$', the text up to the next '$' is a placeholder name when it is only
    // [A-Za-z0-9_@] — so "$1$2" or "$2$3" asks for a placeholder named "1" or
    // "2", and Chrome refuses the WHOLE extension ("Variable $1$ used but not
    // defined."). Measured: Extensions.loadUnpacked failed exactly so.
    const loadError = (message: string, placeholders: Record<string, string>): string | null => {
      let msg = message;
      let beg = 0;
      for (;;) {
        beg = msg.indexOf('$', beg);
        if (beg < 0) return null;
        beg += 1;
        if (beg >= msg.length) return null;
        const end = msg.indexOf('$', beg);
        if (end < 0) return null;
        const name = msg.slice(beg, end);
        if (!/^[A-Za-z0-9_@]+$/.test(name)) continue;
        const value = placeholders[name.toLowerCase()];
        if (value === undefined) return `Variable $${name}$ used but not defined.`;
        msg = msg.slice(0, beg - 1) + value + msg.slice(end + 1);
      }
    };
    const errors: string[] = [];
    for (const lang of LANGS) {
      for (const [key, entry] of Object.entries(catalogues[lang])) {
        const raw = (entry as { placeholders?: Record<string, { content: string }> }).placeholders ?? {};
        const placeholders = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v.content]));
        const error = loadError(entry.message, placeholders);
        if (error) errors.push(`${lang}.${key}: ${error} (${entry.message})`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('formats a created card with its term and deck', () => {
    const card = loadExtensionSandbox({ files: ['shared.js'] }).jpStudyShared as unknown as Record<string, (...args: unknown[]) => string>;
    expect(card.formatSaveResultMessage({ ok: true, term: '猫', anki: { ok: true }, profileName: 'Japanese', deckName: 'Mining' })).toBe(
      'Card created in Anki “猫” (Japanese / Mining) · saved in Gum',
    );
  });

  it('has every key the scripts, pages and manifest use, in every language', () => {
    const counted = countedKeys();
    const plain = new Set([...literalKeys(), ...pageKeys(), ...manifestKeys(), ...dynamicKeys()]);
    for (const key of counted) plain.delete(key);
    const missing: string[] = [];
    for (const lang of LANGS) {
      const cat = catalogues[lang];
      for (const key of plain) if (!cat[key]) missing.push(`${lang}:${key}`);
      for (const key of counted) {
        for (const category of PLURALS[lang]) if (!cat[`${key}_${category}`]) missing.push(`${lang}:${key}_${category}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps the same messages and substitutions in every language', () => {
    const base = (key: string) => key.replace(PLURAL_SUFFIX, '');
    const enBases = new Set(Object.keys(catalogues.en).map(base));
    const subs = (s: string) => [...new Set(s.match(/\$[1-9]/g) ?? [])].sort().join(',');
    for (const lang of LANGS) {
      const cat = catalogues[lang];
      expect(new Set(Object.keys(cat).map(base)), lang).toEqual(enBases);
      for (const [key, { message }] of Object.entries(cat)) {
        const enKey = catalogues.en[key] ? key : `${base(key)}_other`;
        const enMessage = catalogues.en[enKey]?.message ?? catalogues.en[base(key)]?.message ?? '';
        expect(subs(message), `${lang}.${key}`).toBe(subs(enMessage));
      }
    }
  });

  it('translates rather than copies English', () => {
    // Brand names, units and pure formatting are allowed to match.
    const SAME = /^(Gum|OK|OCR|AI OCR|\$1 · \$2|en)$/;
    for (const lang of ['ja', 'zh_CN', 'ru'] as const) {
      const copied = Object.entries(catalogues[lang])
        .filter(
          ([key, { message }]) =>
            catalogues.en[key]?.message === message && !SAME.test(message) && /\p{L}{2}/u.test(message),
        )
        .map(([key]) => key);
      expect(copied, lang).toEqual([]);
    }
  });
});

describe('extension strings resolve through chrome.i18n', () => {
  const english = loadExtensionSandbox({ files: ['shared.js'] }).jpStudyShared as unknown as Record<
    string,
    (...args: unknown[]) => string
  >;

  it('formats save results from the catalogue, term included', () => {
    expect(english.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫' })).toBe('Word saved “猫” to Gum');
    expect(english.formatSaveResultMessage({ ok: false, queued: true, term: '猫' })).toBe(
      'Queued “猫” — will sync when Gum is open',
    );
  });

  it('picks the plural form the UI language needs', () => {
    const ru = loadExtensionSandbox({ files: ['shared.js'], chrome: { i18n: createI18nStub('ru') } })
      .jpStudyShared as unknown as Record<string, (...args: unknown[]) => string>;
    expect(ru.msgCount('tabs_count', 1)).toBe('1 вкладка');
    expect(ru.msgCount('tabs_count', 3)).toBe('3 вкладки');
    expect(ru.msgCount('tabs_count', 5)).toBe('5 вкладок');
    expect(english.msgCount('tabs_count', 1)).toBe('1 tab');
    expect(english.msgCount('tabs_count', 2)).toBe('2 tabs');
  });

  it('names commands in the UI language', () => {
    const ja = loadExtensionSandbox({ files: ['shared.js'], chrome: { i18n: createI18nStub('ja') } })
      .jpStudyShared as unknown as { getCommand(id: string): { label: string } };
    expect(ja.getCommand('save.word').label).toBe('単語を保存');
  });

  it('exports settings under the app name, not the old one', () => {
    const options = readExtensionFile('options.js');
    expect(options).toContain("'gum-extension-settings.json'");
    expect(options).not.toMatch(/grammarx-extension-settings/);
  });
});
