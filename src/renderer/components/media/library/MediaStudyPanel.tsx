/**
 * The five study actions, as the button column from the reference design.
 *
 * The actions themselves already existed and already worked — they were just
 * unreachable, rendered only on Media Hub shelf rows that only appear when a
 * shelf is non-empty. This mounts them where the user is actually looking.
 *
 * Labels are resolved from i18n keys by action id rather than taken from
 * `action.label`, which the shared module hardcodes in English. `label` is kept
 * as the fallback so a new action id still renders something readable.
 */

import { Button } from '../../ui';
import { useT } from '../../../i18n';
import { dispatchMediaStudyAction } from '../MediaStudyActions';
import { buildMediaStudyActions, type MediaStudyContext } from '../../../../shared/mediaStudyIntegration';
import { mediaStudyActionLabel, mediaStudyActionReason } from '../mediaStudyActionsText';
import { hasJapaneseSubtitles, isJapaneseSubtitleLang } from '../../../../shared/subtitleRecord';
import type { MediaItem } from '../../../../shared/types';

export interface MediaStudyPanelProps {
  item: MediaItem;
  context?: MediaStudyContext;
  /** True while this item has a transcription queued or running. */
  transcriptionPending?: boolean;
}

export default function MediaStudyPanel({ item, context, transcriptionPending }: MediaStudyPanelProps) {
  const { t } = useT();
  // Derived from the real subtitle records rather than defaulting to "yes", so
  // Analyze Japanese stops claiming text this episode does not have.
  const japanese = (item.subtitles ?? []).filter((record) => isJapaneseSubtitleLang(record.lang));
  const actions = buildMediaStudyActions(item, {
    hasJapaneseText: hasJapaneseSubtitles(item.subtitles),
    hasSentences: (item.subtitles?.length ?? 0) > 0,
    transcriptionPending,
    japaneseIsGenerated: japanese.length > 0 && japanese.every((record) => record.source === 'generated'),
    ...context,
  });

  return (
    <div className="medialib-study">
      {actions.map((action) => {
        return (
          <Button
            key={action.id}
            block
            size="sm"
            variant={action.id === 'study-episode' ? 'primary' : 'default'}
            disabled={!action.enabled}
            title={mediaStudyActionReason(action, t)}
            onClick={() => dispatchMediaStudyAction(item, action.id)}
          >
            {mediaStudyActionLabel(action, t)}
          </Button>
        );
      })}
    </div>
  );
}
