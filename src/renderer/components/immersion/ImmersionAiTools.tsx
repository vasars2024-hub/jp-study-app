/**
 * The immersion reader's optional AI tools, under the Reader Mode bar:
 *
 * - "Explain i+1 sentences": the page's i+1 sentences (the ones the i+1 toggle
 *   paints, found by the same rule), each with "Explain" (AI: translation, why
 *   it is phrased that way, grammar, what the unknown word means here) and
 *   "Look up" (the dictionary — the fallback that needs no AI).
 * - "Simplify": offered when the page's known-word coverage is low. The
 *   paragraph holding the selection (or the start of the page) is rewritten in
 *   easier text, shown BESIDE the original and labelled AI. Without AI the panel
 *   still lists the paragraph's unknown words to look up first.
 * - "Ask Agent about selection": the NovelReader hand-off, from this reader.
 *
 * Lazy-loaded by `ImmersionContent`. Every AI control is `data-ai-entry`, so the
 * reader looks exactly as before while "Use AI features" is off.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { immerseLevelLine } from '../../../shared/aiImmerseCommon';
import {
  READER_SIMPLIFY_MAX_CHARS,
  type LineExplainResult,
  type ReaderSimplifyResult,
} from '../../../shared/aiImmerseLine';
import { imm5IPlusOneSentences, type Imm5PageCoverage } from '../../../shared/immersionStudy5';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import { immersionHostOf } from '../../../shared/immersion';
import type { StudyLang } from '../../../shared/studyLang';
import { handOffToAgent, routeAgentContext, selectedTextAgentContext } from '../../agentContextHandoff';
import { useAiReadiness } from '../../aiSetupClient';
import { useT } from '../../i18n';
import { imm5BlockText } from '../../immersionStudy5Dom';
import { AiSetupPrompt } from '../ai/AiSetupPrompt';
import { AiImmerseBadge, AiImmerseStatus, useAiImmerseRequest } from '../ai/aiImmerseRequest';

/** Same blocks the i+1 painter measures (`immersionStudy5Dom`). */
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, dd, dt, td, th, figcaption, div, section, article';
/** Below this known-word share the page is a stretch, and Simplify is offered. */
const SIMPLIFY_BELOW_PCT = 90;
const MAX_SENTENCES = 30;
const MAX_UNKNOWN_WORDS = 40;

interface PageSentence {
  key: string;
  text: string;
  target: string;
  context: string;
}

/** The i+1 sentences under `root`, in reading order, each with its block as context. */
function collectIPlusOneSentences(root: Element): PageSentence[] {
  const out: PageSentence[] = [];
  const seen = new Set<string>();
  const blocks = [root, ...Array.from(root.querySelectorAll(BLOCK_SELECTOR))];
  for (const block of blocks) {
    const { text, words } = imm5BlockText(block);
    if (!words.length) continue;
    for (const sentence of imm5IPlusOneSentences(text, words)) {
      const line = text.slice(sentence.start, sentence.end).replace(/\s+/g, ' ').trim();
      if (!line || seen.has(line)) continue;
      seen.add(line);
      out.push({
        key: `${out.length}:${sentence.start}`,
        text: line,
        target: text.slice(sentence.word.start, sentence.word.end),
        context: text.replace(/\s+/g, ' ').trim().slice(0, 600),
      });
    }
  }
  return out;
}

/** The reader block holding the current selection, if the selection is in the reader. */
function selectionBlock(root: Element): Element | null {
  const selection = window.getSelection();
  const node = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
  const element = node ? (node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement) : null;
  if (!element || !root.contains(element)) return null;
  return element.closest('p, li, blockquote, dd, td, figcaption') ?? null;
}

/** Plain text of `el` without furigana. */
function plainText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('rt, rp, script, style').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Unknown lemmas (known-word level below 2) under `el`, in page order. */
function unknownWords(el: Element): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  el.querySelectorAll('span.wk[data-lemma]').forEach((span) => {
    if (out.length >= MAX_UNKNOWN_WORDS || span.closest('rt, rp') || span.hasAttribute('data-proper')) return;
    const m = /\bwk-(\d)\b/.exec(span.className);
    const level = m ? Number(m[1]) : 3;
    const lemma = span.getAttribute('data-lemma') ?? '';
    if (level >= 2 || !lemma || seen.has(lemma)) return;
    seen.add(lemma);
    out.push(lemma);
  });
  return out;
}

function lookUp(query: string, context?: string): void {
  window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query, ...(context ? { context } : {}) } }));
}

type Panel = 'none' | 'explain' | 'simplify';

