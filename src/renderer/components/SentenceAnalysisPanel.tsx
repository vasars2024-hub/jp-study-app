import { useEffect, useRef, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import type { TranslateAnalysisResult } from '../../shared/translateAnalysisCore';
import ParticleBreakdown from './translate-analysis/ParticleBreakdown';
import FormalityToggle from './translate-analysis/FormalityToggle';
import DeclensionDrawer from './translate-analysis/DeclensionDrawer';
import MeasureWordGuide from './translate-analysis/MeasureWordGuide';

// Orchestrates the linguistic-analysis panels under the Translate view.
// The Japanese particle breakdown is fully offline (kuromoji); formality,
// declension, and measure words need the cloud key configured in
// Flashcards → AI Card Studio. Only this component talks to window.api;
// the sub-widgets are pure presentational.
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
  const jaInvolved = source === 'ja' || target === 'ja';
  const jaText = source === 'ja' ? sourceText : target === 'ja' ? translatedText : '';

  const [tokens, setTokens] = useState<JpToken[] | null>(null);
  const [result, setResult] = useState<TranslateAnalysisResult | null>(null);
  const [keySet, setKeySet] = useState<boolean | null>(null);
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
    let alive = true;
    void (async () => {
      try {
        const config = await window.api.aiGetConfig();
        if (!alive || id !== reqRef.current) return;
        setKeySet(config.apiKeySet);
        if (!config.apiKeySet) return;
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
        else setError(res.error ?? 'Analysis failed.');
      } catch (err) {
        if (!alive || id !== reqRef.current) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [sourceText, translatedText, source, target, tokens, jaInvolved]);

  // Both must be present: post-swap the view clears the snapshot while the
  // output pane still shows repurposed text — no analysis should render then.
  if (!translatedText.trim() || !sourceText.trim()) return null;

  return (
    <div className="tr-analysis">
      {jaInvolved && tokens && tokens.length > 0 && (
        <ParticleBreakdown tokens={tokens} notes={result?.particleNotes} />
      )}
      {keySet === false && (
        <p className="tr-analysis-nudge muted">
          Formality, declension, and measure-word analysis need a cloud AI key. Add one in
          Flashcards → AI Card Studio to unlock these panels.
        </p>
      )}
      {loading && (
        <div className="tr-analysis-loading">
          <span className="media-gen-dot" />
          <span className="muted">Analyzing grammar…</span>
        </div>
      )}
      {error && <p className="tr-analysis-error muted">Analysis unavailable: {error}</p>}
      {result?.formality && <FormalityToggle variants={result.formality} lang={target} />}
      {result?.declension && <DeclensionDrawer items={result.declension} />}
      {(result?.measureWords || result?.aspectNotes) && (
        <MeasureWordGuide measureWords={result.measureWords} aspectNotes={result.aspectNotes} />
      )}
    </div>
  );
}
