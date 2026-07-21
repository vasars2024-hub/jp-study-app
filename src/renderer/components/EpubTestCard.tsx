import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderFieldTemplate } from '../../shared/anki';
import {
  buildFieldValuesWithSources,
  candidateLookupKey,
  candidateNeedsEnrichment,
  collapseEmptySegments,
  extractTemplateTokens,
  normalizeEpubTemplateSeparators,
  resolveTraditionalTemplates,
} from '../../shared/mining';
import type { MiningCandidate, TraditionalMiningConfig, ValueSource } from '../../shared/mining';
import { useT } from '../i18n';
import type { TVars } from '../../shared/i18n/core';

type Props = {
  candidates: MiningCandidate[];
  config: TraditionalMiningConfig;
  onCandidateUpdated?: (candidate: MiningCandidate) => void;
};

type VarStatus = {
  token: string;
  filled: boolean;
  source: ValueSource;
};

const SOURCE_KEYS: Record<ValueSource, string> = {
  mined: 'epub.test.source.mined',
  dict: 'epub.test.source.dict',
  qwen: 'epub.test.source.qwen',
  api: 'epub.test.source.api',
  missing: 'epub.test.source.missing',
};

function missingVarHint(token: string, t: (key: string, vars?: TVars) => string): string {
  if (token.startsWith('reading:') && !token.endsWith(':ja')) {
    return t('epub.test.hint.readingLang');
  }
  if (
    token.startsWith('translation') ||
    token.startsWith('sentence-translation') ||
    (token.includes(':') && !token.endsWith(':ja') && !token.startsWith('meaning:ja'))
  ) {
    return t('epub.test.hint.needDownload');
  }
  if (token.startsWith('meaning')) {
    return t('epub.test.hint.needReanalyze');
  }
  return t('epub.test.hint.empty');
}

const ENRICH_TIMEOUT_MS = 120_000;

