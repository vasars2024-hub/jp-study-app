import { useEffect, useRef } from 'react';
import type { MokuroPage } from '../../../shared/mokuroTypes';
import { blockContext } from '../../../shared/mokuroTypes';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../../wordLookup';
import { useT } from '../../i18n';

interface Props {
  jaPage: MokuroPage;
  enPage: MokuroPage | null;
  translating: boolean;
  onRequestTranslate: () => void;
  showSfx: boolean;
  onLookup: (hit: { query: string; x: number; y: number; context: string }) => void;
  onDismissLookup: () => void;
  popupOpen: boolean;
}

/** JP/EN two-column reading view; clicking a row in either column scrolls its counterpart into view. */
export default function MangaCompareView({
  jaPage,
  enPage,
  translating,
  onRequestTranslate,
  showSfx,
  onLookup,
  onDismissLookup,
  popupOpen,
}: Props) {
  const { t } = useT();
  const popupOpenOnDownRef = useRef(popupOpen);
  popupOpenOnDownRef.current = popupOpen;
  const jaRefs = useRef<Record<string, HTMLElement | null>>({});
  const enRefs = useRef<Record<string, HTMLElement | null>>({});

  // Auto-request a translation the first time Compare mode is entered. Intentionally
  // keyed only on jaPage (a new scanned page) — onRequestTranslate/enPage/translating
  // change on every translate-progress tick and must not re-trigger this.
  useEffect(() => {
    if (!enPage && !translating) onRequestTranslate();
  }, [jaPage]);

  const rows = jaPage.blocks
    .map((jaBlock, i) => ({
      key: jaBlock.regionId ?? `row-${i}`,
      jaBlock,
      enBlock: enPage?.blocks[i],
    }))
    .filter((r) => r.jaBlock.kind !== 'ignore' && (showSfx || r.jaBlock.kind !== 'sfx'));

  function scrollTo(refs: React.MutableRefObject<Record<string, HTMLElement | null>>, key: string) {
    refs.current[key]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  return (
    <div className="manga-compare-view">
      <div className="manga-compare-col">
        {rows.map(({ key, jaBlock }) => {
          const text = blockContext(jaBlock);
          if (!text) return null;
          return (
            <p
              key={key}
              ref={(el) => {
                jaRefs.current[key] = el;
              }}
              className="ocr-text manga-compare-line"
              lang="ja"
              data-lookup-block=""
              data-dict-owner=""
              onClick={() => scrollTo(enRefs, key)}
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
        })}
      </div>
      <div className="manga-compare-col manga-compare-col-en">
        {!enPage ? (
          <div className="manga-compare-placeholder">
            {translating ? (
              <span className="muted">{t('manga.translate.working')}</span>
            ) : (
              <button className="btn small" onClick={onRequestTranslate}>
                {t('manga.viewMode.compareTranslate')}
              </button>
            )}
          </div>
        ) : (
          rows.map(({ key, jaBlock, enBlock }) => {
            const text = enBlock ? blockContext(enBlock) : blockContext(jaBlock);
            if (!text) return null;
            return (
              <p
                key={key}
                ref={(el) => {
                  enRefs.current[key] = el;
                }}
                className="manga-compare-line manga-compare-line-en"
                onClick={() => scrollTo(jaRefs, key)}
              >
                {text}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}
