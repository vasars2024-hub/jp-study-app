import { useEffect, useRef, useState } from 'react';
import type { MokuroBlock, MokuroBlockKind, MokuroPage } from '../../../shared/mokuroTypes';
import { blockContext } from '../../../shared/mokuroTypes';
import { useT } from '../../i18n';
import { getZoomFactor } from '../../appZoom';

interface Props {
  page: MokuroPage;
  block: MokuroBlock;
  pageUrl: string;
  anchor: { x: number; y: number };
  busy: boolean;
  onClose: () => void;
  onSaveLines: (lines: string[]) => void;
  onSetKind: (kind: MokuroBlockKind) => void;
  onSetVertical: (vertical: boolean) => void;
  onRescan: () => void;
  onMerge: (otherRegionId: string) => void;
  splitAxis: 'x' | 'y';
  splitFraction: number;
  onSplitAxisChange: (axis: 'x' | 'y') => void;
  onSplitFractionChange: (fraction: number) => void;
  onConfirmSplit: () => void;
}

/** CSS-sprite crop of the source page image, scoped to one region's box. */
function CropPreview({ page, block, pageUrl }: { page: MokuroPage; block: MokuroBlock; pageUrl: string }) {
  const PREVIEW_W = 240;
  const [xmin, ymin, xmax, ymax] = block.box;
  const bw = Math.max(1, xmax - xmin);
  const bh = Math.max(1, ymax - ymin);
  const scale = PREVIEW_W / bw;
  const previewH = Math.min(320, bh * scale);
  return (
    <div
      className="region-editor-crop"
      style={{
        width: PREVIEW_W,
        height: previewH,
        backgroundImage: `url(${pageUrl})`,
        backgroundSize: `${page.img_width * scale}px ${page.img_height * scale}px`,
        backgroundPosition: `-${xmin * scale}px -${ymin * scale}px`,
      }}
    />
  );
}

