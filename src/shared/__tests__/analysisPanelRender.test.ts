// The Chrome extension renders the AI OCR panel from extension/shared.js as
// plain JS (no build step reaches it). These tests load that file in a vm
// sandbox — the same trick extensionCaptureParity.test.ts uses — parse the HTML
// it produces with jsdom, and assert against the real DOM rather than against
// a string. That covers what a browser session would check by hand: the right
// spans are highlighted, in the right colours, the click targets carry the
// index the click handler reads, and the panel survives a half-empty analysis.
//
// It also pins the extension's behaviour against the app's: the same analysis
// must produce the same spans and the same lead translation in both, which is
// the property that silently rots as the two renderers are edited apart.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import {
  alignAnnotations,
  primaryTranslation,
  sentencePieces,
  type SentenceAnalysisResult,
  type UnalignedAnnotation,
} from '../sentenceAnalysisCore';
import { analysisCommandForKey, type AnalysisCommand } from '../analysisShortcuts';

interface PanelState {
  text: string;
  lang: string;
  uiLang: string;
  status: 'loading' | 'ready' | 'error';
  selected: number;
  showTranslations: boolean;
  mine: string;
  snapshot: string;
  result: SentenceAnalysisResult | null;
  error: string;
}

interface ExtensionShared {
  AI_CATEGORIES: string[];
  AI_CATEGORY_LABELS: Record<string, string>;
  aiCommandForKey: (e: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
  }) => AnalysisCommand | null;
  aiIsTextEntry: (el: unknown) => boolean;
  aiPrimaryTranslation: (
    result: SentenceAnalysisResult,
    uiLang: string,
    sourceLang: string,
  ) => string;
  aiSentenceHtml: (result: SentenceAnalysisResult, selected: number) => string;
  aiPanelHtml: (state: PanelState) => string;
}

function loadExtensionShared(): ExtensionShared {
  const filePath = path.join(__dirname, '..', '..', '..', 'extension', 'shared.js');
  const code = readFileSync(filePath, 'utf8');
  const sandbox: { globalThis?: unknown; jpStudyShared?: ExtensionShared; URL: typeof URL } = { URL };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: filePath });
  if (!sandbox.jpStudyShared) throw new Error('extension/shared.js did not attach jpStudyShared');
  return sandbox.jpStudyShared;
}

const shared = loadExtensionShared();

const SENTENCE = '人生は選択の連続だ。その一つ一つが、未来を作っていく。';

const RAW_ANNOTATIONS: UnalignedAnnotation[] = [
  {
    text: '人生は',
    category: 'particle',
    headword: '〜は',
    reading: 'じんせいは',
    level: 'N5',
    meaning: 'marks 人生 as the topic',
    explanation: 'は sets what the sentence is about, in contrast with が.',
    examples: [{ text: '私は学生だ。', translation: 'I am a student.' }],
    vocabulary: [{ term: '人生', reading: 'じんせい', gloss: 'life' }],
  },
  {
    text: '選択の連続',
    category: 'vocabulary',
    level: 'N3',
    meaning: 'a series of choices',
    explanation: '連続 stacks onto the noun before it via の.',
    examples: [],
    vocabulary: [],
  },
  {
    text: '一つ一つが',
    category: 'grammar',
    headword: '一つ一つ（ひとつひとつ）',
    level: 'N3',
    meaning: 'each and every one',
    explanation: 'Emphasises the items individually rather than as a mass.',
    examples: [],
    vocabulary: [],
    formality: 'Neutral; common in written prose.',
  },
  {
    text: '作っていく',
    category: 'grammar',
    level: 'N4',
    meaning: 'go on shaping (from now)',
    explanation: '〜ていく projects the action forward in time.',
    examples: [],
    vocabulary: [],
  },
];

function analysis(over: Partial<SentenceAnalysisResult> = {}): SentenceAnalysisResult {
  return {
    sentence: SENTENCE,
    translations: {
      en: 'Life is a series of choices; each one shapes the future.',
      ja: '人生は選ぶことの積み重ねで、その一つ一つが未来をつくる。',
      zh: '人生是一连串的选择，每一个都在塑造未来。',
    },
    literal: 'life / TOPIC / choice / of / series / is',
    formality: { level: 'Casual (plain form)', note: 'Written prose or speech to a peer.' },
    difficulty: 'N3',
    structure: 'Two sentences; the second takes その as its topic.',
    annotations: alignAnnotations(SENTENCE, RAW_ANNOTATIONS),
    nuance: ['Reads as a maxim rather than a report.'],
    pitfalls: ['Do not read だ as polite — it is plain form.'],
    ...over,
  };
}

