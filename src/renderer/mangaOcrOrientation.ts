import type { OcrLang } from './ocr';
import type { MokuroBox } from '../shared/mokuroTypes';

/**
 * Text direction for the fallback (Tesseract) manga OCR.
 *
 * The reader used to default to Vertical for every scan, so a horizontal caption,
 * a sign or a web comic's text came back as noise until the user found the
 * direction switch. `auto` is now the default and reads the direction off the
 * shape of what is being scanned: a speech bubble with vertical Japanese is taller
 * than it is wide, a horizontal line is wider than it is tall. A near-square box is
 * ambiguous, and vertical is the right guess there for manga, where it is the norm.
 */
export type OcrOrientationChoice = 'auto' | OcrLang;

/** Wider than tall by this factor reads as horizontal text. */
const WIDE_RATIO = 1.15;

export function orientationForSize(width: number, height: number): OcrLang {
  if (!(width > 0) || !(height > 0)) return 'jpn_vert';
  return width > height * WIDE_RATIO ? 'jpn' : 'jpn_vert';
}

export function orientationForBox(box: MokuroBox): OcrLang {
  const [x1, y1, x2, y2] = box;
  return orientationForSize(Math.abs(x2 - x1), Math.abs(y2 - y1));
}

/** The concrete Tesseract model for a choice, given the scanned area's size. */
export function resolveOcrOrientation(
  choice: OcrOrientationChoice,
  size: { w: number; h: number } | null | undefined,
): OcrLang {
  if (choice !== 'auto') return choice;
  return orientationForSize(size?.w ?? 0, size?.h ?? 0);
}

/**
 * Crop `box` (page-image pixels) out of a page image. Browser-only: it needs a
 * decoded image and a 2D canvas.
 */
export async function cropPageImage(dataUrl: string, box: MokuroBox): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const [x1, y1, x2, y2] = box;
  const x = Math.max(0, Math.min(x1, x2));
  const y = Math.max(0, Math.min(y1, y2));
  const w = Math.max(1, Math.min(img.naturalWidth - x, Math.abs(x2 - x1)));
  const h = Math.max(1, Math.min(img.naturalHeight - y, Math.abs(y2 - y1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
