/**
 * Structured-output validation for cloud and local model replies.
 *
 * Every AI feature used to hand-validate its own JSON, and most did it with a
 * bare `JSON.parse`, so a reply wrapped in a ```json fence threw and a reply
 * with the wrong shape crashed later, somewhere less obvious. This is the one
 * place a reply becomes typed data:
 *
 * 1. fences and leading prose are stripped (models add them whatever the prompt says);
 * 2. the text is parsed;
 * 3. a zod schema validates the shape, and its error names the first bad path.
 *
 * A failure is an `AiProviderRuntimeError('invalid-response')`, the code every
 * surface already maps to "the provider returned an unusable response".
 *
 * Main-only on purpose: zod stays out of the renderer boot graphs.
 */
import type { ZodType, ZodTypeDef } from 'zod';
import { AiProviderRuntimeError } from './providerRuntime';
import { extractJsonReply } from '../shared/jsonReply';

/**
 * The JSON inside a reply: the first object or array in it that parses, fenced
 * or not (`shared/jsonReply.ts`). It used to look for a ``` fence before a
 * leading `{`, which cut a reply whose STRING held a fence down to that string's
 * middle (bug 13).
 */
export function stripJsonFences(text: string): string {
  return extractJsonReply(text);
}

/** Parses a reply as JSON, tolerating fences and surrounding prose. */
export function parseAiReplyJson(text: string, context: string): unknown {
  try {
    return JSON.parse(stripJsonFences(text)) as unknown;
  } catch {
    throw new AiProviderRuntimeError(
      `${context} returned invalid JSON. Try fewer items or switch provider.`,
      'invalid-response',
    );
  }
}

/** Parses AND validates a reply. The error names the first path that did not match. */
export function parseAiReplyWith<T>(
  text: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
  context: string,
): T {
  const value = parseAiReplyJson(text, context);
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? issue.path.join('.') : '(root)';
  throw new AiProviderRuntimeError(
    `${context} returned JSON that does not match the expected shape at ${where}.`,
    'invalid-response',
  );
}
