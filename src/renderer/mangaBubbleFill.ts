import type { MokuroBox } from '../shared/mokuroTypes';

/**
 * Sample a thin ring just outside a Mokuro box and return a median RGB fill
 * suitable for opaque bubble backgrounds in translate-page mode.
 */
export async function medianBorderColor(
  imageUrl: string,
  box: MokuroBox,
  imgWidth: number,
  imgHeight: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || imgWidth;
        canvas.height = img.naturalHeight || imgHeight;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        if (!g) return resolve('#f5f0e6');
        g.drawImage(img, 0, 0);
        const [xmin, ymin, xmax, ymax] = box;
        const sx = canvas.width / imgWidth;
        const sy = canvas.height / imgHeight;
        const x0 = Math.max(0, Math.floor(xmin * sx) - 2);
        const y0 = Math.max(0, Math.floor(ymin * sy) - 2);
        const x1 = Math.min(canvas.width, Math.ceil(xmax * sx) + 2);
        const y1 = Math.min(canvas.height, Math.ceil(ymax * sy) + 2);
        const w = Math.max(1, x1 - x0);
        const h = Math.max(1, y1 - y0);
        const data = g.getImageData(x0, y0, w, h).data;
        const rs: number[] = [];
        const gs: number[] = [];
        const bs: number[] = [];
        const pad = 3;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const onEdge = x < pad || y < pad || x >= w - pad || y >= h - pad;
            if (!onEdge) continue;
            const i = (y * w + x) * 4;
            rs.push(data[i]);
            gs.push(data[i + 1]);
            bs.push(data[i + 2]);
          }
        }
        if (!rs.length) return resolve('#f5f0e6');
        const mid = (arr: number[]) => {
          const s = [...arr].sort((a, b) => a - b);
          return s[Math.floor(s.length / 2)];
        };
        const hex = (n: number) => n.toString(16).padStart(2, '0');
        resolve(`#${hex(mid(rs))}${hex(mid(gs))}${hex(mid(bs))}`);
      } catch {
        resolve('#f5f0e6');
      }
    };
    img.onerror = () => resolve('#f5f0e6');
    img.src = imageUrl;
  });
}
