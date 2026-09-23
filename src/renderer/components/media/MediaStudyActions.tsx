import type { MediaItem } from '../../../shared/types';
import {
  buildMediaStudyActions,
  createMediaStudyRequest,
  MEDIA_STUDY_EVENT,
  type MediaStudyActionId,
} from '../../../shared/mediaStudyIntegration';
import { setHandoff, setHandoffJson } from '../../pendingHandoff';
import { useT } from '../../i18n';
import { mediaStudyActionLabel, mediaStudyActionReason } from './mediaStudyActionsText';

export function dispatchMediaStudyAction(item: MediaItem, action: MediaStudyActionId): void {
  const request = createMediaStudyRequest(item, action);
  try {
    setHandoff('studyMediaId', item.id);
    setHandoffJson('studyMediaRequest', request);
  } catch {
    // Storage is optional; the event remains the source of truth for this window.
  }
  window.dispatchEvent(new CustomEvent(MEDIA_STUDY_EVENT, { detail: request }));
}

export default function MediaStudyActions({ item }: { item: MediaItem }) {
  const { t } = useT();
  const actions = buildMediaStudyActions(item);
  return (
    <details className="media-study-actions">
      <summary>{t('media.study.actionMenu')}</summary>
      <div className="media-study-action-list">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled={!action.enabled}
            title={mediaStudyActionReason(action, t)}
            onClick={() => dispatchMediaStudyAction(item, action.id)}
          >
            {mediaStudyActionLabel(action, t)}
          </button>
        ))}
      </div>
    </details>
  );
}
