import { useRef } from 'react';
import type { MokuroPage } from '../../../shared/mokuroTypes';
import { blockContext } from '../../../shared/mokuroTypes';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../../wordLookup';

interface Props {
  page: MokuroPage;
  showSfx: boolean;
  onLookup: (hit: { query: string; x: number; y: number; context: string }) => void;
  onDismissLookup: () => void;
  popupOpen: boolean;
}

/**
 * Full-bleed reading-order reconstruction of a scanned page's text — no image,
 * no boxes. Blocks already arrive in approximate manga reading order (see
 * src/shared/readingOrder.ts), so this needs no ordering logic of its own.
 */
export default function MangaCleanTextView({ page, showSfx, onLookup, onDismissLookup, popupOpen }: Props) {
  const popupOpenOnDownRef = useRef(popupOpen);
  popupOpenOnDownRef.current = popupOpen;

  const visible = page.blocks.filter((b) => b.kind !== 'ignore' && (showSfx || b.kind !== 'sfx'));

  return (
    <div className="manga-clean-view">
      {visible.length === 0 ? (
        <p className="muted">—</p>
      ) : (
        visible.map((block, i) => {
          const text = blockContext(block);
          if (!text) return null;
          return (
            <p
              key={block.regionId ?? `clean-${i}`}
              className={`ocr-text manga-clean-line${block.kind === 'sfx' ? ' sfx' : ''}`}
              lang="ja"
              data-lookup-block=""
              data-dict-owner=""
              onMouseDown={(e) => {
                popupOpenOnDownRef.current = popupOpen;
                noteLookupPointerDown(e);
              }}
              onMouseUp={(e) => {
                const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
                const hit = lookupWordFromMouseUp(e);
                if (hit && !hit.translate) {
                  onLookup({ query: hit.query, x: hit.x, y: hit.y, context: hit.context ?? text });
                } else if (dismissOnly) {
                  onDismissLookup();
                }
              }}
            >
              {text}
            </p>
          );
        })
      )}
    </div>
  );
}
