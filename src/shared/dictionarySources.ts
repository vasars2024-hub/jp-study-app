export interface DictionarySourceInfo {
  id: string;
  title: string;
  kind: string;
  sourceLang: string;
  licence: string;
  attribution: string;
  entryCount: number;
  enabled: boolean;
  priority: number;
}

export interface DictionarySourceMutationResult {
  ok: boolean;
  error?: 'not-found' | 'edge';
  sources: DictionarySourceInfo[];
}