function state(over: Partial<PanelState> = {}): PanelState {
  return {
    text: SENTENCE,
    lang: 'ja',
    uiLang: 'en',
    status: 'ready',
    selected: 0,
    showTranslations: false,
    mine: 'idle',
    snapshot: 'idle',
    result: analysis(),
    error: '',
    ...over,
  };
}

/** Render the panel body into a real DOM so assertions read like a UI check. */
function render(panelState: PanelState): Document {
  const dom = new JSDOM(`<div id="jp-study-ai"><div class="ai-body"></div></div>`);
  const body = dom.window.document.querySelector('.ai-body') as HTMLElement;
  body.innerHTML = shared.aiPanelHtml(panelState);
  return dom.window.document;
}

describe('extension AI panel — the annotated sentence', () => {
  const doc = render(state());
  const segs = Array.from(doc.querySelectorAll('.ai-seg'));

  it('renders one clickable highlight per annotation', () => {
    expect(segs).toHaveLength(RAW_ANNOTATIONS.length);
    expect(segs.map((s) => s.textContent)).toEqual([
      '人生は',
      '選択の連続',
      '一つ一つが',
      '作っていく',
    ]);
  });

  it('reproduces the sentence exactly, highlights and gaps together', () => {
    const rendered = doc.querySelector('.ai-sentence')?.textContent;
    expect(rendered).toBe(SENTENCE);
  });

  it('colour-codes each highlight by category', () => {
    expect(segs.map((s) => s.className.match(/ai-cat-[a-z]+/)?.[0])).toEqual([
      'ai-cat-particle',
      'ai-cat-vocabulary',
      'ai-cat-grammar',
      'ai-cat-grammar',
    ]);
  });

  it('carries the index the click handler reads back', () => {
    expect(segs.map((s) => (s as HTMLElement).dataset.index)).toEqual(['0', '1', '2', '3']);
  });

  it('marks exactly one highlight active, and it follows the selection', () => {
    expect(segs.filter((s) => s.classList.contains('active'))).toHaveLength(1);
    expect(segs[0].classList.contains('active')).toBe(true);
    const moved = render(state({ selected: 2 }));
    const activeSegs = Array.from(moved.querySelectorAll('.ai-seg.active'));
    expect(activeSegs).toHaveLength(1);
    expect(activeSegs[0].textContent).toBe('一つ一つが');
  });

  it('shows a legend only for the categories actually present', () => {
    const legend = Array.from(doc.querySelectorAll('.ai-legend li')).map((li) => li.textContent);
    expect(legend).toEqual(['Particle', 'Vocabulary', 'Grammar']);
  });

  it('falls back to a known category when the model invents one', () => {
    const odd = analysis({
      annotations: [{ ...analysis().annotations[0], category: 'sparkle' as never }],
    });
    const doc2 = render(state({ result: odd }));
    expect(doc2.querySelector('.ai-seg')?.className).toContain('ai-cat-vocabulary');
  });
});

