import { useEffect, useRef, useState } from 'react';
import {
  EXPLANATION_PROMPT_VERSION,
  type LexiconExplanation,
} from '../../../shared/lexiconExplanations';
import { explainModelKey } from '../../../shared/lexiconExplainPrompt';
import {
  EXPLANATION_SECTION_LABEL_KEYS,
  explainErrorLabelKey,
  explainGroundingFromSenses,
  explainPolicyFromEngine,
  type ExplainEngineResolution,
  type ExplainSenseLike,
} from '../../../shared/lexiconExplainView';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';
import './entryExplain.css';

interface Props {
  /** The matched headword, not the raw query — an explanation belongs to the word that was found. */
  word: string;
  reading: string;
  /** The language the *word* is in. Never the language the prose is written in. */
  lang: string;
  senses: readonly ExplainSenseLike[];
}

type RunState = 'idle' | 'running';

const BLOCK_LABEL_KEYS = {
  'cloud-key': 'lexicon.wordExplain.blockedKey',
  'local-model': 'lexicon.wordExplain.blockedLocal',
} as const;

/**
 * A model-written explanation of the looked-up word, and the controls for the
 * two things a reader can do about one: ask again, or throw it away.
 *
 * Nothing is generated unasked. A model call costs time and sometimes money, so
 * opening this panel reads the *cache* only; the request is a button. What that
 * makes possible is the useful case — a word explained once stays explained, on
 * disk, offline, with nothing sent the second time — and the panel says which of
 * the two happened rather than letting a stored answer look freshly written.
 *
 * The provider comes from the app's AI engine configuration, not from a control
 * here; `explainPolicyFromEngine` documents why, and refuses before anything is
 * sent when that configuration cannot answer at all.
 */