export default function EpubTestCard({ candidates, config, onCandidateUpdated }: Props) {
  const { t, lang } = useT();
  const [selectedKey, setSelectedKey] = useState('');
  const [rendering, setRendering] = useState(false);
  const [enrichError, setEnrichError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [localEnriched, setLocalEnriched] = useState<MiningCandidate | null>(null);
  const enrichGenRef = useRef(0);
  const autoEnrichKeyRef = useRef('');

  const pickerOptions = useMemo(() => candidates.slice(0, 50), [candidates]);

  useEffect(() => {
    if (!pickerOptions.length) {
      setSelectedKey('');
      return;
    }
    setSelectedKey((prev) => {
      if (prev && pickerOptions.some((c) => candidateLookupKey(c.expression, c.reading) === prev)) {
        return prev;
      }
      const first = pickerOptions[0];
      return candidateLookupKey(first.expression, first.reading);
    });
  }, [pickerOptions]);

  const baseCandidate = useMemo(() => {
    if (!selectedKey) return null;
    return pickerOptions.find((c) => candidateLookupKey(c.expression, c.reading) === selectedKey) ?? null;
  }, [pickerOptions, selectedKey]);

  const candidate = useMemo(() => {
    if (!baseCandidate) return null;
    if (
      localEnriched &&
      candidateLookupKey(localEnriched.expression, localEnriched.reading) === selectedKey
    ) {
      return {
        ...baseCandidate,
        glosses: { ...baseCandidate.glosses, ...localEnriched.glosses },
        translations: { ...baseCandidate.translations, ...localEnriched.translations },
      };
    }
    return baseCandidate;
  }, [baseCandidate, localEnriched, selectedKey]);

  useEffect(() => {
    setLocalEnriched(null);
    enrichGenRef.current += 1;
    autoEnrichKeyRef.current = '';
    setEnrichError('');
    setProgressMessage('');
    setRendering(false);
  }, [selectedKey]);

  const { front, back } = resolveTraditionalTemplates(config);
  const separator = config.export?.tokenSeparator || '\n';
  const templateTokens = useMemo(() => extractTemplateTokens(front, back), [front, back]);
  const frontNorm = normalizeEpubTemplateSeparators(front, separator);
  const backNorm = normalizeEpubTemplateSeparators(back, separator);

  const { values, sources } = useMemo(
    () =>
      candidate
        ? buildFieldValuesWithSources(candidate, config)
        : { values: {}, sources: {} as Record<string, ValueSource> },
    [candidate, config],
  );

  const renderedFront = candidate
    ? collapseEmptySegments(renderFieldTemplate(frontNorm, values), separator)
    : '';
  const renderedBack = candidate
    ? collapseEmptySegments(renderFieldTemplate(backNorm, values), separator)
    : '';

  const varStatuses: VarStatus[] = useMemo(() => {
    if (!candidate) return [];
    return templateTokens.map((token) => {
      const source: ValueSource = values[token]?.trim() ? sources[token] ?? 'mined' : 'missing';
      return { token, filled: source !== 'missing', source };
    });
  }, [candidate, templateTokens, values, sources]);

  useEffect(() => {
    const unsub = window.api.onMiningEnrichProgress((payload) => {
      if (!rendering) return;
      const pct = payload.total > 0 ? ` (${payload.done}/${payload.total})` : '';
      setProgressMessage(`${payload.message ?? payload.phase}${pct}`);
    });
    return unsub;
  }, [rendering]);

  const renderTestCard = useCallback(async () => {
      if (!baseCandidate || !selectedKey) return;
      const gen = ++enrichGenRef.current;
      setRendering(true);
      setEnrichError('');
      setProgressMessage(t('epub.test.starting'));
      try {
        const enriched = await Promise.race([
          window.api.miningEnrichCandidate(baseCandidate, config),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error(t('epub.test.timeout'))),
              ENRICH_TIMEOUT_MS,
            );
          }),
        ]);
        if (enrichGenRef.current !== gen) return;
        setLocalEnriched(enriched);
        onCandidateUpdated?.(enriched);
        setProgressMessage('');
      } catch (error) {
        if (enrichGenRef.current !== gen) return;
        setEnrichError(error instanceof Error ? error.message : String(error));
        setProgressMessage('');
      } finally {
        if (enrichGenRef.current === gen) {
          setRendering(false);
        }
      }
    },
    [baseCandidate, config, onCandidateUpdated, selectedKey, t, lang],
  );

  useEffect(() => {
    if (!baseCandidate || rendering) return;
    if (!candidateNeedsEnrichment(baseCandidate, config)) return;
    const attemptKey = `${selectedKey}|${front}|${back}`;
    if (autoEnrichKeyRef.current === attemptKey) return;
    autoEnrichKeyRef.current = attemptKey;
    const timer = setTimeout(() => {
      void renderTestCard();
    }, 200);
    return () => clearTimeout(timer);
  }, [baseCandidate, config, front, back, rendering, renderTestCard, selectedKey]);

  if (!candidates.length) return null;

  return (
    <div className="epub-test-card">
      <p className="muted collapse-lead">{t('epub.test.lead')}</p>
      <div className="mining-form-grid mining-form-grid-wide">
        <label>
          {t('epub.test.term')}
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
            {pickerOptions.map((c) => {
              const key = candidateLookupKey(c.expression, c.reading);
              return (
                <option key={key} value={key}>
                  {c.expression}
                  {c.reading ? ` (${c.reading})` : ''}
                </option>
              );
            })}
          </select>
        </label>
        <div className="actions">
          <button
            type="button"
            className="btn subtle"
            disabled={!baseCandidate || rendering}
            onClick={() => {
              autoEnrichKeyRef.current = '';
              void renderTestCard();
            }}
          >
            {rendering ? t('epub.test.enriching') : t('epub.test.render')}
          </button>
        </div>
      </div>

      {progressMessage && rendering && (
        <p className="muted epub-test-enrich-progress">{progressMessage}</p>
      )}

      <div className="epub-test-card-panels">
        <div className="epub-test-card-panel">
          <span className="download-deck-label">{t('epub.test.front')}</span>
          <pre className="epub-test-card-output">{renderedFront || (rendering ? '…' : '—')}</pre>
        </div>
        <div className="epub-test-card-panel">
          <span className="download-deck-label">{t('epub.test.back')}</span>
          <pre className="epub-test-card-output">{rendering ? '…' : renderedBack || '—'}</pre>
        </div>
      </div>

      {enrichError && <p className="muted epub-test-enrich-error">{enrichError}</p>}

      {varStatuses.length > 0 && (
        <ul className="epub-test-var-list">
          {varStatuses.map((v) => (
            <li key={v.token} className={v.filled ? 'filled' : 'empty'}>
              <span className="epub-test-var-icon" aria-hidden>
                {v.filled ? 'OK' : '--'}
              </span>
              <code>{`{${v.token}}`}</code>
              <span className="muted">
                {v.filled ? t(SOURCE_KEYS[v.source]) : missingVarHint(v.token, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
