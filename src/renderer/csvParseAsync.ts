/**
 * Async CSV parsing with a shared Web Worker and a synchronous fallback.
 *
 * The worker is created lazily on first use and reused for subsequent parses
 * (spawning a worker per file would pay ~10ms startup each time). If worker
 * creation or messaging fails for any reason, we fall back to parsing on the
 * main thread so imports never break — worst case is the old blocking
 * behavior.
 */
import { parseCsvText, type CsvParseOptions, type CsvTable } from '../shared/csvEditor';

type WorkerReply =
  | { id: number; ok: true; table: CsvTable }
  | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, { resolve: (t: CsvTable) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./workers/csvParse.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      if (e.data.ok) entry.resolve(e.data.table);
      else entry.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // Worker crashed — fail everything in flight and stop using it. Callers
      // catch and re-parse synchronously.
      workerBroken = true;
      for (const entry of pending.values()) entry.reject(new Error('CSV parse worker failed'));
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

export async function parseCsvTextAsync(raw: string, opts?: CsvParseOptions): Promise<CsvTable> {
  const w = getWorker();
  if (!w) return parseCsvText(raw, opts);
  const id = nextId++;
  try {
    return await new Promise<CsvTable>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, raw, opts });
    });
  } catch {
    return parseCsvText(raw, opts);
  }
}
