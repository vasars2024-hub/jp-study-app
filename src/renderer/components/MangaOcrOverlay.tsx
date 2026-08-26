import { useCallback, useRef } from 'react';
import type { MokuroBlock, MokuroPage } from '../../shared/mokuroTypes';
import { blockContext } from '../../shared/mokuroTypes';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../wordLookup';

interface Props {
  page: MokuroPage;
  showSfx: boolean;
  /** Opaque fill colors keyed by regionId (translate-page mode). */
  fillByRegion?: Record<string, string>;
  /** When true, hide translucent chrome so fills look like cleaned bubbles. */
  translateMode?: boolean;
  /** When true, draw box outlines only — also implied when not in translateMode. */
  boxesOnly?: boolean;
  /** Region currently open in the RegionEditorModal — just a highlight here, editing itself happens in the modal. */
  editingRegionId: string | null;
  /** Live preview of a pending manual split (RegionEditorModal's slider), purely visual. */
  splitPreview?: { regionId: string; axis: 'x' | 'y'; fraction: number } | null;
  onHoverRegion: (regionId: string | null) => void;
  onRequestEdit: (regionId: string) => void;
  onLookup: (hit: { query: string; x: number; y: number; context: string; translate?: boolean }) => void;
  onDismissLookup: () => void;
  popupOpen: boolean;
}

/**
 * On-page OCR region overlays.
 * Detection (Japanese source): highlight boxes only — never paint kanji/kana
 * on top of the art. Translate mode paints the English (or UI-lang) text.
 */
