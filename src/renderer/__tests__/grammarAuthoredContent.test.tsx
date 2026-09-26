// @vitest-environment jsdom
/**
 * The hollow supplement records: authored content, tag corrections, the
 * authoring queue that carries progress between passes, and a detail view
 * that no longer prints the title and gloss twice.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTHORED_CONTENT,
  GRAMMAR,
  GRAMMAR_FUNCTION_IDS,
  GRAMMAR_MODULES,
  TAG_CORRECTIONS,
  authoringProgress,
  grammarAuthoringQueue,
  isHollowGrammarPoint,
  shadowedSupplementIds,
  type GrammarPoint,
} from '../data/grammar';
import { grammarTitleKey, sortGrammarPoints } from '../data/grammar/practiceFilters';
import { GrammarDetail } from '../components/grammar/GrammarContent';

const SUPPLEMENTS: GrammarPoint[] = [
  ...GRAMMAR_MODULES['n4-supplement'],
  ...GRAMMAR_MODULES['n3-supplement'],
  ...GRAMMAR_MODULES['n2-supplement'],
  ...GRAMMAR_MODULES['n1-supplement'],
];
const SUPPLEMENT_IDS = new Set(SUPPLEMENTS.map((p) => p.id));
const byId = new Map(GRAMMAR.map((p) => [p.id, p]));

/*
 * Ratchet: hollow records per level may only go down. When a pass authors
 * more, lower these numbers to the new counts the failure message prints.
 */
const MAX_HOLLOW: Record<string, number> = { N4: 212, N3: 627, N2: 437, N1: 324 };

describe('authored content for hollow supplement records', () => {
  const entries = Object.entries(AUTHORED_CONTENT);

  it('covers real supplement records only', () => {
    expect(entries.length).toBeGreaterThanOrEqual(100);
    for (const [id] of entries) expect(SUPPLEMENT_IDS.has(id), id).toBe(true);
  });

  it('says something the title and gloss do not, with at least two translated examples', () => {
    for (const [id, c] of entries) {
      const record = SUPPLEMENTS.find((p) => p.id === id)!;
      expect(c.structure.replace(/\s/g, ''), id).not.toBe(record.title.replace(/\s/g, ''));
      expect(c.explanation.length, id).toBeGreaterThan(80);
      // Two to four sentences.
      const sentences = c.explanation.split(/[.!?](?:\s|$)/).filter((s) => s.trim().length > 0);
      expect(sentences.length, id).toBeGreaterThanOrEqual(2);
      expect(c.examples.length, id).toBeGreaterThanOrEqual(2);
      for (const ex of c.examples) {
        expect(ex.jp, id).toMatch(/[぀-ヿ一-鿿]/);
        expect(ex.en.trim().length, id).toBeGreaterThan(3);
        if (ex.reading) expect(ex.reading, id).not.toMatch(/[一-鿿]/);
      }
      for (const f of c.functions ?? []) expect(GRAMMAR_FUNCTION_IDS as readonly string[], id).toContain(f);
    }
  });

  it('reaches the corpus: authored records are no longer hollow and say where they came from', () => {
    for (const [id, c] of entries) {
      const p = byId.get(id)!;
      expect(p, id).toBeTruthy();
      expect(isHollowGrammarPoint(p), id).toBe(false);
      expect(p.examples[0].jp).toBe(c.examples[0].jp);
      expect(p.provenance.source).toBe('authored:content-pass');
      expect(p.provenance.verification).not.toBe('missing');
    }
  });

  it('only ratchets down per level', () => {
    const progress = authoringProgress(SUPPLEMENTS);
    for (const [level, max] of Object.entries(MAX_HOLLOW)) {
      expect(progress[level].hollow, `${level}: now ${progress[level].hollow}`).toBeLessThanOrEqual(max);
    }
  });
});

describe('tag corrections', () => {
  it('反対に is contrast, not desire (the たい substring bug)', () => {
    const p = byId.get('n3m-g-9f301c')!;
    expect(p.functions).toEqual(['contrast']);
    expect(p.categories).toContain('contrast.opposition');
  });

  it('no corrected record keeps a desire tag unless the pattern expresses a wish', () => {
    for (const id of Object.keys(TAG_CORRECTIONS)) {
      const p = byId.get(id)!;
      expect(p, id).toBeTruthy();
      if (p.functions.includes('desire')) expect(p.meaning, id).toMatch(/want|wish|desire|like/i);
    }
  });
});