export default function RegionEditorModal({
  page,
  block,
  pageUrl,
  anchor,
  busy,
  onClose,
  onSaveLines,
  onSetKind,
  onSetVertical,
  onRescan,
  onMerge,
  splitAxis,
  splitFraction,
  onSplitAxisChange,
  onSplitFractionChange,
  onConfirmSplit,
}: Props) {
  const { t } = useT();
  const [draft, setDraft] = useState(block.lines.join('\n'));
  const [splitting, setSplitting] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(block.lines.join('\n'));
    setSplitting(false);
  }, [block.regionId]);

  // Keep the modal on-screen, accounting for the app-wide CSS zoom factor
  // the same way DictionaryPopup does.
  const [style, setStyle] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y });
  useEffect(() => {
    const zoom = getZoomFactor();
    const vw = window.innerWidth / zoom;
    const vh = window.innerHeight / zoom;
    const w = 320;
    const h = ref.current?.offsetHeight ?? 420;
    const left = Math.min(Math.max(8, anchor.x), Math.max(8, vw - w - 8));
    const top = Math.min(Math.max(8, anchor.y), Math.max(8, vh - h - 8));
    setStyle({ left, top });
  }, [anchor.x, anchor.y, block.regionId]);

  const otherBlocks = page.blocks.filter((b) => b.regionId && b.regionId !== block.regionId);
  const position = page.blocks.findIndex((b) => b.regionId === block.regionId) + 1;

  function save() {
    onSaveLines(
      draft
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    );
  }

  return (
    <div
      ref={ref}
      className="region-editor-modal"
      style={{ left: style.left, top: style.top }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onClose();
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
      }}
    >
      <div className="region-editor-head">
        <span>{t('manga.regionEditor.title')}</span>
        <button className="dict-x" onClick={onClose} aria-label={t('manga.ocr.close')}>
          ×
        </button>
      </div>

      <div className="region-editor-body">
        <CropPreview page={page} block={block} pageUrl={pageUrl} />

        <div className="region-editor-meta">
          <span>
            {t('manga.regionEditor.confidence')}: {Math.round((block.confidence ?? 0) * 100)}%
          </span>
          <span>
            {t('manga.regionEditor.position')}: {position}/{page.blocks.length}
          </span>
        </div>

        <label className="region-editor-label">{t('manga.regionEditor.raw')}</label>
        <div className="region-editor-raw" lang="ja">
          {block.rawLines?.length ? block.rawLines.join('\n') : blockContext(block) || '—'}
        </div>

        <label className="region-editor-label">{t('manga.regionEditor.corrected')}</label>
        <textarea
          className="region-editor-textarea"
          lang="ja"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />

        <div className="region-editor-row">
          <button
            className="btn small"
            disabled={busy}
            onClick={() => setDraft((block.rawLines ?? block.lines).join('\n'))}
          >
            {t('manga.regionEditor.revertToRaw')}
          </button>
          <button className="btn small" disabled={busy} onClick={() => void onRescan()}>
            {t('manga.regionEditor.rescanRegion')}
          </button>
        </div>

        <div className="sp-seg region-editor-orientation">
          <button
            className={`sp-seg-btn ${block.vertical ? 'active' : ''}`}
            aria-pressed={block.vertical}
            disabled={busy}
            onClick={() => onSetVertical(true)}
          >
            {t('manga.ocr.vertical')}
          </button>
          <button
            className={`sp-seg-btn ${!block.vertical ? 'active' : ''}`}
            aria-pressed={!block.vertical}
            disabled={busy}
            onClick={() => onSetVertical(false)}
          >
            {t('manga.ocr.horizontal')}
          </button>
        </div>

        <div className="sp-seg region-editor-kind">
          {(['text', 'sfx', 'ignore'] as MokuroBlockKind[]).map((k) => (
            <button
              key={k}
              className={`sp-seg-btn ${(block.kind ?? 'text') === k ? 'active' : ''}`}
              aria-pressed={(block.kind ?? 'text') === k}
              disabled={busy}
              onClick={() => onSetKind(k)}
            >
              {t(`manga.regionEditor.kind.${k}`)}
            </button>
          ))}
        </div>

        {otherBlocks.length > 0 && (
          <div className="region-editor-merge">
            <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
              <option value="">{t('manga.regionEditor.mergeWith')}</option>
              {otherBlocks.map((b) => (
                <option key={b.regionId} value={b.regionId}>
                  {blockContext(b).slice(0, 24) || b.regionId}
                </option>
              ))}
            </select>
            <button
              className="btn small"
              disabled={busy || !mergeTarget}
              onClick={() => mergeTarget && onMerge(mergeTarget)}
            >
              {t('manga.regionEditor.merge')}
            </button>
          </div>
        )}

        {!splitting ? (
          <button className="btn small" disabled={busy} onClick={() => setSplitting(true)}>
            {t('manga.regionEditor.split')}
          </button>
        ) : (
          <div className="region-editor-split">
            <div className="sp-seg">
              <button
                className={`sp-seg-btn ${splitAxis === 'x' ? 'active' : ''}`}
                aria-pressed={splitAxis === 'x'}
                onClick={() => onSplitAxisChange('x')}
              >
                {t('manga.regionEditor.splitVertical')}
              </button>
              <button
                className={`sp-seg-btn ${splitAxis === 'y' ? 'active' : ''}`}
                aria-pressed={splitAxis === 'y'}
                onClick={() => onSplitAxisChange('y')}
              >
                {t('manga.regionEditor.splitHorizontal')}
              </button>
            </div>
            <input
              type="range"
              className="ui-slider"
              min={10}
              max={90}
              value={Math.round(splitFraction * 100)}
              onChange={(e) => onSplitFractionChange(Number(e.target.value) / 100)}
              aria-label={t('a11y.slider.regionSplit')}
            />
            <div className="region-editor-row">
              <button
                className="btn small"
                disabled={busy}
                onClick={() => {
                  onConfirmSplit();
                  setSplitting(false);
                }}
              >
                {t('manga.regionEditor.confirmSplit')}
              </button>
              <button className="btn small" onClick={() => setSplitting(false)}>
                {t('manga.regionEditor.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="region-editor-row region-editor-footer">
          <button className="btn small" onClick={onClose}>
            {t('manga.regionEditor.cancel')}
          </button>
          <button className="btn small active" disabled={busy} onClick={save}>
            {t('manga.regionEditor.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
