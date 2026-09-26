/**
 * Web Worker: keys and re-lights the City's Mooncap sprite off the UI thread
 * (see `components/reading-garden/stageSpritePixels.ts` for why). The pixel
 * buffers travel both ways as transferables, so nothing is copied.
 */
import { keyAndGradeStagePixels } from '../components/reading-garden/stageSpritePixels';

export interface GardenSpriteRequest {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export type GardenSpriteReply =
  | {
      id: number;
      ok: true;
      width: number;
      height: number;
      image: ArrayBuffer;
      emissive: ArrayBuffer;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<GardenSpriteRequest>) => {
  const { id, width, height, buffer } = e.data;
  try {
    const graded = keyAndGradeStagePixels(new ImageData(new Uint8ClampedArray(buffer), width, height));
    const image = graded.image.data.buffer as ArrayBuffer;
    const emissive = graded.emissive.data.buffer as ArrayBuffer;
    const reply: GardenSpriteReply = {
      id, ok: true, width, height, image, emissive,
      minX: graded.minX, minY: graded.minY, maxX: graded.maxX, maxY: graded.maxY,
    };
    (self as unknown as Worker).postMessage(reply, [image, emissive]);
  } catch (error) {
    const reply: GardenSpriteReply = { id, ok: false, error: error instanceof Error ? error.message : String(error) };
    (self as unknown as Worker).postMessage(reply);
  }
};
