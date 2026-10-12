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

/**
 * The JSON inside a reply: a fenced block's body, else the outermost object or
 * array, else the trimmed text unchanged.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/u);
  if (fence?.[1]?.trim()) return fence[1].trim();
  if (/^[[{]/u.test(trimmed)) return trimmed;
  const objStart = trimmed.indexOf('{');
  const objEnd = trimmed.lastIndexOf('}');
  const arrStart = trimmed.indexOf('[');
  const arrEnd = trimmed.lastIndexOf(']');
  const useObject = objStart >= 0 && objEnd > objStart && (arrStart < 0 || objStart < arrStart);
  if (useObject) return trimmed.slice(objStart, objEnd + 1);
  if (arrStart >= 0 && arrEnd > arrStart) return trimmed.slice(arrStart, arrEnd + 1);
  return trimmed;
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
