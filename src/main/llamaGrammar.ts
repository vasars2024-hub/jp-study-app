// JSON grammars for the local model: the constrained-decoding half of "structured output".
//
// A cloud provider has a JSON mode; the local 1.7B model had only a sentence at the end of the
// prompt (`LOCAL_JSON_TAIL`: "Respond with a single JSON object only…") and the hope that a small
// model would honour it. It often did not — prose first, a fence, a `<think>` block, a trailing
// comment — and every one of those was a parse failure the user saw as "the offline AI returned an
// unusable response". llama.cpp can instead restrict sampling to tokens a grammar allows, so the
// reply IS JSON from its first token. node-llama-cpp exposes that as `getGrammarFor('json')` and
// `createGrammarForJsonSchema(schema)`.
//
// This module turns the wire-safe `LlamaJsonGrammar` description into the native grammar object for
// one `Llama` backend. It runs wherever llama.cpp runs: the utility process (`llamaHostWorker.ts`)
// and, when there is no worker, main (`llamaHost.ts`'s in-process fallback).
//
// A grammar that cannot be built (a schema feature GBNF has no rule for) resolves to `null`, and
// the generation runs unconstrained. The callers keep `LOCAL_JSON_TAIL` in the prompt for exactly
// that case, and their parse still validates the result, so a missing grammar costs reliability,
// never correctness.

import type { Llama, LlamaGrammar } from 'node-llama-cpp';
import type { LlamaJsonGrammar } from '../shared/llamaHostProtocol';

/** Built grammars per backend. A disposed backend takes its entries with it. */
const built = new WeakMap<Llama, Map<string, Promise<LlamaGrammar | null>>>();
/** Distinct schemas worth keeping per backend; callers have a handful, so this only stops a leak. */
const MAX_GRAMMARS = 32;

export function llamaGrammarKey(spec: LlamaJsonGrammar): string {
  return spec.kind === 'json-schema' ? `schema:${JSON.stringify(spec.schema)}` : spec.kind;
}

async function build(llama: Llama, spec: LlamaJsonGrammar): Promise<LlamaGrammar | null> {
  try {
    if (spec.kind === 'json-schema') {
      // The schema is the caller's, checked by the library against what GBNF can express.
      return await llama.createGrammarForJsonSchema(spec.schema as never) as unknown as LlamaGrammar;
    }
    return await llama.getGrammarFor(spec.kind === 'json-array' ? 'json_arr' : 'json');
  } catch {
    return null;
  }
}

/**
 * The native grammar for `spec` on `llama`, built once and reused, or `null` when it cannot be
 * built. Never rejects: a grammar is an improvement to a generation, not a precondition for one.
 */
export function resolveLlamaGrammar(llama: Llama | undefined, spec: LlamaJsonGrammar | undefined): Promise<LlamaGrammar | null> {
  if (!llama || !spec) return Promise.resolve(null);
  let cache = built.get(llama);
  if (!cache) {
    cache = new Map();
    built.set(llama, cache);
  }
  const key = llamaGrammarKey(spec);
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= MAX_GRAMMARS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  const pending = build(llama, spec);
  cache.set(key, pending);
  // A failed build is not remembered: the next request tries again (a backend mid-load, say).
  void pending.then((grammar) => {
    if (!grammar && cache?.get(key) === pending) cache.delete(key);
  });
  return pending;
}

/** The backend a lease's model was loaded on: the only one its grammar may come from. */
export function llamaOf(model: unknown): Llama | undefined {
  try {
    return (model as { llama?: Llama } | null)?.llama ?? undefined;
  } catch {
    return undefined;
  }
}

/** Checks a description that crossed a process boundary. Anything else means "no grammar". */
export function sanitizeLlamaGrammar(value: unknown): LlamaJsonGrammar | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const spec = value as { kind?: unknown; schema?: unknown };
  if (spec.kind === 'json' || spec.kind === 'json-array') return { kind: spec.kind };
  if (spec.kind === 'json-schema' && spec.schema && typeof spec.schema === 'object' && !Array.isArray(spec.schema)) {
    return { kind: 'json-schema', schema: spec.schema as Record<string, unknown> };
  }
  return undefined;
}
