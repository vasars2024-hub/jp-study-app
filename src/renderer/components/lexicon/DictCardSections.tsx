import { useEffect, useState } from 'react';
import { visibleSections, type DictCard, type DictDisplayPrefs } from '../../../shared/dictDisplay';
import type { DictSense } from '../../../shared/types';
import { useT } from '../../i18n';
import DictSenseList, { SenseBody } from './DictSenseList';
import './dict3.css';

interface Props {
  card: DictCard<DictSense>;
  prefs: DictDisplayPrefs;
  /** BCP-47 tag for the definitions' structured HTML. */
  lang: string;
}

/**
 * The meanings of one headword card, under the user's layout
 * (`shared/dictDisplay.ts`):
 *
 *  - one dictionary: its senses and its name below them, exactly as before;
 *  - grouped: a section per dictionary in the user's order, the first open and
 *    the rest behind "show N more dictionaries" when collapsing is on;
 *  - merged: one numbered list of every dictionary's senses, each labelled with
 *    the dictionary it came from.
 */
export default function DictCardSections({ card, prefs, lang }: Props) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  // A new headword starts collapsed again.
  useEffect(() => setExpanded(false), [card.key]);

  const sections = card.sections;
  if (sections.length <= 1) {
    const only = sections[0];
    if (!only) return null;
    return (
      <>
        <DictSenseList senses={only.senses} glossaryHtml={only.glossaryHtml} lang={lang} />
        {only.source && <div className="dict-source muted">{only.source}</div>}
      </>
    );
  }

  if (prefs.mode === 'merged') {
    return (
      <ol className="dict-senses is-merged">
        {sections.flatMap((section, s) => {
          if (section.glossaryHtml && !section.senses.some((sense) => sense.html)) {
            return [
              <li key={`${s}-block`}>
                {section.source && <span className="dict-sense-source">{section.source}</span>}
                <DictSenseList senses={section.senses} glossaryHtml={section.glossaryHtml} lang={lang} />
              </li>,
            ];
          }
          return section.senses.slice(0, 6).map((sense, j) => (
            <li key={`${s}-${j}`}>
              <SenseBody sense={sense} lang={lang} sourceLabel={section.source || undefined} />
            </li>
          ));
        })}
      </ol>
    );
  }

  const { shown, hidden } = visibleSections(card, prefs, expanded);
  const canCollapse = prefs.collapseSecondary && sections.length > 1;
  return (
    <div className="dict-sections">
      {shown.map((section, s) => (
        <div className="dict-section" role="group" aria-label={section.source || undefined} key={`${section.source}-${s}`}>
          {section.source && <div className="dict-section-head">{section.source}</div>}
          <DictSenseList senses={section.senses} glossaryHtml={section.glossaryHtml} lang={lang} />
        </div>
      ))}
      {canCollapse && (hidden > 0 || expanded) && (
        <button
          type="button"
          className="dict-sections-toggle lq-hit"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? t('dict3.sections.showFewer') : t('dict3.sections.showMore', { count: hidden })}
        </button>
      )}
    </div>
  );
}
