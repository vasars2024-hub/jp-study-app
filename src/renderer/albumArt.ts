// Album art + color palette per media item, memory-cached. The mini-player
// widget themes its background with the palette; the visualizer can use it
// as a color theme.

export interface Palette {
  primary: string;
  secondary: string;
}

const artCache = new Map<string, string | null>();
const paletteCache = new Map<string, Palette | null>();

export function clearArtCache(): void {
  artCache.clear();
  paletteCache.clear();
}

export function accentPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  return {
    primary: cs.getPropertyValue('--accent').trim() || '#ff2e4d',
    secondary: cs.getPropertyValue('--accent-2').trim() || '#ff6b81',
  };
}

/** Embedded cover art as a data URL, or null. */
export async function coverFor(id: string): Promise<string | null> {
  if (artCache.has(id)) return artCache.get(id) ?? null;
  const url = await window.api.coverArt(id);
  artCache.set(id, url);
  return url;
}

/**
 * Two dominant-ish colors of the cover (bucketed average of a downscaled
 * copy). Returns null when the song has no artwork — callers fall back to
 * the accent palette.
 */
export async function paletteFor(id: string): Promise<Palette | null> {
  if (paletteCache.has(id)) return paletteCache.get(id) ?? null;
  const url = await coverFor(id);
  if (!url) {
    paletteCache.set(id, null);
    return null;
  }
  const palette = await new Promise<Palette | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const g = canvas.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, size, size);
        const px = g.getImageData(0, 0, size, size).data;
        // Bucket by hue-ish quantization; keep the two most common vivid buckets.
        const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], gg = px[i + 1], b = px[i + 2];
          const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
          if (max < 40 || max - min < 24) continue; // skip near-black / gray
          const key = `${r >> 5}-${gg >> 5}-${b >> 5}`;
          const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
          cur.r += r; cur.g += gg; cur.b += b; cur.n += 1;
          buckets.set(key, cur);
        }
        const top = [...buckets.values()].sort((a, b) => b.n - a.n);
        if (!top.length) return resolve(null);
        const hex = (v: { r: number; g: number; b: number; n: number }) =>
          '#' + [v.r, v.g, v.b].map((c) => Math.round(c / v.n).toString(16).padStart(2, '0')).join('');
        resolve({ primary: hex(top[0]), secondary: hex(top[1] ?? top[0]) });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  paletteCache.set(id, palette);
  return palette;
}