export default function MangaOcrOverlay({
  page,
  showSfx,
  fillByRegion,
  translateMode = false,
  boxesOnly = false,
  editingRegionId,
  splitPreview,
  onHoverRegion,
  onRequestEdit,
  onLookup,
  onDismissLookup,
  popupOpen,
}: Props) {
  const popupOpenOnDownRef = useRef(false);

  const onSelect = useCallback(
    (e: React.MouseEvent, block: MokuroBlock) => {
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
      const hit = lookupWordFromMouseUp(e);
      if (hit) {
        // Mirror the novel reader: a word click → dict popup, a phrase/sentence
        // selection → translate popup. `translate` is forwarded so the parent
        // can route it; context falls back to the whole bubble text.
        onLookup({
          query: hit.query,
          x: hit.x,
          y: hit.y,
          context: hit.context ?? blockContext(block),
          translate: hit.translate,
        });
      } else if (dismissOnly) {
        onDismissLookup();
      }
    },
    [onLookup, onDismissLookup],
  );

  const visible = page.blocks.filter((b) => {
    if (b.kind === 'ignore') return false;
    if (b.kind === 'sfx' && !showSfx) return false;
    return true;
  });

  // Never overlay Japanese OCR glyphs on Japanese art — highlight only until translated.
  const highlightOnly = !translateMode || boxesOnly;

  return (
    <div className="manga-ocr-layer" aria-hidden={false}>
      {visible.map((block, i) => {
        const id = block.regionId ?? `anon-${i}`;
        const [xmin, ymin, xmax, ymax] = block.box;
        const left = (xmin / page.img_width) * 100;
        const top = (ymin / page.img_height) * 100;
        const width = ((xmax - xmin) / page.img_width) * 100;
        const height = ((ymax - ymin) / page.img_height) * 100;
        const editing = editingRegionId === id;
        const fontPx = block.font_size ?? Math.max(12, (ymax - ymin) * 0.08);
        /**
         * The font size the OCR carries is in IMAGE pixels; every box above is laid out as a
         * PERCENTAGE of the rendered page. So the boxes shrink with the stage and the type
         * did not, and the overlay only ever fitted at 1:1 zoom — which a 2400 px scan inside
         * a window never is. Measured 2026-08-25 on One Punch-Man ch.229, page rendered 512
         * of 2400 natural px (scale 0.214): four of five bubbles lost text behind
         * `overflow: hidden` with no scrollbar and no affordance — 198, 20, 224 and **544 px
         * of a 568 px block, i.e. 4% of the translation visible**. Same arithmetic makes the
         * transparent Japanese layer's click targets land on the wrong word.
         *
         * `cqw` is 1% of `.manga-ocr-layer`'s inline size, and that layer is `inset: 0` on the
         * page, so `fontPx / img_width` expressed in `cqw` is exactly the authored size times
         * the render scale — the same ratio the boxes already use. It reflows on zoom and on
         * a window resize for free, with no measurement and no ResizeObserver.
         */
        const fontCqw = (fontPx / (page.img_width || 1)) * 100;
        const fontSize = `${fontCqw.toFixed(4)}cqw`;
        const previewText = block.lines.filter(Boolean).join(' · ');

        if (highlightOnly) {
          return (
            <div
              key={id}
              className={`manga-ocr-block manga-ocr-block-outline${block.kind === 'sfx' ? ' sfx' : ''}${editing ? ' editing' : ''}`}
              data-region-id={id}
              style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
              title={
                previewText
                  ? previewText
                  : block.confidence != null
                    ? `${Math.round(block.confidence * 100)}%`
                    : undefined
              }
              onMouseEnter={() => onHoverRegion(id)}
              onMouseLeave={() => onHoverRegion(null)}
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRequestEdit(id);
              }}
            >
              {/*
                Mokuro-style invisible text layer: the Japanese OCR text is laid
                over the bubble but painted transparent, so the artwork stays
                fully visible while the text remains real, selectable DOM. That
                is what makes click-a-word / drag-a-sentence lookup work on the
                page itself instead of only in the side panel.
              */}
              {block.lines.some((l) => l.trim()) && (
                <div
                  className="ocr-text manga-ocr-text manga-ocr-ja-text"
                  lang="ja"
                  data-lookup-block=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: 0,
                    writingMode: block.vertical ? 'vertical-rl' : 'horizontal-tb',
                    fontSize,
                    lineHeight: 1.1,
                    color: 'transparent',
                    cursor: 'text',
                    overflow: 'hidden',
                  }}
                  onMouseDown={(e) => {
                    popupOpenOnDownRef.current = popupOpen;
                    noteLookupPointerDown(e);
                  }}
                  onMouseUp={(e) => onSelect(e, block)}
                >
                  {block.lines.map((line, li) => (
                    <p key={li} style={{ margin: 0 }}>
                      {line}
                    </p>
                  ))}
                </div>
              )}
              {splitPreview?.regionId === id &&
                (splitPreview.axis === 'x' ? (
                  <div
                    className="manga-ocr-split-line"
                    style={{ left: `${splitPreview.fraction * 100}%`, top: 0, bottom: 0, width: 2 }}
                  />
                ) : (
                  <div
                    className="manga-ocr-split-line"
                    style={{ top: `${splitPreview.fraction * 100}%`, left: 0, right: 0, height: 2 }}
                  />
                ))}
            </div>
          );
        }

        return (
          <div
            key={id}
            className={`manga-ocr-block${block.kind === 'sfx' ? ' sfx' : ''}${block.kind === 'ignore' ? ' ignored' : ''}${editing ? ' editing' : ''} translated`}
            data-region-id={id}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              writingMode: 'horizontal-tb',
              fontSize,
              ...(fillByRegion?.[id]
                ? { background: fillByRegion[id], borderColor: 'transparent' }
                : null),
            }}
            onMouseEnter={() => onHoverRegion(id)}
            onMouseLeave={() => onHoverRegion(null)}
            onDoubleClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRequestEdit(id);
            }}
          >
            <div
              className="ocr-text manga-ocr-text"
              data-lookup-block=""
              onMouseDown={(e) => {
                popupOpenOnDownRef.current = popupOpen;
                noteLookupPointerDown(e);
              }}
              onMouseUp={(e) => onSelect(e, block)}
            >
              {block.lines.map((line, li) => (
                <p key={li}>{line}</p>
              ))}
            </div>
            {splitPreview?.regionId === id &&
              (splitPreview.axis === 'x' ? (
                <div
                  className="manga-ocr-split-line"
                  style={{ left: `${splitPreview.fraction * 100}%`, top: 0, bottom: 0, width: 2 }}
                />
              ) : (
                <div
                  className="manga-ocr-split-line"
                  style={{ top: `${splitPreview.fraction * 100}%`, left: 0, right: 0, height: 2 }}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}
