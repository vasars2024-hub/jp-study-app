export type AiProviderId = 'gemini-2.5-flash' | 'deepseek-v4-flash' | 'deepseek-v4-pro';

export type AiProviderKeyBucket = 'gemini' | 'deepseek';

export interface AiProviderDefinition {
  id: AiProviderId;
  label: string;
  description: string;
  keyBucket: AiProviderKeyBucket;
  keyUrl: string;
  docsUrl: string;
}

export const AI_PROVIDERS: readonly AiProviderDefinition[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Google Gemini 2.5 Flash',
    description: 'Fast structured JSON via Google Generative Language API.',
    keyBucket: 'gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/api-key',
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    description: 'Economical 1M-context model with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    description: 'Higher-quality DeepSeek V4 with JSON output mode.',
    keyBucket: 'deepseek',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
  },
];

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = 'gemini-2.5-flash';

export function providerById(id: string | undefined): AiProviderDefinition {
  return AI_PROVIDERS.find((provider) => provider.id === id) ?? AI_PROVIDERS[0];
}

export function providerKeyBucket(id: AiProviderId): AiProviderKeyBucket {
  return providerById(id).keyBucket;
}

export type AiApiKeysSet = Record<AiProviderKeyBucket, boolean>;

export function emptyApiKeysSet(): AiApiKeysSet {
  return { gemini: false, deepseek: false };
}
