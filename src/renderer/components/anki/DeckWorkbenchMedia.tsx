/**
 * Smart recipe 11's consumer surface: the media audit, in the Browser.
 *
 * It reports **both axes and always both**, because either alone lies. Measured
 * on `HSK_30_Vocabulary_Mandarin_Chinese_Simplified_Characters.apkg`: exactly
 * one file is absent (`1sec_silence.mp3`) and 11,084 of its 11,086 notes cite
 * it. A note count alone reads as eleven thousand defects and sends the user
 * looking for a catastrophe; a file count alone hides that every card in the
 * deck plays silence where it should pause.
 *
 * Like recipe 9's panel this proposes and never deletes: every outcome it offers
 * is a Browser **query**, which the search box already reverses. Removing media
 * from a package is not a change the tray can undo, so there is no button for
 * it here and no tray kind behind one.
 */
import { useMemo } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  MEDIA_HEALTHS,
  buildMediaHealthContext,
  mediaFileDefects,
  reclaimableMediaBytes,
  tallyMediaHealth,
  type MediaHealth,
} from '../../../shared/ankiMediaHealth';
import { formatBytes } from '../../../shared/assetRegistry';
import { useT } from '../../i18n';

/** Rows past this are summarised rather than listed: a defect list is not a grid. */
const MAX_ROWS = 12;

export default function DeckWorkbenchMedia({
  draft,
  onQuery,
}: {
  draft: AnkiDraft;
  /** Hand a `media:<verdict>` query back to the search box. */
  onQuery: (query: string) => void;
}): JSX.Element {
  const { t } = useT();

  const summary = draft.media;
  const defects = useMemo(() => (summary ? mediaFileDefects(draft) : []), [draft, summary]);
  const noteTally = useMemo(
    () => (summary ? tallyMediaHealth(buildMediaHealthContext(draft).values()) : null),
    [draft, summary],
  );
  const reclaimable = useMemo(() => reclaimableMediaBytes(draft), [draft]);

  if (!summary) {
    return (
      <div className="wb-media">
        <p className="muted">{t('ankiWorkbench.media.absent')}</p>
      </div>
    );
  }

  // Notes with a defect, which is every verdict below `unverified` in the
  // ladder. `none` and `ok` are not defects and `unverified` is an absence of
  // measurement, not a finding.
  const affected = noteTally
    ? noteTally.duplicate + noteTally.oversized + noteTally.broken + noteTally.missing
    : 0;
  const size = formatBytes(summary.bytes ?? 0);

  return (
    <div className="wb-media">
      <p>
        {defects.length === 0
          ? t('ankiWorkbench.media.clean', { files: summary.files, size })
          : t('ankiWorkbench.media.summary', {
              files: summary.files,
              size,
              defects: defects.length,
              notes: affected,
            })}
      </p>
      {summary.unreferenced > 0 && (
        <p className="muted">
          {t('ankiWorkbench.media.unreferenced', { count: summary.unreferenced })}
        </p>
      )}
      {reclaimable != null && reclaimable > 0 && (
        <p className="muted">
          {t('ankiWorkbench.media.reclaimable', { size: formatBytes(reclaimable) })}
        </p>
      )}

      {defects.length > 0 && (
        <ul className="wb-media-list">
          {defects.slice(0, MAX_ROWS).map((defect) => (
            <li key={defect.fileName} className="wb-media-row">
              <span className={`wb-media-verdict wb-media-${defect.health}`}>
                {t(`ankiWorkbench.browser.explain.media.${defect.health}`)}
              </span>
              <code>{defect.fileName}</code>
              <span className="muted">
                {t('ankiWorkbench.media.affects', { notes: defect.notes })}
                {defect.bytes != null && ` · ${formatBytes(defect.bytes)}`}
                {defect.duplicateOf != null &&
                  ` · ${t('ankiWorkbench.media.duplicateOf', { name: defect.duplicateOf })}`}
              </span>
            </li>
          ))}
          {defects.length > MAX_ROWS && (
            <li className="muted">
              {t('ankiWorkbench.media.more', { count: defects.length - MAX_ROWS })}
            </li>
          )}
        </ul>
      )}

      {/* One button per verdict the deck actually has, so a click can never
          produce an empty grid the user has to interpret. */}
      <div className="wb-media-filters">
        {MEDIA_HEALTHS.filter(
          (health): health is MediaHealth =>
            health !== 'none' && health !== 'ok' && (noteTally?.[health] ?? 0) > 0,
        ).map((health) => (
          <button
            key={health}
            type="button"
            className="btn"
            onClick={() => onQuery(`media:${health}`)}
          >
            {t(`ankiWorkbench.browser.explain.media.${health}`)} ({noteTally?.[health] ?? 0})
          </button>
        ))}
      </div>
    </div>
  );
}
