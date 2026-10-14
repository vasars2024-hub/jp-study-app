import { useCallback, useEffect, useRef, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import type { TranslateAnalysisResult } from '../../shared/translateAnalysisCore';
import { aiErrorKey, isAiErrorCode } from '../../shared/aiErrorCodes';
import { isCloudTranslateProvider, translateProviderLabel } from '../../shared/translateProviders';
import ParticleBreakdown from './translate-analysis/ParticleBreakdown';
import FormalityToggle from './translate-analysis/FormalityToggle';
import DeclensionDrawer from './translate-analysis/DeclensionDrawer';
import MeasureWordGuide from './translate-analysis/MeasureWordGuide';
import { AiSetupPrompt } from './ai/AiSetupPrompt';
import { useAiReadiness } from '../aiSetupClient';
import { translateProviderAvailability, useTranslateProviders } from '../translateProviderClient';
import { useT } from '../i18n';
import { AiStreamDraft, aiStreamPreviewText, subscribeAiStream } from './ai/aiStream';

let analyzeCounter = 0;

// Orchestrates the linguistic-analysis panels under the Translate view.
// The Japanese particle breakdown is fully offline (kuromoji); formality,
// declension, and measure words come from the cloud provider configured in
// Settings > AI — even when the translation itself ran offline, which is why
// the panel says so in words rather than leaving the sections missing. Hidden
// entirely while "Use AI features" is off. Only this component talks to
// window.api; the sub-widgets are pure presentational.
//
// Consent: the cloud half sends the sentence and its translation to the
// provider, so it runs only once that provider has the Translate consent (the
// same opt-in the engine picker asks for). Main enforces this too
// (`main/translateAnalysis.ts`); the check here only decides whether to ask.
export default function SentenceAnalysisPanel({
  sourceText,
  translatedText,
  source,
  target,
}: {
  sourceText: string;
  translatedText: string;
  source: string;
  target: string;
}) {
  const { t, lang: uiLang } = useT();
  const jaInvolved = source === 'ja' || target === 'ja';
  const jaText = source === 'ja' ? sourceText : target === 'ja' ? translatedText : '';

  const [tokens, setTokens] = useState<JpToken[] | null>(null);
  const [result, setResult] = useState<TranslateAnalysisResult | null>(null);
  const [partial, setPartial] = useState(false);
  const ai = useAiReadiness();
  const engines = useTranslateProviders(source, target);
  const providerId = ai.providerId;
  const consented = Boolean(
    providerId && translateProviderAvailability(engines.snapshot, providerId)?.consented,
  );
  const cloudAnalysis = ai.loaded && ai.enabled && ai.cloudReady;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsConsent, setNeedsConsent] = useState(false);
  /** Bumped by "Re-analyze": the next run bypasses the cache. */
  const [refreshNonce, setRefreshNonce] = useState(0);
  const reqRef = useRef(0);
  const refreshRef = useRef(false);
  /** The analysis as it streams in, and the id that cancels it (`translate:analyzeCancel`). */
  const [draft, setDraft] = useState('');
  const [stopped, setStopped] = useState(false);
  const activeRequest = useRef<string | null>(null);

  // Offline particle path: tokenize the Japanese side as soon as it exists.
  useEffect(() => {
    let alive = true;
    setTokens(null);
    if (!jaText.trim()) return;
    getTokenizer()
      .then(() => {
        if (alive) setTokens(tokenizeSync(jaText));
      })
      .catch(() => {
        if (alive) setTokens([]);
      });
    return () => {
      alive = false;
    };
  }, [jaText]);

  // Cloud analysis: one combined call per translated sentence. Waits for the
  // tokenizer when Japanese is involved so particle notes can be aligned.
  useEffect(() => {
    const id = ++reqRef.current;
    const refresh = refreshRef.current;
    refreshRef.current = false;
    setResult(null);
    setPartial(false);
    setError('');
    setNeedsConsent(false);
    setLoading(false);
    setDraft('');
    setStopped(false);
    if (!translatedText.trim() || !sourceText.trim()) return;
    if (jaInvolved && tokens === null) return;
    if (!cloudAnalysis) return;
    if (!consented) {
      setNeedsConsent(true);
      return;
    }
    let alive = true;
    analyzeCounter += 1;
    const requestId = `tra-${Date.now().toString(36)}-${analyzeCounter}`;
    activeRequest.current = requestId;
    const unsubscribe = subscribeAiStream(requestId, (raw) => {
      if (alive && id === reqRef.current) setDraft(aiStreamPreviewText(raw));
    });
    void (async () => {
      try {
        setLoading(true);
        const jaParticleTokens = jaInvolved
          ? (tokens ?? []).filter((tok) => tok.pos === '助詞').map((tok) => tok.surface)
          : undefined;
        const res = await window.api.translateAnalyze({
          sourceText,
          translatedText,
          source,
          target,
          jaParticleTokens,
          explainIn: uiLang,
          requestId,
          ...(refresh ? { refresh: true } : {}),
        });
        if (!alive || id !== reqRef.current) return;
        activeRequest.current = null;
        setLoading(false);
        if (res.code === 'cancelled') {
          // Cancel keeps what had streamed in; Re-analyze asks again.
          setStopped(true);
          return;
        }
        setDraft('');
        if (res.ok && res.result) {
          setResult(res.result);
          setPartial(Boolean(res.partial));
        } else if (res.needsConsent) {
          setNeedsConsent(true);
        } else {
          setError(isAiErrorCode(res.code) ? t(aiErrorKey(res.code)) : t('lens.ai.error'));
        }
      } catch {
        if (!alive || id !== reqRef.current) return;
        setLoading(false);
        setDraft('');
        setError(t(aiErrorKey('ipc-failed')));
      } finally {
        unsubscribe();
      }
    })();
    return () => {
      alive = false;
      unsubscribe();
      // A newer sentence (or leaving the view) makes this analysis irrelevant: stop it.
      if (activeRequest.current === requestId) {
        activeRequest.current = null;
        void window.api.translateAnalyzeCancel?.(requestId)?.catch(() => undefined);
      }
    };
  }, [sourceText, translatedText, source, target, tokens, jaInvolved, cloudAnalysis, consented, uiLang, refreshNonce, t]);

  const cancel = useCallback(() => {
    const requestId = activeRequest.current;
    if (!requestId) return;
    activeRequest.current = null;
    reqRef.current += 1;
    void window.api.translateAnalyzeCancel?.(requestId)?.catch(() => undefined);
    setLoading(false);
    setStopped(true);
  }, []);

  const reanalyze = useCallback(() => {
    refreshRef.current = true;
    setRefreshNonce((n) => n + 1);
  }, []);

  // Both must be present: post-swap the view clears the snapshot while the
  // output pane still shows repurposed text — no analysis should render then.
  if (!translatedText.trim() || !sourceText.trim()) return null;

  const providerName = providerId ? translateProviderLabel(providerId, t) : '';

  return (
    <div className="tr-analysis">
      {jaInvolved && tokens && tokens.length > 0 && (
        <ParticleBreakdown tokens={tokens} notes={result?.particleNotes} />
      )}
      {ai.loaded && ai.enabled && !ai.cloudReady && (
        <AiSetupPrompt compact reasonKey="sentenceAnalysis.needKey" settingId="ai-provider" />
      )}
      {needsConsent && cloudAnalysis && (
        <div className="tr-analysis-consent muted" role="note">
          <p>{t('aiFix.analysis.needsConsent', { provider: providerName })}</p>
          {providerId && isCloudTranslateProvider(providerId) && (
            <button
              type="button"
              className="btn small"
              onClick={() => void engines.setConsent(providerId, true)}
            >
              {t('xlate2.consent.allow', { provider: providerName })}
            </button>
          )}
        </div>
      )}
      {loading && (
        <div className="tr-analysis-loading">
          <span className="media-gen-dot" />
          <span className="muted">{t('sentenceAnalysis.analyzing')}</span>
          <button type="button" className="btn small tr-analysis-cancel" onClick={cancel}>
            {t('aiStudy.stream.stop')}
          </button>
        </div>
      )}
      {(loading || stopped) && (
        <AiStreamDraft text={draft} state={stopped ? 'stopped' : 'drafting'} lang={uiLang} />
      )}
      {error && <p className="tr-analysis-error muted">{t('sentenceAnalysis.unavailable', { error })}</p>}
      {result?.formality && <FormalityToggle variants={result.formality} lang={target} />}
      {result?.declension && <DeclensionDrawer items={result.declension} />}
      {(result?.measureWords || result?.aspectNotes) && (
        <MeasureWordGuide measureWords={result.measureWords} aspectNotes={result.aspectNotes} />
      )}
      {partial && <p className="tr-analysis-error muted">{t('aiFix.analysis.partial')}</p>}
      {(result || error || stopped) && !loading && (
        <button type="button" className="btn small tr-analysis-retry" onClick={reanalyze}>
          {t('lens.ai.reanalyze')}
        </button>
      )}
    </div>
  );
}
