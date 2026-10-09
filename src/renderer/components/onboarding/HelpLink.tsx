/**
 * The "?" affordance: a small, labelled button that opens Settings > Help at
 * one topic. Named by the topic it explains, so a screen reader walking a page
 * with three of these hears three different buttons.
 */
import { useT } from '../../i18n';
import { helpTopic, requestHelpTopic } from '../../helpTopics';
import Icon from '../Icons';
import './helpLink.css';

export default function HelpLink({ topic, className = '' }: { topic: string; className?: string }) {
  const { t } = useT();
  const entry = helpTopic(topic);
  if (!entry) return null;
  const label = t('onb2.help.about', { topic: t(entry.titleKey) });
  return (
    <button
      type="button"
      className={`help-link lq-hit ${className}`.trim()}
      title={label}
      aria-label={label}
      data-help-topic={topic}
      onClick={(event) => {
        event.stopPropagation();
        requestHelpTopic(topic);
      }}
    >
      <Icon name="help" size={14} />
    </button>
  );
}
