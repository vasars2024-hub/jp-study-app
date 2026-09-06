import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, ja, ru, zh } from '../../shared/i18n/catalogs/all';

const VIEW = readFileSync(
  resolve(__dirname, '..', 'views', 'YouTubePlaylistsView.tsx'),
  'utf8',
);

/**
 * Pre-sweep D90 — the YouTube view's icon-only buttons must carry a name.
 *
 * The button that commits a new folder name was `<button type="button" className="btn small"
 * onClick={() => void addFolder()}><Icon name="folder" size={14} /></button>`. `Icon` renders
 * an aria-hidden svg, so the control had no text node at all: a whole-window sweep of 85
 * visible controls on the running app (pid 14128) left exactly this one with no accessible
 * name, while the input it acts on was named by its own placeholder.
 *
 * Source-shaped, like `sliderAccessibleName.test.ts` and for the same reason — `environment:
 * 'node'`, and this view reaches singletons at module eval.
 */

/** Read one JSX opening tag from `start`, tracking `{}` depth so `=>` does not end it. */
function readOpeningTag(src: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** Every `<button>` whose entire body is an `<Icon>`, with whether it is named. */
export function analyseSource(src: string): { line: number; named: boolean; tag: string }[] {
  const out: { line: number; named: boolean; tag: string }[] = [];
  for (const match of src.matchAll(/<button\b/g)) {
    const tag = readOpeningTag(src, match.index);
    const close = src.indexOf('</button>', match.index + tag.length);
    if (close === -1) continue;
    const body = src.slice(match.index + tag.length, close);
    // Nested buttons would make this body span two controls; skip rather than guess.
    if (body.includes('<button')) continue;
    const withoutIcons = body
      .replace(/<Icon[^>]*\/>/g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .trim();
    if (!/<Icon/.test(body) || withoutIcons !== '') continue;
    out.push({
      line: src.slice(0, match.index).split(/\r?\n/).length,
      named: /\saria-label=|\saria-labelledby=|\stitle=/.test(tag),
      tag: tag.replace(/\s+/g, ' ').slice(0, 80),
    });
  }
  return out;
}

describe('every icon-only button in the YouTube view has a name', () => {
  it('leaves none unnamed', () => {
    const nameless = analyseSource(VIEW)
      .filter((b) => !b.named)
      .map((b) => `YouTubePlaylistsView.tsx:${b.line} — ${b.tag}`);
    expect(nameless).toEqual([]);
  });

  it('finds icon-only buttons at all, so an empty pass cannot be vacuous', () => {
    const found = analyseSource(VIEW);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.every((b) => b.named)).toBe(true);
  });

  it('names the create-folder button through the catalog, in all four languages', () => {
    expect(VIEW).toContain("aria-label={t('yt.folder.create')}");
    for (const [lang, catalog] of Object.entries({ en, ja, zh, ru })) {
      expect(catalog['yt.folder.create'], `${lang} is missing yt.folder.create`).toBeTruthy();
      if (lang !== 'en') {
        expect(catalog['yt.folder.create'], `${lang} is still English`).not.toBe(
          en['yt.folder.create'],
        );
      }
    }
  });
});

describe('the analyser detects what it claims to', () => {
  it('reports the pre-fix button as unnamed', () => {
    const [only] = analyseSource(
      '<button type="button" className="btn small" onClick={() => void addFolder()}><Icon name="folder" size={14} /></button>',
    );
    expect(only).toMatchObject({ named: false });
  });

  it('accepts aria-label and title', () => {
    expect(analyseSource('<button aria-label="Create folder"><Icon name="folder" /></button>')[0].named).toBe(true);
    expect(analyseSource('<button title="Create folder"><Icon name="folder" /></button>')[0].named).toBe(true);
  });

  it('ignores a button that has its own text beside the icon', () => {
    expect(analyseSource('<button><Icon name="folder" /> Add folder</button>')).toEqual([]);
  });

  it('does not let an arrow function in the tag end it early', () => {
    // `onClick={() => …}` before the label is exactly what a scan-to-first-`>` gets wrong.
    const [only] = analyseSource(
      '<button onClick={() => go()} aria-label="Create folder"><Icon name="folder" /></button>',
    );
    expect(only.named).toBe(true);
  });
});
