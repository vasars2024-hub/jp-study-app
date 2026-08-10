export type AiProviderId = 'gemini-2.5-flash' | 'deepseek-v4-flash' | 'deepseek-v4-pro';

export type AiProviderKeyBucket = 'gemini' | 'deepseek';

export interface AiProviderDefinition {
  id: AiProviderId;
  label: string;
  description: string;
  keyBucket: AiProviderKeyBucket;
  keyUrl: string;
  docsUrl: string;
  /**
   * Whether the provider's request format carries image input at all.
   *
   * This is a property of the wire format, not a preference: Gemini's
   * `generateContent` takes `inlineData` parts alongside the text part, and the
   * DeepSeek chat-completions body this app sends has a `content` string per
   * message with nowhere to put an image. The local `local-qwen` backend is a
   * text-only 1.7B model and is not in this table at all.
   *
   * A `false` here must produce a refusal rather than a silent drop. An image
   * attachment that vanished on the way to the provider would leave the model
   * answering about a screenshot it never saw, which is exactly the shape of
   * false success Track 3 forbids.
   */
  acceptsImageInput: boolean;
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Google Gemini 2.5 Flash',
    description: 'Fast structured JSON via Google Generative Language API.',
    keyBucket: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
    acceptsImageInput: true,
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    description: 'Economical 1M-context model with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    acceptsImageInput: false,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    description: 'Higher-quality DeepSeek V4 with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    acceptsImageInput: false,
  },
];

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = 'gemini-2.5-flash';

export function providerById(id: string | undefined): AiProviderDefinition {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

export function providerKeyBucket(id: AiProviderId): AiProviderKeyBucket {
  return providerById(id).keyBucket;
}

/**
 * Whether this provider can be sent an image.
 *
 * Deliberately NOT written as `providerById(id).acceptsImageInput`.
 * `providerById` falls back to `AI_PROVIDERS[0]` — Gemini — for an unknown id,
 * which is the right default when you need a label or a key bucket and the
 * wrong one here: an unrecognised provider would inherit Gemini's `true` and be
 * handed a screenshot it cannot read. A capability check has to fail closed.
 */
export function providerAcceptsImageInput(id: string | undefined): boolean {
  return AI_PROVIDERS.some((provider) => provider.id === id && provider.acceptsImageInput);
}

export type AiApiKeysSet = Record<AiProviderKeyBucket, boolean>;

export function emptyApiKeysSet(): AiApiKeysSet {
  return { gemini: false, deepseek: false };
}