describe('extension AI panel — the detail card', () => {
  const doc = render(state({ selected: 2 }));

  it('leads with the clicked span and its category badge', () => {
    expect(doc.querySelector('.ai-detail .ai-term')?.textContent).toBe('一つ一つが');
    expect(doc.querySelector('.ai-detail .ai-badge')?.textContent).toBe('Grammar');
    expect(doc.querySelector('.ai-detail')?.className).toContain('ai-cat-grammar');
  });

  it('shows the citation headword, level and meaning', () => {
    expect(doc.querySelector('.ai-headword')?.textContent).toBe('一つ一つ（ひとつひとつ）');
    expect(doc.querySelector('.ai-level')?.textContent).toBe('N3');
    expect(doc.querySelector('.ai-detail-meta')?.textContent).toContain('each and every one');
  });

  it('shows the in-depth explanation', () => {
    expect(doc.querySelector('.ai-detail-main .ai-prose')?.textContent).toContain(
      'Emphasises the items individually',
    );
  });

  it('shows the per-span formality note when there is one', () => {
    expect(doc.querySelector('.ai-detail-meta')?.textContent).toContain('common in written prose');
  });

  it('renders examples and vocabulary notes for the span that has them', () => {
    const first = render(state({ selected: 0 }));
    expect(first.querySelector('.ai-examples li')?.textContent).toContain('私は学生だ。');
    expect(first.querySelector('.ai-vocab li')?.textContent).toContain('life');
  });

  it('omits the example list entirely for a span with none', () => {
    const second = render(state({ selected: 1 }));
    expect(second.querySelector('.ai-examples')).toBeNull();
    expect(second.querySelector('.ai-vocab')).toBeNull();
  });

  it('offers every action the shortcuts expose', () => {
    const acts = Array.from(doc.querySelectorAll('.ai-actions button')).map((b) =>
      b.getAttribute('data-act'),
    );
    expect(acts).toEqual(['copy', 'mine', 'listen', 'snapshot', 'saveSentence']);
  });

  it('disables and relabels the mine button while a card is being made', () => {
    const busy = render(state({ selected: 2, mine: 'busy' }));
    const btn = busy.querySelector('[data-act="mine"]') as HTMLButtonElement;
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.textContent).toBe('Adding…');
    const done = render(state({ selected: 2, mine: 'done' }));
    expect(done.querySelector('[data-act="mine"]')?.textContent).toBe('Added');
  });
});

describe('extension AI panel — translations and formality', () => {
  it('leads with the UI language, never the sentence own language', () => {
    expect(render(state()).querySelector('.ai-translation')?.textContent).toBe(
      'Life is a series of choices; each one shapes the future.',
    );
    const zh = render(state({ uiLang: 'zh' }));
    expect(zh.querySelector('.ai-translation')?.textContent).toBe(
      '人生是一连串的选择，每一个都在塑造未来。',
    );
  });

  it('keeps the other translations behind a toggle', () => {
    expect(render(state()).querySelector('.ai-translations')).toBeNull();
    const open = render(state({ showTranslations: true }));
    const rows = Array.from(open.querySelectorAll('.ai-translations li'));
    expect(rows.map((r) => r.querySelector('.ai-tag')?.textContent)).toEqual(['JA', 'ZH']);
  });

  it('tags the sentence own language as a simplification, not a translation', () => {
    const open = render(state({ showTranslations: true }));
    const ja = Array.from(open.querySelectorAll('.ai-translations li')).find(
      (li) => li.querySelector('.ai-tag')?.textContent === 'JA',
    );
    expect(ja?.querySelector('.ai-dim')?.textContent).toBe('simplified');
  });

  it('shows the sentence-level register', () => {
    const doc = render(state());
    expect(doc.querySelector('.ai-band-plain')?.textContent).toBe('Casual (plain form)');
    expect(doc.body.textContent).toContain('Written prose or speech to a peer.');
  });

  it('shows the difficulty band and the nuance / pitfall notes', () => {
    const doc = render(state());
    expect(doc.querySelector('.ai-band')?.textContent).toBe('N3');
    expect(doc.body.textContent).toContain('Reads as a maxim rather than a report.');
    expect(doc.querySelector('.ai-notes.warn')?.textContent).toContain('Do not read だ as polite');
  });
});

describe('extension AI panel — degraded responses', () => {
  it('renders a sentence with no annotations without throwing or losing text', () => {
    const doc = render(state({ result: analysis({ annotations: [] }) }));
    expect(doc.querySelector('.ai-sentence')?.textContent).toBe(SENTENCE);
    expect(doc.querySelector('.ai-seg')).toBeNull();
    expect(doc.querySelector('.ai-detail')).toBeNull();
  });

  it('omits every section the analysis does not carry', () => {
    const bare = analysis({
      translations: { en: 'Life is choices.' },
      literal: undefined,
      formality: undefined,
      structure: undefined,
      nuance: [],
      pitfalls: [],
    });
    const doc = render(state({ result: bare }));
    expect(doc.querySelector('.ai-literal')).toBeNull();
    expect(doc.querySelector('.ai-band-plain')).toBeNull();
    expect(doc.querySelector('.ai-notes')).toBeNull();
    // The sentence and the detail card still render.
    expect(doc.querySelectorAll('.ai-seg').length).toBeGreaterThan(0);
    expect(doc.querySelector('.ai-detail')).not.toBeNull();
  });

  it('survives a selected index past the end of the annotation list', () => {
    const doc = render(state({ selected: 99 }));
    expect(doc.querySelector('.ai-detail')).toBeNull();
    expect(doc.querySelectorAll('.ai-seg')).toHaveLength(RAW_ANNOTATIONS.length);
  });

  it('renders the loading state with the sentence already visible', () => {
    const doc = render(state({ status: 'loading', result: null }));
    expect(doc.querySelector('.ai-source')?.textContent).toBe(SENTENCE);
    expect(doc.querySelector('.ai-loading')?.textContent).toBe('Analyzing the sentence…');
  });

  it('renders the error state with a retry and a close', () => {
    const doc = render(state({ status: 'error', result: null, error: 'Gemini returned 429.' }));
    expect(doc.body.textContent).toContain('Gemini returned 429.');
    const acts = Array.from(doc.querySelectorAll('.ai-actions button')).map((b) =>
      b.getAttribute('data-act'),
    );
    expect(acts).toEqual(['reanalyze', 'close']);
  });
});

