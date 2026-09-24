import { useEffect, useRef, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import type { TranslateAnalysisResult } from '../../shared/translateAnalysisCore';
import ParticleBreakdown from './translate-analysis/ParticleBreakdown';
import FormalityToggle from './translate-analysis/FormalityToggle';
import DeclensionDrawer from './translate-analysis/DeclensionDrawer';
import MeasureWordGuide from './translate-analysis/MeasureWordGuide';
import { AiSetupPrompt } from './ai/AiSetupPrompt';
import { useAiReadiness } from '../aiSetupClient';
import { useT } from '../i18n';

// Orchestrates the linguistic-analysis panels under the Translate view.
// The Japanese particle breakdown is fully offline (kuromoji); formality,
// declension, and measure words come from the cloud provider configured in
// Settings > AI — even when the translation itself ran offline, which is why
// the panel says so in words rather than leaving the sections missing. Hidden
// entirely while "Use AI features" is off. Only this component talks to
// window.api; the sub-widgets are pure presentational.
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
  const { t } = useT();
  const jaInvolved = source === 'ja' || target === 'ja';
  const jaText = source === 'ja' ? sourceText : target === 'ja' ? translatedText : '';

  const [tokens, setTokens] = useState<JpToken[] | null>(null);
  const [result, setResult] = useState<TranslateAnalysisResult | null>(null);
  const ai = useAiReadiness();
  const cloudAnalysis = ai.loaded && ai.enabled && ai.cloudReady;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const reqRef = useRef(0);

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
    setResult(null);
    setError('');
    setLoading(false);
    if (!translatedText.trim() || !sourceText.trim()) return;
    if (jaInvolved && tokens === null) return;
    if (!cloudAnalysis) return;
    let alive = true;
    void (async () => {
      try {
        setLoading(true);
        const jaParticleTokens = jaInvolved
          ? (tokens ?? []).filter((t) => t.pos === '助詞').map((t) => t.surface)
          : undefined;
        const res = await window.api.translateAnalyze({
          sourceText,
          translatedText,
          source,
          target,
          jaParticleTokens,
        });
        if (!alive || id !== reqRef.current) return;
        setLoading(false);
        if (res.ok && res.result) setResult(res.result);
        else setError(res.error ?? t('lens.ai.error'));
      } catch (err) {
        if (!alive || id !== reqRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceText, translatedText, source, target, tokens, jaInvolved, cloudAnalysis, t]);

  // Both must be present: post-swap the view clears the snapshot while the
  // output pane still shows repurposed text — no analysis should render then.
  if (!translatedText.trim() || !sourceText.trim()) return null;

  return (
    <div className="tr-analysis">
      {jaInvolved && tokens && tokens.length > 0 && (
        <ParticleBreakdown tokens={tokens} notes={result?.particleNotes} />
      )}
      {ai.loaded && ai.enabled && !ai.cloudReady && (
        <AiSetupPrompt compact reasonKey="sentenceAnalysis.needKey" settingId="ai-provider" />
      )}
      {loading && (
        <div className="tr-analysis-loading">
          <span className="media-gen-dot" />
          <span className="muted">{t('sentenceAnalysis.analyzing')}</span>
        </div>
      )}
      {error && <p className="tr-analysis-error muted">{t('sentenceAnalysis.unavailable', { error })}</p>}
      {result?.formality && <FormalityToggle variants={result.formality} lang={target} />}
      {result?.declension && <DeclensionDrawer items={result.declension} />}
      {(result?.measureWords || result?.aspectNotes) && (
        <MeasureWordGuide measureWords={result.measureWords} aspectNotes={result.aspectNotes} />
      )}
    </div>
  );
}
