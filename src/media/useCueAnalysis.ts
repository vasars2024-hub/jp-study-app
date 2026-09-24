import { useCallback, useEffect, useRef, useState } from 'react';
import type { SentenceAnalysisResult } from '../shared/sentenceAnalysisCore';
import { localSentenceAnalysis } from '../renderer/localGrammarAnalysis';

/**
 * Whole-sentence AI annotation for the subtitle line the player is on.
 *
 * The same analysis the Reading Lens and the extension already run — this only
 * decides *when* it is worth spending a call, which is the whole difficulty of
 * putting it behind a video rather than behind a scan.
 *
 * A scan is one deliberate act, so the Lens can analyze on mount. A playing
 * video is not: an episode has several hundred cues, and analyzing each one as
 * it appears would fire several hundred cloud calls for lines the viewer read
 * without trouble and never asked about. So:
 *
 *   - a cached line always renders, free, whether playing or paused — once you
 *     have paid for a line it stays highlighted on every later pass over it;
 *   - a new line is only sent when `auto` is true (the player is paused, i.e.
 *     the viewer stopped ON this line) or when the viewer asks explicitly.
 *
 * That bounds spend to lines someone actually stopped at, and it matches how
 * the feature is used — you pause on the sentence you did not get.
 *
 * Underneath the AI sits the offline highlight (`localSentenceAnalysis`): the
 * Grammar app's library matched on the line. It costs nothing, so it answers for
 * every line at once, playing or paused, and it is what a fresh profile with no
 * key or model sees instead of "needs a cloud API key". The AI result replaces it
 * when there is one; `offline` says what the AI half is doing meanwhile.
 */

/** What the AI is doing while the offline highlight stands in for it. */
export type OfflineAiStatus =
  | { ai: 'idle' }
  | { ai: 'loading' }
  | { ai: 'needsKey' }
  | { ai: 'needsLocalModel' }
  | { ai: 'off' }
  | { ai: 'error'; message: string };

export type CueAnalysisState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: SentenceAnalysisResult; offline?: OfflineAiStatus }
  | { kind: 'error'; message: string; needsKey: boolean; needsLocalModel: boolean };

/** Keeps a long session's worth of lines without growing without bound. */
const CACHE_LIMIT = 200;
const cache = new Map<string, SentenceAnalysisResult>();

function cacheKey(text: string, lang: string, uiLang: string): string {
  return `${lang}::${uiLang}::${text}`;
}

/** Read and refresh recency — Map iteration order is insertion order, so a
 *  re-set moves the entry to the young end and the eviction below stays LRU. */
function readCache(key: string): SentenceAnalysisResult | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function writeCache(key: string, value: SentenceAnalysisResult): void {
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

interface Options {
  /** The cue line, already stripped of ASS override tags. */
  text: string;
  /** Study language of the line. */
  lang: string;
  /** Language the explanations come back in. */
  uiLang: string;
  /** Send an uncached line without being asked. Pass the paused state here. */
  auto: boolean;
  /** Offer the free offline highlight. Pass whether highlighting is on at all. */
  offline?: boolean;
  /** Localized fallback for a provider error with no message of its own. */
  errorLabel: string;
}

export interface CueAnalysis {
  state: CueAnalysisState;
  /** Analyze the current line now, even while playing. */
  analyzeNow: () => void;
  /** Re-run after a failure, bypassing nothing — errors are never cached. */
  retry: () => void;
}

export function useCueAnalysis({
  text,
  lang,
  uiLang,
  auto,
  offline: offlineWanted = true,
  errorLabel,
}: Options): CueAnalysis {
  const [state, setState] = useState<CueAnalysisState>({ kind: 'idle' });
  // Demand is bound to the text it was made for, so asking for one line does
  // not silently authorize a call on whatever line comes next.
  const [demand, setDemand] = useState<{ text: string; nonce: number } | null>(null);
  const reqRef = useRef(0);

  const trimmed = text.trim();
  const demanded = demand?.text === trimmed;
  const demandNonce = demanded ? demand.nonce : 0;

  useEffect(() => {
    // Bumped before every early return as well: a request still in flight for
    // the previous line must not land on this one. Returning early without
    // invalidating it was a real defect — the stale response overwrote a cached
    // result that had already rendered.
    const id = ++reqRef.current;
    if (!trimmed) {
      setState({ kind: 'idle' });
      return;
    }
    const key = cacheKey(trimmed, lang, uiLang);
    const cached = readCache(key);
    if (cached) {
      setState({ kind: 'ready', result: cached });
      return;
    }
    const local = offlineWanted ? localSentenceAnalysis(trimmed, lang) : null;
    const offline = (status: OfflineAiStatus): CueAnalysisState => (
      local ? { kind: 'ready', result: local, offline: status } : { kind: 'idle' }
    );
    if (!auto && !demanded) {
      setState(offline({ ai: 'idle' }));
      return;
    }
    setState(local ? offline({ ai: 'loading' }) : { kind: 'loading' });
    let alive = true;
    void (async () => {
      try {
        const res = await window.api.sentenceAnalyze({ text: trimmed, lang, explainIn: uiLang });
        if (!alive || id !== reqRef.current) return;
        if (res.ok && res.result) {
          writeCache(key, res.result);
          setState({ kind: 'ready', result: res.result });
        } else if (local) {
          // No AI to add detail: the offline highlight stays, saying why it is alone.
          setState(offline(
            res.needsKey ? { ai: 'needsKey' }
              : res.needsLocalModel ? { ai: 'needsLocalModel' }
                : res.aiOff ? { ai: 'off' }
                  : { ai: 'error', message: res.error || errorLabel },
          ));
        } else {
          setState({
            kind: 'error',
            message: res.error || errorLabel,
            needsKey: !!res.needsKey,
            needsLocalModel: !!res.needsLocalModel,
          });
        }
      } catch (err) {
        if (!alive || id !== reqRef.current) return;
        const message = err instanceof Error ? err.message : errorLabel;
        if (local) {
          setState(offline({ ai: 'error', message }));
          return;
        }
        setState({
          kind: 'error',
          message,
          needsKey: false,
          needsLocalModel: false,
        });
      }
    })();
    return () => {
      alive = false;
    };
    // `errorLabel` is deliberately absent: it is only read inside the failure
    // path, and depending on it would re-run the whole analysis on a UI-language
    // switch purely to restate an error string.
  }, [trimmed, lang, uiLang, auto, offlineWanted, demanded, demandNonce]);

  const analyzeNow = useCallback(() => {
    setDemand((current) => ({
      text: text.trim(),
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }, [text]);

  return { state, analyzeNow, retry: analyzeNow };
}