describe('extension AI panel — escaping', () => {
  it('does not let page-shaped text out of the model become markup', () => {
    const hostile = analysis({
      sentence: '<img src=x onerror=alert(1)>',
      annotations: [],
      translations: { en: '<script>alert(2)</script>' },
      nuance: [],
      pitfalls: [],
      formality: undefined,
      structure: undefined,
      literal: undefined,
    });
    const doc = render(state({ result: hostile, text: hostile.sentence }));
    expect(doc.querySelector('img')).toBeNull();
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('.ai-sentence')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(doc.querySelector('.ai-translation')?.textContent).toBe('<script>alert(2)</script>');
  });

  it('escapes a quote inside the title attribute rather than breaking out of it', () => {
    const quoted = analysis({
      sentence: 'これはテストだ。',
      annotations: alignAnnotations('これはテストだ。', [
        {
          text: 'これは',
          category: 'particle',
          meaning: 'a "topic" marker',
          explanation: 'x',
          examples: [],
          vocabulary: [],
        },
      ]),
    });
    const doc = render(state({ result: quoted }));
    expect(doc.querySelector('.ai-seg')?.getAttribute('title')).toBe('a "topic" marker');
  });
});

describe('extension and app agree', () => {
  it('highlights the same spans the app would', () => {
    const result = analysis();
    const appSpans = sentencePieces(result.sentence, result.annotations)
      .filter((p) => p.kind === 'annotation')
      .map((p) => p.text);
    const extSpans = Array.from(render(state({ result })).querySelectorAll('.ai-seg')).map(
      (s) => s.textContent,
    );
    expect(extSpans).toEqual(appSpans);
  });

  it('picks the same lead translation as the app for every UI language', () => {
    const result = analysis();
    for (const uiLang of ['en', 'ja', 'zh', 'ru']) {
      expect(shared.aiPrimaryTranslation(result, uiLang, 'ja')).toBe(
        primaryTranslation(result, uiLang, 'ja'),
      );
    }
  });

  it('maps keys to the same commands as the app', () => {
    const events = [
      { key: 'c' },
      { key: 'A' },
      { key: 's' },
      { key: 'w' },
      { key: 'l' },
      { key: 'd' },
      { key: 't' },
      { key: 'r' },
      { key: '1' },
      { key: '9' },
      { key: '0' },
      { key: 'q' },
      { key: 'Escape' },
      { key: 'ArrowRight' },
      { key: 'ArrowLeft' },
      { key: 'c', ctrlKey: true },
      { key: 'd', altKey: true },
    ];
    for (const e of events) {
      expect(shared.aiCommandForKey(e)).toEqual(analysisCommandForKey(e));
    }
  });

  it('guards text entry the same way the app does', () => {
    expect(shared.aiIsTextEntry({ tagName: 'INPUT' })).toBe(true);
    expect(shared.aiIsTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(shared.aiIsTextEntry({ tagName: 'DIV' })).toBe(false);
    expect(shared.aiIsTextEntry(null)).toBe(false);
  });

  it('uses the same category vocabulary as the app', () => {
    expect(shared.AI_CATEGORIES).toEqual([
      'grammar',
      'vocabulary',
      'particle',
      'expression',
      'idiom',
      'name',
    ]);
  });
});
