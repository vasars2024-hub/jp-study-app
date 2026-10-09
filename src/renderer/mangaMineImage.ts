/**
 * The picture a manga mine carries: the speech bubble the word was read from,
 * cropped out of the page with a margin of the art around it — what Mokuro and
 * Migaku put on a card, so the card shows the scene and not just the text.
 */
import { blockContext, type MokuroBlock, type MokuroBox, type MokuroPage } from '../shared/mokuroTypes';
import type { MineMediaPayload } from './studyMining';
import { cropPageImage } from './mangaOcrOrientation';

const squash = (text: string): string => text.normalize('NFKC').replace(/\s+/g, '');

/**
 * The block a lookup came from: the one whose text IS the lookup's context
 * (the overlay passes the bubble's own text), else the first that contains the
 * looked-up word. Null when neither is on the page — no guessed picture.
 */
export function blockForLookup(page: MokuroPage | null, context: string | undefined, query: string): MokuroBlock | null {
  if (!page) return null;
  const blocks = page.blocks.filter((block) => block.kind !== 'ignore');
  const ctx = squash(context ?? '');
  if (ctx) {
    const exact = blocks.find((block) => squash(blockContext(block)) === ctx);
    if (exact) return exact;
  }
  const word = squash(query);
  if (!word) return null;
  return blocks.find((block) => squash(blockContext(block)).includes(word)) ?? null;
}

/** `box` grown by `pad` of its own size on every side (at least 24 px), clamped to the image. */
export function paddedBox(box: MokuroBox, width: number, height: number, pad = 0.35): MokuroBox {
  const [x1, y1, x2, y2] = box;
  const dx = Math.max(24, Math.abs(x2 - x1) * pad);
  const dy = Math.max(24, Math.abs(y2 - y1) * pad);
  return [
    Math.max(0, Math.min(x1, x2) - dx),
    Math.max(0, Math.min(y1, y2) - dy),
    Math.min(width, Math.max(x1, x2) + dx),
    Math.min(height, Math.max(y1, y2) + dy),
  ];
}

/** The cropped bubble for a mine, or undefined when it cannot be made (no block, no image). */
export async function mangaMineImage(
  pageUrl: string | undefined,
  page: MokuroPage | null,
  context: string | undefined,
  query: string,
  itemId: string,
  pageIndex: number,
): Promise<MineMediaPayload | undefined> {
  const block = blockForLookup(page, context, query);
  if (!block || !page || !pageUrl) return undefined;
  try {
    const dataUrl = await window.api.readMangaPage(pageUrl);
    if (!dataUrl) return undefined;
    const crop = await cropPageImage(dataUrl, paddedBox(block.box, page.img_width, page.img_height));
    const comma = crop.indexOf(',');
    if (comma === -1) return undefined;
    const safeId = itemId.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'manga';
    return { base64: crop.slice(comma + 1), filename: `${safeId}-p${pageIndex + 1}.png` };
  } catch {
    return undefined;
  }
}
