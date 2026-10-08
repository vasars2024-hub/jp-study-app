// @vitest-environment node
//
// Stored XSS through an imported dictionary. A Yomitan archive is untrusted
// input, and its glossary HTML reaches innerHTML in the reader pop-up, the
// Dictionary view and the browser extension's hover pop-up. Structured-content
// text, plain string definitions and the reading column (pitch morae) used to be
// written into that HTML unescaped.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: () => undefined, getAllWindows: () => [] },
}));
vi.mock('../i18n', () => ({ mt: (key: string) => key }));
// The real one opens a SQLite database in userData; nothing here reads it.
vi.mock('../dictionary/service', () => ({ initDictionaryService: () => undefined }));

import {
  definitionsToSenses,
  ensureYomitanTerms,
  lookupGlossary,
  lookupOfflineDeinflected,
  pitchPatternHtml,
  renderStructuredContent,
  setYomitanLang,
} from '../dictionary/yomitan';

const XSS = '<img src=x onerror=alert(1)>';

describe('renderStructuredContent escapes dictionary text', () => {
  it('escapes plain strings, numbers and `text` nodes', () => {
    expect(renderStructuredContent(XSS)).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(renderStructuredContent({ text: '<script>alert(1)</script>' }))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(renderStructuredContent(42)).toBe('42');
  });

  it('keeps the tags it writes itself, with escaped content', () => {
    const node = {
      type: 'structured-content',
      content: [{ tag: 'ul', content: [{ tag: 'li', content: XSS }, { tag: 'li', content: 'A&B' }] }],
    };
    expect(renderStructuredContent(node))
      .toBe('<ul><li>&lt;img src=x onerror=alert(1)&gt;</li><li>A&amp;B</li></ul>');
  });

  it('does not let a node choose its own tag name', () => {
    expect(renderStructuredContent({ tag: 'script', content: 'alert(1)' })).toBe('alert(1)');
    expect(renderStructuredContent({ tag: 'img', content: '', data: { src: 'x' } })).toBe('');
  });
});

describe('definitionsToSenses', () => {
  it('escapes raw string definitions in the HTML and keeps them raw in the senses', () => {
    const out = definitionsToSenses([XSS, 'to eat']);
    expect(out.glossaryHtml).toBe('&lt;img src=x onerror=alert(1)&gt;<br>to eat');
    expect(out.senses[0]?.definitions).toEqual([XSS, 'to eat']);
  });

  it('decodes entities back to text for the plain definitions (no double escaping)', () => {
    const out = definitionsToSenses([{ type: 'structured-content', content: { tag: 'ul', content: [
      { tag: 'li', content: 'A&B' },
      { tag: 'li', content: '<b>' },
    ] } }]);
    expect(out.glossaryHtml).toBe('<ul><li>A&amp;B</li><li>&lt;b&gt;</li></ul>');
    // Plain text: a consumer that escapes it shows `A&B`, not `A&amp;B`.
    expect(out.senses[0]?.definitions).toEqual(['A&B', '<b>']);
  });
});

describe('pitchPatternHtml', () => {
  it('escapes a reading that carries markup', () => {
    const html = pitchPatternHtml(XSS, 0);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain('&lt;');
    expect(html.startsWith('<span style="')).toBe(true);
  });

  it('still renders an ordinary reading unchanged', () => {
    expect(pitchPatternHtml('たべる', 2)).toBe(
      '<span style="display:inline-block">た</span>' +
      '<span style="border-top:2px solid currentColor;padding-top:1px;display:inline-block">べ</span>' +
      '<span style="display:inline-block">る</span>',
    );
  });
});

const DICT_ID = 'fixture-hostile';

function seedStore(): void {
  const dir = path.join(tempRoot, 'yomitan', DICT_ID);
  fs.mkdirSync(dir, { recursive: true });
  const info = {
    id: DICT_ID, title: 'Hostile', revision: 'r', priority: 0, hasTerms: true,
    hasPitch: false, hasFreq: false, importedAt: 0, enabled: true, glossLangs: ['en'],
  };
  fs.writeFileSync(path.join(tempRoot, 'yomitan', 'registry.json'), JSON.stringify({ dicts: [info] }));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
    version: 1,
    info,
    terms: {
      // A store written before the import escaped its text: raw HTML on disk.
      猫: [{
        word: '猫', reading: 'ねこ', score: 1,
        senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }],
        glossaryHtml: `<b onclick="alert(1)">cat</b>${XSS}<script>alert(1)</script>`,
      }],
      猫舌: [{ word: '猫舌', reading: 'ねこじた', score: 1, senses: [{ partsOfSpeech: ['n'], definitions: ['x'], tags: [] }] }],
      食べる: [{ word: '食べる', reading: 'たべる', score: 5, senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'], tags: [] }] }],
    },
  }));
}

describe('legacy in-memory store', () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-yomitan-xss-'));
    seedStore();
    ensureYomitanTerms();
    setYomitanLang(DICT_ID, '');
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('sanitizes stored glossary HTML on the way out', () => {
    const [entry] = lookupGlossary('猫');
    expect(entry?.glossaryHtml).toBe('<b>cat</b>');
  });

  it('tags how each entry was reached', () => {
    expect(lookupGlossary('猫').map((e) => e.via)).toEqual(['exact']);
    expect(lookupOfflineDeinflected('猫舌').entries.map((e) => e.via)).toEqual(['exact']);
    expect(lookupOfflineDeinflected('食べた').entries.map((e) => e.via)).toEqual(['deinflected']);
    // 食べ is not a headword; the prefix scan answers with 食べる and says so.
    expect(lookupOfflineDeinflected('猫舌が').entries).toEqual([]);
    const prefix = lookupOfflineDeinflected('食');
    expect(prefix.entries.map((e) => [e.word, e.via])).toEqual([['食べる', 'prefix']]);
  });
});
