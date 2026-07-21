import { useMemo } from 'react';
import type { EpubFilterPipelineBreakdown, EpubFilterPipelineStep } from '../../shared/mining';
import { useT } from '../i18n';
import type { TVars } from '../../shared/i18n/core';

type Props = {
  breakdown: EpubFilterPipelineBreakdown;
  className?: string;
};

function localizeStep(
  step: EpubFilterPipelineStep,
  t: (key: string, vars?: TVars) => string,
): { label: string; detail?: string } {
  const p = step.params ?? {};
  switch (step.id) {
    case 'kana-only':
      return { label: t('epub.filter.step.kanaOnly') };
    case 'occurrences':
      return {
        label: t('epub.filter.step.occurrences', {
          op: String(p.op ?? ''),
          threshold: Number(p.threshold ?? 0),
        }),
      };
    case 'book-frequency':
      return {
        label: t('epub.filter.step.bookFrequency', { minFrequency: Number(p.minFrequency ?? 1) }),
        detail: t('epub.filter.detail.bookFrequency'),
      };
    case 'dictionary-rank': {
      const rangeMin = Number(p.rangeMin ?? 0);
      const rangeMax = Number(p.rangeMax ?? 0);
      const range =
        rangeMax > 0
          ? t('epub.filter.step.dictionaryRank.range', { min: rangeMin, max: rangeMax })
          : t('epub.filter.step.dictionaryRank.rangeMin', { min: rangeMin });
      return { label: t('epub.filter.step.dictionaryRank', { range }) };
    }
    case 'book-rank-window': {
      const rangeMin = Number(p.rangeMin ?? 0);
      const rangeMax = Number(p.rangeMax ?? 0);
      const maxLabel = rangeMax > 0 ? String(rangeMax) : t('epub.filter.step.bookRankWindow.end');
      return {
        label: t('epub.filter.step.bookRankWindow', { min: rangeMin, max: maxLabel }),
      };
    }
    case 'max-common-rank':
      if (p.mode === 'skipped') {
        return {
          label: t('epub.filter.step.maxCommonRank'),
          detail: t('epub.filter.detail.maxCommonRankSkipped'),
        };
      }
      return {
        label: t('epub.filter.step.maxCommonRank.applied', {
          maxCommonRank: Number(p.maxCommonRank ?? 0),
        }),
        detail: p.unchanged ? t('epub.filter.detail.noChange') : undefined,
      };
    case 'name-exclusions':
      return {
        label: t('epub.filter.step.nameExclusions'),
        detail: p.unchanged ? t('epub.filter.detail.noChange') : undefined,
      };
    default:
      return { label: step.label, detail: step.detail };
  }
}

export default function EpubFilterPipelinePanel({ breakdown, className }: Props): JSX.Element {
  const { t, lang } = useT();

  const steps = useMemo(
    () => breakdown.steps.map((step) => ({ step, ...localizeStep(step, t) })),
    [breakdown.steps, t, lang],
  );

  return (
    <div className={`epub-filter-pipeline${className ? ` ${className}` : ''}`}>
      <p className="muted epub-filter-pipeline-lead">{t('epub.filter.lead')}</p>
      <ol className="epub-filter-pipeline-steps">
        <li>
          <span>{t('epub.filter.mined')}</span>
          <b>{breakdown.mined}</b>
        </li>
        {steps.map(({ step, label, detail }) => (
          <li key={step.id}>
            <span>
              {label}
              {detail ? <em className="muted"> — {detail}</em> : null}
            </span>
            <b>{step.count}</b>
          </li>
        ))}
        <li className="epub-filter-pipeline-final">
          <span>{t('epub.filter.final')}</span>
          <b>{breakdown.final}</b>
        </li>
      </ol>
    </div>
  );
}
