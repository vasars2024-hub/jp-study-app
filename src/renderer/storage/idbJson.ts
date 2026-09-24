/**
 * JSON encoding for IndexedDB values.
 *
 * IndexedDB stores structured-clone values; a backup file and a recovery dump
 * are JSON. Almost everything the app keeps in IndexedDB is plain JSON already,
 * but a Date, a Map, a Set or binary data would silently turn into `{}` under a
 * bare `JSON.stringify` — which is data loss the moment someone restores it.
 * These helpers tag those few types so they round-trip exactly.
 *
 * Tagged form: `{ "__gumType": "Date", "v": "2026-09-24T…" }`. Plain objects
 * are walked recursively; anything unrecognised (functions, class instances
 * with no data) is dropped the way structured clone would reject it.
 */

const TAG = '__gumType';

type Tagged = { [TAG]: string; v: unknown };

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TYPED_ARRAYS: Record<string, new (buf: ArrayBuffer) => ArrayBufferView> = {
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  Uint8ClampedArray,
};

type PendingBlob = { blob: Blob; slot: { type: string; data: string } };

function encodeSync(value: unknown, blobs: PendingBlob[]): unknown {
  if (value === null || typeof value !== 'object') {
    if (value === undefined) return { [TAG]: 'undefined', v: null } satisfies Tagged;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { [TAG]: 'Number', v: String(value) } satisfies Tagged;
    }
    if (typeof value === 'bigint') return { [TAG]: 'BigInt', v: value.toString() } satisfies Tagged;
    return value;
  }
  if (value instanceof Date) return { [TAG]: 'Date', v: value.toISOString() } satisfies Tagged;
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    // Filled in after the synchronous walk — reading a Blob is async.
    const slot = { type: value.type, data: '' };
    blobs.push({ blob: value, slot });
    return { [TAG]: 'Blob', v: slot } satisfies Tagged;
  }
  if (value instanceof ArrayBuffer) {
    return { [TAG]: 'ArrayBuffer', v: bytesToBase64(new Uint8Array(value)) } satisfies Tagged;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return { [TAG]: view.constructor.name, v: bytesToBase64(bytes) } satisfies Tagged;
  }
  if (value instanceof Map) {
    const entries: unknown[] = [];
    for (const [k, v] of value) entries.push([encodeSync(k, blobs), encodeSync(v, blobs)]);
    return { [TAG]: 'Map', v: entries } satisfies Tagged;
  }
  if (value instanceof Set) {
    const items: unknown[] = [];
    for (const v of value) items.push(encodeSync(v, blobs));
    return { [TAG]: 'Set', v: items } satisfies Tagged;
  }
  if (Array.isArray(value)) return value.map((v) => encodeSync(v, blobs));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'function' || typeof v === 'symbol') continue;
    out[k] = encodeSync(v, blobs);
  }
  return out;
}

/** Encode a structured-clone value into JSON-safe form (async because of Blobs). */
export async function encodeIdbValue(value: unknown): Promise<unknown> {
  const blobs: PendingBlob[] = [];
  const encoded = encodeSync(value, blobs);
  for (const { blob, slot } of blobs) {
    slot.data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }
  return encoded;
}

/** Inverse of `encodeIdbValue`. Untagged JSON passes through unchanged. */
export function decodeIdbValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeIdbValue);
  const obj = value as Record<string, unknown>;
  const tag = obj[TAG];
  if (typeof tag === 'string' && 'v' in obj && Object.keys(obj).length === 2) {
    const v = obj.v;
    switch (tag) {
      case 'undefined':
        return undefined;
      case 'Number':
        return Number(v);
      case 'BigInt':
        return BigInt(String(v));
      case 'Date':
        return new Date(String(v));
      case 'Blob': {
        const b = v as { type?: string; data?: string };
        return new Blob([base64ToBytes(String(b.data ?? '')) as BlobPart], { type: b.type ?? '' });
      }
      case 'ArrayBuffer':
        return base64ToBytes(String(v)).buffer;
      case 'Map':
        return new Map(
          (Array.isArray(v) ? v : []).map((pair) => {
            const [k, val] = pair as [unknown, unknown];
            return [decodeIdbValue(k), decodeIdbValue(val)] as [unknown, unknown];
          }),
        );
      case 'Set':
        return new Set((Array.isArray(v) ? v : []).map(decodeIdbValue));
      default: {
        const Ctor = TYPED_ARRAYS[tag];
        if (Ctor) {
          const bytes = base64ToBytes(String(v));
          return new Ctor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
      }
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decodeIdbValue(v);
  return out;
}
