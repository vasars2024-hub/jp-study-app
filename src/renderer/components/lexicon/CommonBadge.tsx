import { useMemo } from 'react';
import { isJmdictCommon, jmdictPriorityExplanation } from '../../../shared/jmdictPriority';
import { useT } from '../../i18n';

interface Props {
  /** The entry's own "common" flag (score or source). */
  isCommon: boolean;
  /** JMdict priority codes the dictionary attached, when it attached any. */
  priorityTags?: readonly string[];
}

/**
 * The "common" badge, with the reason when the dictionary gave one.
 *
 * JMdict calls a word common because it is on particular word lists — `news1`
 * (Mainichi Shimbun top 12,000), `ichi1`, `spec1`, `gai1` — and `nf05` places it
 * in a 500-word rank band. When the entry carries those codes the badge's tooltip
 * (and its screen-reader text) says which lists and what they mean; when it
 * carries none, the badge is exactly what it was, with nothing invented. Codes
 * on an entry that is not common (`news2` alone) still show, as the codes.
 */
export default function CommonBadge({ isCommon, priorityTags }: Props) {
  const { t, lang } = useT();
  const tags = priorityTags ?? [];
  const common = isCommon || isJmdictCommon(tags);
  const explanation = useMemo(() => {
    const lines = tags
      .map((code) => {
        const explained = jmdictPriorityExplanation(code);
        return explained ? `${code}: ${t(explained.key, explained.params)}` : null;
      })
      .filter((line): line is string => Boolean(line));
    return lines.length ? `${t('dict3.prio.title')}\n${lines.join('\n')}` : '';
    // `lang`: the explanations are translated.
  }, [tags.join(','), lang]);
  if (!common && !tags.length) return null;
  const label = common ? t('dict.results.common') : tags.join(' ');
  return (
    <span className={`dict-badge ${common ? 'common' : 'prio'}${tags.length ? ' has-prio' : ''}`} title={explanation || undefined}>
      {label}
      {explanation && <span className="sr-only"> ({explanation.replace(/\n/g, '; ')})</span>}
    </span>
  );
}
