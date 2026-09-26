/**
 * Grades a Mooncap stage sprite in a worker, falling back to the same pure function on the
 * UI thread when a worker cannot be made (tests, a crashed worker). The pattern is
 * `csvParseAsync.ts`'s: one lazily created worker, requests matched by id.
 */
import type { GradedSprite } from './mushroomGrade';
import { keyAndGradeStagePixels } from './stageSpritePixels';
import type { GardenSpriteReply, GardenSpriteRequest } from '../../workers/gardenSprite.worker';

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (g: GradedSprite) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../../workers/gardenSprite.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<GardenSpriteReply>) => {
      const reply = e.data;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      if (!reply.ok) {
        entry.reject(new Error(reply.error));
        return;
      }
      entry.resolve({
        image: new ImageData(new Uint8ClampedArray(reply.image), reply.width, reply.height),
        emissive: new ImageData(new Uint8ClampedArray(reply.emissive), reply.width, reply.height),
        minX: reply.minX,
        minY: reply.minY,
        maxX: reply.maxX,
        maxY: reply.maxY,
      });
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const entry of pending.values()) entry.reject(new Error('garden sprite worker failed'));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

/** Keys and re-lights `pixels` (consumed: its buffer is transferred to the worker). */
export async function gradeStagePixelsOffThread(pixels: ImageData): Promise<GradedSprite> {
  const w = getWorker();
  if (!w) return keyAndGradeStagePixels(pixels);
  const id = nextId++;
  const copy = new Uint8ClampedArray(pixels.data);
  const request: GardenSpriteRequest = { id, width: pixels.width, height: pixels.height, buffer: copy.buffer };
  try {
    return await new Promise<GradedSprite>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage(request, [request.buffer]);
    });
  } catch {
    // A worker that failed mid-request: grade the original here instead.
    return keyAndGradeStagePixels(pixels);
  }
}

/** For tests: forget the worker so the next call makes a fresh one. */
export function resetGardenSpriteWorkerForTests(): void {
  worker?.terminate();
  worker = null;
  workerBroken = false;
  pending.clear();
}