export default function ImmersionAiTools({
  readerRef,
  readerHtml,
  coverage,
  studyLang,
  currentUrl,
  title,
}: {
  readerRef: RefObject<HTMLDivElement | null>;
  /** Changes when the article does: every answer about the old page is dropped. */
  readerHtml: string;
  coverage: Imm5PageCoverage | null;
  studyLang: StudyLang;
  currentUrl: string;
  title: string;
}) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [panel, setPanel] = useState<Panel>('none');
  const [sentences, setSentences] = useState<PageSentence[]>([]);
  const [explainKey, setExplainKey] = useState('');
  const [simplifySource, setSimplifySource] = useState<{ text: string; words: string[] } | null>(null);
  const explain = useAiImmerseRequest<LineExplainResult>();
  const simplify = useAiImmerseRequest<ReaderSimplifyResult>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setPanel('none');
    setSentences([]);
    setExplainKey('');
    setSimplifySource(null);
    explain.reset();
    simplify.reset();
  }, [readerHtml]);

  useEffect(() => {
    if (panel !== 'none') headingRef.current?.focus();
  }, [panel]);

  const knownPct = coverage?.knownPct ?? null;
  const level = immerseLevelLine(knownPct, studyLang);
  const lowCoverage = knownPct != null && knownPct < SIMPLIFY_BELOW_PCT;
  const aiReady = ai.loaded && ai.enabled && ai.ready;

  const openExplain = (): void => {
    const root = readerRef.current;
    setSentences(root ? collectIPlusOneSentences(root) : []);
    setExplainKey('');
    explain.reset();
    setPanel('explain');
  };

  const openSimplify = (): void => {
    const root = readerRef.current;
    if (!root) return;
    const block = selectionBlock(root);
    const source = block ?? root;
    const text = plainText(source).slice(0, READER_SIMPLIFY_MAX_CHARS);
    setSimplifySource(text ? { text, words: unknownWords(source) } : null);
    simplify.reset();
    setPanel('simplify');
  };

  const runExplain = (sentence: PageSentence, refresh = false): void => {
    setExplainKey(sentence.key);
    void explain.run((requestId) => window.api.aiImmerseExplainLine({
      requestId,
      surface: 'reader',
      text: sentence.text,
      target: sentence.target,
      context: sentence.context,
      speaker: '',
      studyLang,
      answerLang: uiLang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const runSimplify = (refresh = false): void => {
    if (!simplifySource) return;
    void simplify.run((requestId) => window.api.aiImmerseSimplify({
      requestId,
      text: simplifySource.text,
      studyLang,
      answerLang: uiLang,
      level,
      unknownWords: simplifySource.words,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const askAgent = (): void => {
    const root = readerRef.current;
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    const node = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
    if (!root || !text || !node || !root.contains(node)) {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('aiImmerse.reader.selectFirst') } }));
      return;
    }
    const block = selectionBlock(root);
    void handOffToAgent(
      selectedTextAgentContext(text, block ? plainText(block).slice(0, 400) : text),
      // The site, never the selection: a conversation title is persisted (see NovelReader).
      t('agent.conversation.fromReading', { label: immersionHostOf(currentUrl) || title || t('aiImmerse.reader.page') }),
      routeAgentContext('immersion', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.immersion)),
    );
  };

  const explained = explain.state.status === 'done' ? explain.state.result : null;
  const simplified = simplify.state.status === 'done' ? simplify.state.result : null;
  const shownSentences = useMemo(() => sentences.filter((_, index) => index < MAX_SENTENCES), [sentences]);

  return (
    <div className="imm5-ai-tools" data-ai-entry data-imm5-ai-tools="">
      <div className="ai-immerse-actions" role="group" aria-label={t('aiImmerse.reader.tools')}>
        <button
          type="button"
          className="btn small ai-immerse-btn"
          aria-expanded={panel === 'explain'}
          data-imm5-action="ai-explain"
          onClick={() => (panel === 'explain' ? setPanel('none') : openExplain())}
        >
          {t('aiImmerse.reader.explainOpen')}
        </button>
        {lowCoverage && (
          <button
            type="button"
            className="btn small ai-immerse-btn"
            aria-expanded={panel === 'simplify'}
            data-imm5-action="ai-simplify"
            title={t('aiImmerse.reader.simplifyTitle', { percent: knownPct ?? 0 })}
            onClick={() => (panel === 'simplify' ? setPanel('none') : openSimplify())}
          >
            {t('aiImmerse.reader.simplifyOpen')}
          </button>
        )}
        <button
          type="button"
          className="btn small ai-immerse-btn"
          data-imm5-action="ask-agent"
          // Keep the reader's selection: the button must not take it away on press.
          onMouseDown={(event) => event.preventDefault()}
          onClick={askAgent}
        >
          {t('aiImmerse.reader.askAgent')}
        </button>
      </div>

      {panel === 'explain' && (
        <section className="ai-immerse" aria-label={t('aiImmerse.reader.explainTitle')} data-imm5-ai-panel="explain">
          <div className="ai-immerse-head">
            <h4 ref={headingRef} tabIndex={-1}>{t('aiImmerse.reader.explainTitle')}</h4>
            <button
              type="button"
              className="btn small ai-immerse-btn"
              aria-label={t('aiImmerse.close')}
              title={t('aiImmerse.close')}
              onClick={() => {
                explain.reset();
                setPanel('none');
              }}
            >
              ×
            </button>
          </div>
          {!aiReady && <AiSetupPrompt compact reasonKey="aiImmerse.notReady" />}
          {sentences.length === 0 ? (
            <p className="muted ai-immerse-note">{t('aiImmerse.reader.noSentences')}</p>
          ) : (
            <ul className="ai-immerse-list">
              {shownSentences.map((sentence) => (
                <li key={sentence.key} className="ai-immerse-item" data-imm5-ai-sentence="">
                  <p className="ai-immerse-note" lang={studyLang}>
                    {sentence.text}{' '}
                    <mark className="ai-immerse-target">{sentence.target}</mark>
                  </p>
                  <div className="ai-immerse-actions">
                    {aiReady && (
                      <button
                        type="button"
                        className="btn small primary ai-immerse-btn"
                        disabled={explain.state.status === 'running' && explainKey === sentence.key}
                        onClick={() => runExplain(sentence, explainKey === sentence.key && Boolean(explained))}
                      >
                        {t(explainKey === sentence.key && explained ? 'aiImmerse.askAgain' : 'aiImmerse.reader.explain')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn small ai-immerse-btn"
                      onClick={() => lookUp(sentence.target, sentence.text)}
                    >
                      {t('aiImmerse.reader.lookUp', { word: sentence.target })}
                    </button>
                  </div>
                  {explainKey === sentence.key && (
                    <>
                      <AiImmerseStatus state={explain.state} onCancel={explain.cancel} />
                      {explained && (
                        <div className="ai-immerse-answer" data-imm5-ai-answer="">
                          <AiImmerseBadge />
                          <p lang={uiLang}><strong>{t('aiImmerse.translation')}</strong> {explained.translation}</p>
                          <p lang={uiLang}>{explained.explanation}</p>
                          {explained.targetMeaning && (
                            <p lang={uiLang}>
                              {t('aiImmerse.reader.targetMeans', { word: sentence.target, meaning: explained.targetMeaning })}
                            </p>
                          )}
                          {explained.grammar.length > 0 && (
                            <ul className="ai-immerse-list">
                              {explained.grammar.map((entry, index) => (
                                <li key={`${entry.pattern}-${index}`}>
                                  <span lang={studyLang}>{entry.pattern}</span>{' — '}<span lang={uiLang}>{entry.note}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {sentences.length > MAX_SENTENCES && (
            <p className="muted ai-immerse-meta">{t('common.moreNotShown', { count: sentences.length - MAX_SENTENCES })}</p>
          )}
        </section>
      )}

      {panel === 'simplify' && (
        <section className="ai-immerse" aria-label={t('aiImmerse.reader.simplifyTitleShort')} data-imm5-ai-panel="simplify">
          <div className="ai-immerse-head">
            <h4 ref={headingRef} tabIndex={-1}>{t('aiImmerse.reader.simplifyTitleShort')}</h4>
            <button
              type="button"
              className="btn small ai-immerse-btn"
              aria-label={t('aiImmerse.close')}
              title={t('aiImmerse.close')}
              onClick={() => {
                simplify.reset();
                setPanel('none');
              }}
            >
              ×
            </button>
          </div>
          {!simplifySource ? (
            <p className="muted ai-immerse-note">{t('aiImmerse.reader.nothingToSimplify')}</p>
          ) : (
            <>
              <p className="muted ai-immerse-meta">{t('aiImmerse.reader.simplifyHint')}</p>
              {simplifySource.words.length > 0 && (
                <>
                  <p className="ai-immerse-section-label">{t('aiImmerse.reader.unknownWords', { count: simplifySource.words.length })}</p>
                  <div className="ai-immerse-words">
                    {simplifySource.words.map((word) => (
                      <button key={word} type="button" className="btn small ai-immerse-btn" lang={studyLang} onClick={() => lookUp(word)}>
                        {word}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!aiReady && <AiSetupPrompt compact reasonKey="aiImmerse.notReady" />}
              {aiReady && simplify.state.status !== 'running' && (
                <div className="ai-immerse-actions">
                  <button type="button" className="btn small primary ai-immerse-btn" onClick={() => runSimplify(Boolean(simplified))}>
                    {t(simplified ? 'aiImmerse.askAgain' : 'aiImmerse.reader.simplify')}
                  </button>
                </div>
              )}
              <AiImmerseStatus state={simplify.state} onCancel={simplify.cancel} busyKey="aiImmerse.reader.simplifyBusy" />
              {simplified && (
                <div className="ai-immerse-compare" data-imm5-ai-answer="">
                  <section aria-label={t('aiImmerse.reader.original')}>
                    <p className="ai-immerse-section-label">{t('aiImmerse.reader.original')}</p>
                    <span lang={studyLang}>{simplifySource.text}</span>
                  </section>
                  <section className="is-ai" aria-label={t('aiImmerse.reader.simplified')}>
                    <AiImmerseBadge />
                    <p className="ai-immerse-section-label">{t('aiImmerse.reader.simplified')}</p>
                    <span lang={studyLang}>{simplified.simplified}</span>
                    {simplified.notes.length > 0 && (
                      <ul className="ai-immerse-list">
                        {simplified.notes.map((note, index) => <li key={index} lang={uiLang}>{note}</li>)}
                      </ul>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
