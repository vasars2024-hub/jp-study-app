/**
 * Recipe 17's door (round-2 audit F, Anki item 14).
 *
 * The planner, the export writer and the undo for `remove-template` all
 * landed, but no control ever queued the action: it was absent from every
 * step list and nothing passed the sibling audit (`templateGroups`) to the
 * planner, so the recipe was unreachable. This runs the audit on request —
 * it renders every template over a sample and costs about a second on a real
 * package, which is why it is a button and not a render-time memo — and offers
 * removal only for a group the sample called `duplicate`. The keeper is the
 * group's first ord; the rest are queued. `ambiguous` groups are listed and
 * not offered: "alike on some notes" is not a reason to delete cards.
 */
import { useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import { draftTemplateGroups, type TemplateGroup } from '../../../shared/ankiSiblingAudit';
import { useT } from '../../i18n';

export default function DeckWorkbenchTemplateRemoval({
  draft,
  onAudit,
  onQueue,
}: {
  draft: AnkiDraft;
  /** The audit, for the planner's `templateGroups`. */
  onAudit: (groups: readonly TemplateGroup[]) => void;
  onQueue: (params: { noteTypeId: string; ords: number[] }) => void;
}): JSX.Element {
  const { t } = useT();
  const [groups, setGroups] = useState<readonly TemplateGroup[] | null>(null);
  const [checking, setChecking] = useState(false);

  const check = (): void => {
    setChecking(true);
    // Yield one frame so "Comparing…" paints before the synchronous audit.
    window.setTimeout(() => {
      const found = draftTemplateGroups(draft);
      setGroups(found);
      onAudit(found);
      setChecking(false);
    }, 0);
  };

  return (
    <div className="wb-template-removal">
      <p className="muted">{t('ankiWorkbench.templates.lead')}</p>
      <button type="button" className="btn small" onClick={check} disabled={checking}>
        {checking ? t('ankiWorkbench.templates.checking') : t('ankiWorkbench.templates.check')}
      </button>
      {groups && groups.length === 0 && <p className="muted">{t('ankiWorkbench.templates.none')}</p>}
      {groups && groups.length > 0 && (
        <ul className="wb-siblings-list">
          {groups.map((group) => (
            <li key={`${group.noteTypeId}:${group.ords.join('-')}`} className="wb-siblings-row">
              <code>{group.noteTypeName}</code>
              <span className="muted">
                {t('ankiWorkbench.siblings.templates', { names: group.names.join(' · ') })}
                {' · '}
                {t('ankiWorkbench.siblings.sampled', { sampled: group.sampled })}
              </span>
              {group.verdict === 'duplicate' ? (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => onQueue({ noteTypeId: group.noteTypeId, ords: group.ords.slice(1) })}
                >
                  {t('ankiWorkbench.templates.remove', {
                    names: group.names.slice(1).join(' · '),
                    keep: group.names[0] ?? '',
                  })}
                </button>
              ) : (
                <span className="muted">{t('ankiWorkbench.templates.ambiguous')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
