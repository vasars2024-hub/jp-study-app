import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useT } from '../../i18n';
import {
  capturesForVisualNovel,
  createEmptyVisualNovelDatabase,
  visualNovelSettings,
  type VisualNovelDatabase,
  type VisualNovelTextCapture,
} from '../../../shared/visualNovel';
import { isLookupClick, lookupWordFromMouseUp, noteLookupPointerDown } from '../../wordLookup';
import { mineVisualNovelLine } from '../../visualNovelMining';
import DictionaryPopup from '../DictionaryPopup';
import SentenceTranslatePopup from '../SentenceTranslatePopup';
import { useVisualNovelCapture } from './VisualNovelCaptureControls';
import './visualNovelReader.css';

/** The type-size glyph on the two font buttons; a symbol, not a word. */
const FONT_GLYPH = 'A';

/** How many recent lines the reader keeps on screen. */
export const READER_LINE_COUNT = 6;

/**
 * The reader window beside a running game (`?vnReader=1`, opened by
 * `main/immersion/visualNovelReaderWindow.ts`).
 *
 * The whole reading loop in one small surface: the last few captured lines,
 * newest at the bottom; click a word for the dictionary; Translate a line with
 * the learner's translation target; Mine a line into the deck in one click.
 * The header is the drag handle, because the window has no frame.
 */
export default function VisualNovelReaderOverlay() {
  const { t } = useT();
  const [database, setDatabase] = useState<VisualNovelDatabase>(createEmptyVisualNovelDatabase);
  const [targetId, setTargetId] = useState('');
  const [popup, setPopup] = useState<{ query: string; x: number; y: number; context?: string } | null>(null);
  const [translating, setTranslating] = useState('');
  const [flash, setFlash] = useState<{ id: string; key: string } | null>(null);
  const capture = useVisualNovelCapture();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void window.api.visualNovelList().then((next) => {
      if (active) setDatabase(next);
    });
    void window.api.visualNovelReaderTarget().then((id) => {
      if (active && id) setTargetId(id);
    });
    const offDb = window.api.onVisualNovelChanged((next) => setDatabase(next));
    const offTarget = window.api.onVisualNovelReaderTarget((id) => {
      if (id) setTargetId(id);
    });
    return () => {
      active = false;
      offDb();
      offTarget();
    };
  }, []);

  // A running capture session names the novel being played; follow it.
  useEffect(() => {
    if (capture.active && capture.visualNovelId && !capture.test) setTargetId(capture.visualNovelId);
  }, [capture.active, capture.test, capture.visualNovelId]);

  const settings = visualNovelSettings(database);
  const entry = database.entries.find((candidate) => candidate.id === targetId)
    ?? database.entries[0]
    ?? null;
  const lines = useMemo(
    () => (entry ? capturesForVisualNovel(database, entry.id).slice(-READER_LINE_COUNT) : []),
    [database, entry],
  );
  const newestId = lines[lines.length - 1]?.id ?? '';

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [newestId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (popup || translating) {
        setPopup(null);
        setTranslating('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popup, translating]);

  const setFontSize = (delta: number): void => {
    void window.api.visualNovelUpdateSettings({ reader: { fontSize: settings.reader.fontSize + delta } })
      .then(setDatabase);
  };

  const setOpacity = (value: number): void => {
    void window.api.visualNovelUpdateSettings({ reader: { opacity: value } }).then(setDatabase);
  };

  const mine = (line: VisualNovelTextCapture): void => {
    if (!entry) return;
    const added = mineVisualNovelLine(entry, line);
    setFlash({ id: line.id, key: added ? 'vnReader.mined' : 'vnReader.minedExists' });
    window.setTimeout(() => setFlash((current) => (current?.id === line.id ? null : current)), 1800);
  };

  const onTextMouseUp = (event: React.MouseEvent): void => {
    const hit = lookupWordFromMouseUp(event);
    if (!hit) {
      if (isLookupClick(event)) setPopup(null);
      return;
    }
    if (hit.translate) setTranslating(hit.query);
    else setPopup({ query: hit.query, x: hit.x, y: hit.y, context: hit.context });
  };

  const capturing = capture.active && !capture.test && capture.visualNovelId === entry?.id;
  const style = { '--vn-reader-font': `${settings.reader.fontSize}px` } as CSSProperties;

  return (
    <div className="vn-reader" style={style}>
      <header className="vn-reader-head">
        <span className={`vn-reader-dot${capturing ? ' is-on' : ''}`} title={capturing ? t('vnReader.capturing') : t('vnReader.notCapturing')} aria-hidden="true" />
        <span className="vn-reader-title">{entry?.title ?? ''}</span>
        <div className="vn-reader-tools">
          <label className="vn-reader-opacity" title={t('vnReader.opacity')}>
            <span className="sr-only">{t('vnReader.opacity')}</span>
            <input
              type="range"
              min={0.35}
              max={1}
              step={0.05}
              value={settings.reader.opacity}
              aria-label={t('vnReader.opacity')}
              onChange={(event) => setOpacity(Number(event.target.value))}
            />
          </label>
          <button type="button" aria-label={t('vnReader.fontSmaller')} title={t('vnReader.fontSmaller')} onClick={() => setFontSize(-2)}><span aria-hidden="true">{FONT_GLYPH}</span><small aria-hidden="true">{'\u2212'}</small></button>
          <button type="button" aria-label={t('vnReader.fontLarger')} title={t('vnReader.fontLarger')} onClick={() => setFontSize(2)}><span aria-hidden="true">{FONT_GLYPH}</span><small aria-hidden="true">+</small></button>
          <button type="button" className="vn-reader-close" aria-label={t('vnReader.close')} title={t('vnReader.close')} onClick={() => void window.api.visualNovelReaderClose()}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
      </header>
      {!entry && <p className="vn-reader-empty">{t('vnReader.noNovel')}</p>}
      {entry && !lines.length && <p className="vn-reader-empty">{t('vnReader.empty')}</p>}
      {entry && lines.length > 0 && (
        <div
          ref={listRef}
          className="vn-reader-lines wk-on"
          role="list"
          aria-label={t('vnReader.aria.lines')}
          data-dict-owner=""
          onPointerDown={noteLookupPointerDown}
          onMouseUp={onTextMouseUp}
        >
          {lines.map((line) => (
            <article key={line.id} role="listitem" className={`vn-reader-line${line.id === newestId ? ' is-newest' : ''}`}>
              {line.speaker && <span className="vn-reader-speaker" lang="ja">{line.speaker}</span>}
              <p lang="ja">{line.japanese}</p>
              {line.translation && <p className="vn-reader-translation">{line.translation}</p>}
              <div className="vn-reader-actions" onMouseUp={(event) => event.stopPropagation()}>
                {flash?.id === line.id && <small role="status">{t(flash.key)}</small>}
                <button type="button" onClick={() => setTranslating(line.japanese)}>{t('vnReader.translate')}</button>
                <button type="button" className="primary" onClick={() => mine(line)}>{t('vnReader.mine')}</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {popup && <DictionaryPopup {...popup} onClose={() => setPopup(null)} />}
      {translating && <SentenceTranslatePopup text={translating} onClose={() => setTranslating('')} />}
    </div>
  );
}
