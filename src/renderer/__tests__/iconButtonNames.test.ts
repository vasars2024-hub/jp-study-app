import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findUnnamedIconButtons } from './iconButtonNames';

const RENDERER = join(__dirname, '..');

function tsxUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') tsxUnder(path, out);
    } else if (path.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

/** Surfaces this guard holds to "every icon-only button has a name". */
const GUARDED = [
  ...tsxUnder(join(RENDERER, 'components', 'shell')),
  ...tsxUnder(join(RENDERER, 'components', 'settings')),
  ...tsxUnder(join(RENDERER, 'components', 'flashcards')),
  ...tsxUnder(join(RENDERER, 'components', 'blanc')),
  ...tsxUnder(join(RENDERER, 'widgets')),
  join(RENDERER, 'components', 'MiniShell.tsx'),
  join(RENDERER, 'components', 'manga', 'MangaReaderSettingsPanel.tsx'),
  join(RENDERER, 'views', 'DictionaryView.tsx'),
  join(RENDERER, 'views', 'FlashcardsView.tsx'),
  join(RENDERER, 'views', 'LibraryView.tsx'),
  join(RENDERER, 'views', 'SettingsView.tsx'),
].filter((path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
});

describe('findUnnamedIconButtons', () => {
  it('reports an icon-only button with no name', () => {
    const src = '<div>\n<button type="button" onClick={close}>\n  <Icon name="close" size={12} />\n</button></div>';
    expect(findUnnamedIconButtons(src)).toEqual([expect.objectContaining({ line: 2 })]);
  });

  it('reports a conditional icon and a lone glyph', () => {
    expect(findUnnamedIconButtons('<button onClick={f}>{open ? <Icon name="a" /> : <Icon name="b" />}</button>')).toHaveLength(1);
    expect(findUnnamedIconButtons('<button onClick={() => remove(id)}>×</button>')).toHaveLength(1);
  });

  it('accepts aria-label, title, aria-labelledby, text and spread props', () => {
    for (const src of [
      '<button aria-label={t("x")}><Icon name="close" /></button>',
      '<button title={t("x")}><Icon name="close" /></button>',
      '<button aria-labelledby="l"><svg viewBox="0 0 1 1"><path d="M0" /></svg></button>',
      '<button><Icon name="folder" />{t("library.btn.importFolder")}</button>',
      '<button {...props}><Icon name="close" /></button>',
      '<button onClick={() => { if (a > b) go(); }}><Icon name="x" /> {label}</button>',
    ]) {
      expect(findUnnamedIconButtons(src)).toEqual([]);
    }
  });
});

describe('icon-only buttons have accessible names', () => {
  it('guards a non-trivial set of files', () => {
    expect(GUARDED.length).toBeGreaterThan(20);
  });

  it.each(GUARDED.map((path) => [relative(RENDERER, path).replace(/\\/g, '/'), path]))(
    '%s',
    (_name, path) => {
      const unnamed = findUnnamedIconButtons(readFileSync(path, 'utf8'));
      expect(unnamed.map((hit) => `line ${hit.line}: ${hit.snippet}`)).toEqual([]);
    },
  );
});

describe('labelled dropdowns and search fields', () => {
  const read = (...parts: string[]) => readFileSync(join(RENDERER, ...parts), 'utf8');

  it('names the dictionary search input (D116)', () => {
    expect(read('views', 'DictionaryView.tsx')).toMatch(/placeholder=\{t\(`dict\.view\.placeholder[^\n]*\n\s*aria-label=\{t\('polish2\.dict\.searchLabel'\)\}/);
  });

  it('names the theme dropdowns (D23/D24)', () => {
    expect(read('components', 'shell', 'QuickSettings.tsx')).toContain("aria-label={t('quickSettings.theme')}");
    expect(read('components', 'settings', 'AppearancePreviewCard.tsx')).toContain("aria-label={t('search.theme')}");
    expect(read('components', 'manga', 'MangaReaderSettingsPanel.tsx')).toContain("aria-label={t('manga.settings.theme')}");
  });
});
