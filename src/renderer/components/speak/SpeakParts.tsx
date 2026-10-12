/**
 * Small pieces the speaking and writing panels share: a correction shown as a
 * diff, and the Whisper "not installed" notice with the one button that may
 * download the model. Loaded only by lazy panels.
 */
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '../../../shared/assetRegistry';
import { diffStudyText } from '../../../shared/studyTextDiff';
import type { WhisperModelTier } from '../../../shared/whisperModels';
import { useT } from '../../i18n';
import './speak.css';

/**
 * `before` → `after` as one line: removed text struck through, added text
 * marked, and both also named for screen readers (not colour alone).
 */
export function StudyDiff({ before, after, lang }: { before: string; after: string; lang: string }) {
  const { t } = useT();
  const parts = diffStudyText(before, after);
  return (
    <span className="speak-diff" lang={lang}>
      {parts.map((part, index) => {
        if (part.kind === 'same') return <span key={index}>{part.text}</span>;
        if (part.kind === 'removed') {
          return (
            <del key={index} className="speak-diff-del">
              <span className="speak-sr">{t('aiSpeak.diff.removed')} </span>
              {part.text}
            </del>
          );
        }
        return (
          <ins key={index} className="speak-diff-ins">
            <span className="speak-sr">{t('aiSpeak.diff.added')} </span>
            {part.text}
          </ins>
        );
      })}
    </span>
  );
}

/**
 * Whisper is not on this computer. Says so, with the size, and offers the
 * download — which only ever starts from this button.
 */
export function WhisperInstallPrompt({
  tier,
  sizeBytes,
  onInstalled,
}: {
  tier: WhisperModelTier;
  sizeBytes: number;
  onInstalled: () => void;
}) {
  const { t } = useT();
  const [percent, setPercent] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const handle = useRef<{ cancel(): void } | null>(null);

  useEffect(() => () => handle.current?.cancel(), []);

  const start = async (): Promise<void> => {
    setFailed(false);
    setPercent(0);
    try {
      const [{ prefetchWhisperModel }, { loadWhisperDevice }] = await Promise.all([
        import('../../whisperModelCache'),
        import('../../whisperSettings'),
      ]);
      const download = prefetchWhisperModel(tier, loadWhisperDevice(), (pct) => setPercent(pct));
      handle.current = download;
      await download.done;
      handle.current = null;
      setPercent(null);
      onInstalled();
    } catch {
      handle.current = null;
      setPercent(null);
      setFailed(true);
    }
  };

  const cancel = (): void => {
    handle.current?.cancel();
    handle.current = null;
    setPercent(null);
  };

  return (
    <div className="speak-install" data-whisper-install={tier}>
      <p className="speak-note">{t('aiSpeak.whisper.missing', { size: formatBytes(sizeBytes) })}</p>
      <div className="speak-actions">
        {percent === null ? (
          <button type="button" className="btn small speak-btn" onClick={() => void start()}>
            {t('aiSpeak.whisper.download', { size: formatBytes(sizeBytes) })}
          </button>
        ) : (
          <>
            <span role="status">{t('aiSpeak.whisper.downloading', { percent })}</span>
            <button type="button" className="btn small speak-btn" onClick={cancel}>
              {t('aiStudy.cancel')}
            </button>
          </>
        )}
      </div>
      {failed && <p className="speak-error" role="alert">{t('aiSpeak.whisper.downloadFailed')}</p>}
    </div>
  );
}
