import { useMemo } from 'react';
import { deinflectTraceSteps } from '../../../shared/deinflectTrace';
import { openGrammarPoint } from '../../extensionBridgeUi';
import { useT } from '../../i18n';
import './dict3.css';

interface Props {
  /** The form that was looked up (食べさせられなかった). */
  source: string;
  /** The dictionary form it was traced to (食べる). */
  term: string;
  /** Reasons, inner → outer, as the de-inflector reports them. */
  reasons: readonly string[];
  /** BCP-47 tag for the two forms. */
  contentLang?: string;
  /** Smaller, for a per-entry chain under the headword. */
  compact?: boolean;
}

/**
 * How a conjugated form was traced back, the way Yomitan shows it:
 * `食べさせられなかった ← causative ← passive ← negative ← past ← 食べる`.
 *
 * Each step is named in the UI language (`shared/deinflectTrace.ts`); a step the
 * grammar corpus teaches is a button that opens that point in the Grammar
 * explorer, the rest are plain labels. A reason the table does not know (an
 * imported inflection table's own name) is shown as the dictionary wrote it.
 */
export default function DeinflectTrace({ source, term, reasons, contentLang = 'ja', compact = false }: Props) {
  const { t, lang } = useT();
  const steps = useMemo(
    () => deinflectTraceSteps(reasons).map((step) => ({ ...step, label: step.labelKey ? t(step.labelKey) : step.reason })),
    // `lang`: the labels are translated, and `t` itself is stable across a switch.
    [reasons, lang],
  );
  if (!steps.length) return null;
  const summary = t('dict3.trace.aria', { source, term, steps: steps.map((step) => step.label).join(', ') });
  return (
    <div className={`dict-trace${compact ? ' is-compact' : ''}`} role="group" aria-label={summary}>
      <span className="dict-trace-form" lang={contentLang}>{source}</span>
      <ol className="dict-trace-steps dict-deinflection-reasons" aria-label={t('dict2.deinflect.steps')}>
        {steps.map((step, i) => (
          <li key={`${step.reason}-${i}`} className="dict-deinflect-step">
            <span className="dict-trace-arrow" aria-hidden="true">←</span>
            {step.grammarId ? (
              <button
                type="button"
                className="dict-trace-step is-link lq-hit"
                title={t('dict3.trace.openGrammar', { step: step.label })}
                onClick={() => openGrammarPoint(step.grammarId as string)}
              >
                {step.label}
              </button>
            ) : (
              <span className="dict-trace-step">{step.label}</span>
            )}
          </li>
        ))}
      </ol>
      <span className="dict-trace-arrow" aria-hidden="true">←</span>
      <span className="dict-trace-form is-lemma" lang={contentLang}>{term}</span>
    </div>
  );
}