describe('authoring queue', () => {
  it('starts at the easiest level, skips authored records and lists only hollow ones', () => {
    const queue = grammarAuthoringQueue(SUPPLEMENTS);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].level).toBe('N4');
    const levels = queue.map((q) => q.level);
    expect(levels.indexOf('N1')).toBeGreaterThan(levels.lastIndexOf('N4'));
    for (const q of queue) expect(AUTHORED_CONTENT[q.id]).toBeUndefined();
  });

  it('puts records with corpus hits first and shadowed ones last within a level', () => {
    const recs: GrammarPoint[] = ['a', 'b', 'c'].map((id) => ({
      id, level: 'N4', title: id, meaning: id, structure: id, explanation: id, examples: [],
    }));
    const q = grammarAuthoringQueue(recs, { shadowed: new Set(['a']), corpusHits: { c: 3 } });
    expect(q.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('shadows supplement records that dedupe hides behind a core point or an earlier twin', () => {
    const core = ['n5', 'n4', 'n3', 'n2', 'n2-extra', 'n1', 'n1-extra'].flatMap((m) => GRAMMAR_MODULES[m]);
    const shadowed = shadowedSupplementIds(core, SUPPLEMENTS, grammarTitleKey);
    const coreKeys = new Set(core.map((p) => grammarTitleKey('ja', p.title)));
    // Every core collision is shadowed; an authored record without one never is.
    for (const p of SUPPLEMENTS) {
      const collides = coreKeys.has(grammarTitleKey('ja', p.title));
      if (collides) expect(shadowed.has(p.id), p.id).toBe(true);
      else if (AUTHORED_CONTENT[p.id]) expect(shadowed.has(p.id), p.id).toBe(false);
    }
    // Exactly one visible record per remaining title key.
    const visible = new Map<string, string>();
    for (const p of SUPPLEMENTS) {
      if (shadowed.has(p.id)) continue;
      const key = grammarTitleKey('ja', p.title);
      expect(visible.has(key), `${p.id} twins ${visible.get(key)}`).toBe(false);
      visible.set(key, p.id);
    }
    // The queue puts them after every open record of the same level.
    const n4 = grammarAuthoringQueue(SUPPLEMENTS, { shadowed })
      .filter((q) => q.level === 'N4')
      .map((q) => shadowed.has(q.id));
    expect(n4.indexOf(true)).toBeGreaterThan(n4.lastIndexOf(false));
  });
});

describe('hollow records sort below written ones', () => {
  it('within a level', () => {
    const hollow = { ...byId.get('n4m-g-bd330a')!, id: 'x-hollow', title: 'あ', structure: 'あ', explanation: 'm', meaning: 'm' };
    const written = byId.get('n4m-g-bd330a')!;
    const sorted = sortGrammarPoints([hollow, written], 'level');
    expect(sorted[0].id).toBe(written.id);
  });
});

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

function render(point: GrammarPoint) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => r.render(<GrammarDetail point={point} />));
  return host;
}

describe('GrammarDetail', () => {
  it('hides a structure that repeats the title and an explanation that repeats the gloss', () => {
    const el = render({
      id: 'h', lang: 'ja', level: 'N3', title: 'といったら', meaning: 'extremely', structure: 'といったら',
      explanation: 'extremely', examples: [],
    });
    expect(el.querySelector('.gram-structure')).toBeNull();
    expect(el.querySelectorAll('.gram-block').length).toBe(1);
    // No examples: says so, and still offers the Tatoeba search.
    expect(el.querySelector('.gram-more-btn')).not.toBeNull();
    expect(el.querySelector('.gram-examples')).toBeNull();
  });

  it('shows authored blocks in full', () => {
    const el = render(byId.get('n4m-g-bd330a')!);
    expect(el.querySelector('.gram-structure')?.textContent).toContain('いただく');
    expect(el.querySelectorAll('.gram-block').length).toBe(3);
    expect(el.querySelectorAll('.gram-examples li').length).toBeGreaterThanOrEqual(2);
  });
});