export default function EntryExplain({ word, reading, lang, senses }: Props) {
  const { t, lang: uiLang } = useT();
  const [engine, setEngine] = useState<ExplainEngineResolution | null>(null);
  const [explanation, setExplanation] = useState<LexiconExplanation | null>(null);
  const [state, setState] = useState<RunState>('idle');
  const [failure, setFailure] = useState<{ error?: string; code?: string } | null>(null);
  const run = useRef(0);

  // The prose language is the language the app is being read in. A reader who
  // switches the interface to Russian is asking for a Russian explanation, and
  // `glossLang` is part of the storage key, so the English one they already have
  // is kept rather than overwritten.
  const glossLang = uiLang;

  useEffect(() => {
    const attempt = ++run.current;
    setEngine(null);
    setExplanation(null);
    setState('idle');
    setFailure(null);
    if (!word || !lang) return;
    // A preload without these bindings cannot explain and cannot read a stored
    // explanation either, so the panel stays absent rather than offering a
    // button that would do nothing. The renderer reloads independently of the
    // main process, so this is a state that really occurs.
    if (typeof window.api?.dictExplain !== 'function') return;
    if (typeof window.api?.dictExplanationGet !== 'function') return;
    void window.api
      .aiGetConfig()
      .then(async (config) => {
        if (attempt !== run.current) return;
        const resolved = explainPolicyFromEngine({
          engine: config.engine,
          providerId: config.providerId,
          apiKeysSet: config.apiKeysSet,
          localModelAvailable: config.localModelAvailable,
        });
        setEngine(resolved);
        if (!resolved.ok) return;
        // Cache read only. Reaching `dict:explain` here would explain every word
        // the user looks up, at their expense, without them asking for one.
        const stored = await window.api.dictExplanationGet({
          lang,
          text: word,
          reading,
          glossLang,
          model: explainModelKey(resolved.policy),
          promptVersion: EXPLANATION_PROMPT_VERSION,
        });
        if (attempt === run.current) setExplanation(stored);
      })
      .catch(() => {
        // No configuration and no database are both "nothing to show", which is
        // what a null engine already renders.
      });
  }, [word, reading, lang, glossLang]);

  async function explain(refresh: boolean): Promise<void> {
    if (state === 'running' || !engine?.ok) return;
    const attempt = run.current;
    setState('running');
    setFailure(null);
    try {
      /**
       * The policy is resolved HERE, from the live configuration, not carried from mount.
       *
       * The effect above reads `aiGetConfig()` once per word and its deps are the word, not the
       * configuration — nothing re-runs it when the user changes their AI provider. So the button
       * kept sending the provider that was selected when the panel mounted. Measured live: the
       * provider was switched to `deepseek-v4-pro` with a key set for it (`aiGetConfig` confirmed
       * `providerId: 'deepseek-v4-pro'`), one click on "Explain this word" answered, and the
       * answer's own provenance line read `From cloud:gemini-2.5-flash:default`. The app told the
       * truth about which model wrote it — the request had simply gone somewhere the user had
       * stopped choosing, and been billed there.
       *
       * A stale resolution that has since become unusable renders the blocked message instead of
       * calling a provider whose key is gone, which is the same honest state the mount path shows.
       */
      const live = explainPolicyFromEngine(await window.api.aiGetConfig());
      if (attempt !== run.current) return;
      setEngine(live);
      if (!live.ok) {
        setState('idle');
        return;
      }
      const result = await window.api.dictExplain({
        key: { lang, text: word, reading, glossLang },
        grounding: explainGroundingFromSenses(senses),
        policy: live.policy,
        refresh,
      });
      if (attempt !== run.current) return;
      setState('idle');
      if (result.ok && result.explanation) {
        setExplanation(result.explanation);
        return;
      }
      // A failed refresh leaves the previous answer on screen because it leaves
      // it in the database too — nothing is stored on a failure. Replacing it
      // with an error would suggest the stored one is gone.
      setFailure({ error: result.error, code: result.code });
    } catch {
      if (attempt === run.current) {
        setState('idle');
        setFailure({});
      }
    }
  }

  async function forget(): Promise<void> {
    const attempt = run.current;
    try {
      await window.api.dictExplanationClear({ lang, text: word, reading });
    } catch {
      // The panel returns to its offer either way: an explanation that could not
      // be deleted is still one the reader has said they do not want.
    }
    if (attempt !== run.current) return;
    setExplanation(null);
    setFailure(null);
  }

  if (!engine) return null;

  return (
    <details className="lexicon-explain-entry" open={Boolean(explanation)}>
      <summary>{t('lexicon.wordExplain.title')}</summary>
      {!engine.ok ? (
        <p className="muted lexicon-explain-blocked">{t(BLOCK_LABEL_KEYS[engine.blocked])}</p>
      ) : (
        <>
          <p className="muted lexicon-explain-about">{t('lexicon.wordExplain.about')}</p>
          {explanation ? (
            <div className="lexicon-explain-answer" lang={glossLang}>
              {explanation.summary && (
                <p className="lexicon-explain-summary">{explanation.summary}</p>
              )}
              {explanation.sections.map((section) => (
                <section className="lexicon-explain-section" key={section.kind}>
                  <h4>{t(EXPLANATION_SECTION_LABEL_KEYS[section.kind])}</h4>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
          ) : (
            <p className="muted lexicon-explain-empty">{t('lexicon.wordExplain.empty')}</p>
          )}
          <div className="lexicon-explain-actions">
            <button
              className="lexicon-explain-ask"
              disabled={state === 'running'}
              onClick={() => void explain(Boolean(explanation))}
              type="button"
            >
              {t(
                state === 'running'
                  ? 'lexicon.wordExplain.running'
                  : explanation
                    ? 'lexicon.wordExplain.again'
                    : 'lexicon.wordExplain.ask',
              )}
            </button>
            {explanation && (
              <button
                className="lexicon-explain-forget"
                disabled={state === 'running'}
                onClick={() => void forget()}
                type="button"
              >
                {t('lexicon.wordExplain.forget')}
              </button>
            )}
          </div>
          {/* Both halves of the provenance, because a cached answer and a fresh
              one look identical and only one of them was just paid for. */}
          {explanation && (
            <p className="muted lexicon-explain-provenance">
              {t('lexicon.wordExplain.provenance', {
                model: explanation.model,
                date: new Date(explanation.createdAt).toLocaleDateString(LANG_TAGS[uiLang]),
              })}
            </p>
          )}
          {failure && (
            <p className="lexicon-explain-error" role="alert">
              {t(explainErrorLabelKey(failure.error))}
              {failure.code && (
                <>
                  {' '}
                  <code className="lexicon-explain-code">{failure.code}</code>
                </>
              )}
            </p>
          )}
        </>
      )}
    </details>
  );
}
