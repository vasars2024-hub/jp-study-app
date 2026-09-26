/**
 * Web Worker: study-language word profiles off the UI thread.
 *
 * The Library scores each book from a text sample. Tokenizing that sample
 * (kuromoji for Japanese, ICU segmentation for Chinese and Russian) is the
 * expensive step, and on the UI thread it blanked the Library for 30-50 s on a
 * 200-book shelf. Here it runs beside the page; only the compact profile
 * (distinct content words + counts, `shared/studyWordProfile.ts`) comes back.
 *
 * The knowledge lookups stay in the page: they read the learner's store, which
 * lives in the page's localStorage.
 */
import { getTokenizer, tokenizeSync } from '../tokenizer';
import {
  buildStudyWordProfile,
  segmentedProfileTokens,
  type StudyWordProfile,
} from '../../shared/studyWordProfile';
import type { StudyLang } from '../../shared/studyLang';

export interface StudyWordsRequest {
  id: number;
  text: string;
  lang: StudyLang;
}

export type StudyWordsReply =
  | { id: number; ok: true; profile: StudyWordProfile }
  | { id: number; ok: false; error: string };

async function profileOf(text: string, lang: StudyLang): Promise<StudyWordProfile> {
  if (lang !== 'ja') return buildStudyWordProfile(segmentedProfileTokens(text, lang), lang);
  await getTokenizer();
  return buildStudyWordProfile(tokenizeSync(text), lang);
}

self.onmessage = (e: MessageEvent<StudyWordsRequest>) => {
  const { id, text, lang } = e.data;
  profileOf(text, lang).then(
    (profile) => (self as unknown as Worker).postMessage({ id, ok: true, profile } satisfies StudyWordsReply),
    (error: unknown) => (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies StudyWordsReply),
  );
};
