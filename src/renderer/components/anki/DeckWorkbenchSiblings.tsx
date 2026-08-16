/**
 * Smart recipe 17's consumer surface: the sibling audit, in the Browser.
 *
 * Two axes again, recipe 11's rule: a note count alone says how much reviewing
 * is doubled, and a template count alone says how many things there are to fix.
 * A note type with one redundant template over 8,000 notes is *one* edit and
 * 8,000 wasted reviews, and neither number implies the other.
 *
 * It states its sample size on every row and never rounds it away. The verdict
 * is the sample's, not the deck's: the same pair of templates reads `ambiguous`
 * over 50 evenly spaced notes and `duplicate` over 2, and a panel that said
 * "identical" would be claiming a scan nobody ran.
 *
 * Like recipes 9 and 11 this proposes and never deletes. Removing a template
 * deletes every card it generated across the collection, and AnkiConnect has no
 * action for it, so the reverse transition every stateful change here needs does
 * not exist yet. Every outcome offered is a Browser query, which the search box
 * already reverses.
 */
import { useMemo } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  SIBLING_VERDICTS,
  buildSiblingAuditContext,
  draftTemplateGroups,
  tallySiblingVerdicts,
  type SiblingVerdict,
} from '../../../shared/ankiSiblingAudit';
import { useT } from '../../i18n';

/** Rows past this are summarised rather than listed: a defect list is not a grid. */
const MAX_ROWS = 12;

export default function DeckWorkbenchSiblings({
  draft,
  onQuery,
}: {
  draft: AnkiDraft;
  /** Hand a `sibling:<verdict>` query back to the search box. */
  onQuery: (query: string) => void;
}): JSX.Element {
  const groups = useMemo(() => draftTemplateGroups(draft), [draft]);
  const tally = useMemo(
    () => tallySiblingVerdicts(buildSiblingAuditContext(draft).values()),
    [draft],
  );
  const { t } = useT();

  // Notes with a defect. `single` and `ok` are not defects; `single` in
  // particular is dropped rather than counted healthy, so it cannot be
  // subtracted from a total either.
  const affected = tally.duplicate + tally.ambiguous + tally.orphan;

  return (
    <div className="wb-siblings">
      <p>
        {groups.length === 0 && affected === 0
          ? t('ankiWorkbench.siblings.clean', { notes: tally.ok })
          : t('ankiWorkbench.siblings.summary', { groups: groups.length, notes: affected })}
      </p>
      {tally.orphan > 0 && (
        <p className="muted">{t('ankiWorkbench.siblings.orphans', { notes: tally.orphan })}</p>
      )}

      {groups.length > 0 && (
        <ul className="wb-siblings-list">
          {groups.slice(0, MAX_ROWS).map((group) => (
            <li key={`${group.noteTypeId}:${group.verdict}:${group.ords.join('-')}`} className="wb-siblings-row">
              <span className={`wb-siblings-verdict wb-siblings-${group.verdict}`}>
                {t(`ankiWorkbench.browser.explain.sibling.${group.verdict}`)}
              </span>
              <code>{group.noteTypeName}</code>
              <span className="muted">
                {t('ankiWorkbench.siblings.templates', { names: group.names.join(' · ') })}
                {' · '}
                {t('ankiWorkbench.siblings.sampled', { sampled: group.sampled })}
                {group.redundantCards > 0 &&
                  ` · ${t('ankiWorkbench.siblings.cards', { cards: group.redundantCards })}`}
              </span>
            </li>
          ))}
          {groups.length > MAX_ROWS && (
            <li className="muted">
              {t('ankiWorkbench.siblings.more', { count: groups.length - MAX_ROWS })}
            </li>
          )}
        </ul>
      )}

      {/* One button per verdict the deck actually has, so a click can never
          produce an empty grid the user has to interpret. */}
      <div className="wb-siblings-filters">
        {SIBLING_VERDICTS.filter(
          (verdict): verdict is SiblingVerdict =>
            verdict !== 'single' && verdict !== 'ok' && tally[verdict] > 0,
        ).map((verdict) => (
          <button
            key={verdict}
            type="button"
            className="btn"
            onClick={() => onQuery(`sibling:${verdict}`)}
          >
            {t(`ankiWorkbench.browser.explain.sibling.${verdict}`)} ({tally[verdict]})
          </button>
        ))}
      </div>
    </div>
  );
}
