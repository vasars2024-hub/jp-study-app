import { useCallback, useRef, useState } from 'react';
import type { MokuroBox } from '../../../shared/mokuroTypes';

interface Props {
  /** When false, the layer is not rendered. */
  active: boolean;
  imgWidth: number;
  imgHeight: number;
  disabled?: boolean;
  onDrawComplete: (box: MokuroBox) => void;
}

type DragState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

const MIN_DRAG_PX = 6;

function clientToImage(
  clientX: number,
  clientY: number,
  el: HTMLElement,
  imgWidth: number,
  imgHeight: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * imgWidth;
  const y = ((clientY - rect.top) / Math.max(1, rect.height)) * imgHeight;
  return {
    x: Math.max(0, Math.min(imgWidth, x)),
    y: Math.max(0, Math.min(imgHeight, y)),
  };
}

function dragToBox(d: DragState): MokuroBox {
  return [
    Math.min(d.startX, d.currentX),
    Math.min(d.startY, d.currentY),
    Math.max(d.startX, d.currentX),
    Math.max(d.startY, d.currentY),
  ];
}

/**
 * Full-page rubber-band overlay for manually drawing OCR regions.
 * Sits above the page image; pointer events only when `active`.
 */
export default function MangaRegionDrawLayer({
  active,
  imgWidth,
  imgHeight,
  disabled = false,
  onDrawComplete,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const finish = useCallback(
    (d: DragState) => {
      const box = dragToBox(d);
      const [xmin, ymin, xmax, ymax] = box;
      if (xmax - xmin < MIN_DRAG_PX || ymax - ymin < MIN_DRAG_PX) return;
      onDrawComplete(box);
    },
    [onDrawComplete],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || !layerRef.current || imgWidth <= 0 || imgHeight <= 0) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = clientToImage(e.clientX, e.clientY, layerRef.current, imgWidth, imgHeight);
      pointerIdRef.current = e.pointerId;
      layerRef.current.setPointerCapture(e.pointerId);
      setDrag({ startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y });
    },
    [disabled, imgWidth, imgHeight],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId || !layerRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = clientToImage(e.clientX, e.clientY, layerRef.current, imgWidth, imgHeight);
      setDrag((prev) => (prev ? { ...prev, currentX: pt.x, currentY: pt.y } : null));
    },
    [imgWidth, imgHeight],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      e.stopPropagation();
      pointerIdRef.current = null;
      try {
        layerRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      setDrag((prev) => {
        if (prev) finish(prev);
        return null;
      });
    },
    [finish],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setDrag(null);
  }, []);

  if (!active || imgWidth <= 0 || imgHeight <= 0) return null;

  const box = drag ? dragToBox(drag) : null;
  const previewStyle =
    box &&
    ({
      left: `${(box[0] / imgWidth) * 100}%`,
      top: `${(box[1] / imgHeight) * 100}%`,
      width: `${((box[2] - box[0]) / imgWidth) * 100}%`,
      height: `${((box[3] - box[1]) / imgHeight) * 100}%`,
    } as const);

  return (
    <div
      ref={layerRef}
      className={`manga-region-draw-layer${disabled ? ' busy' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {previewStyle && <div className="manga-region-draw-rect" style={previewStyle} />}
    </div>
  );
}
