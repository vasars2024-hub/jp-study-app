/**
 * The message for a failed "import this web page as a book" (the Library's URL
 * import and Wikipedia game, the novel reader's link import).
 *
 * The fetch's reason is English text from main or fetch itself (F3), so it is
 * classified into a `ReaderArticleError` code and shown through Immersion's
 * code → message table (`readerErrorMessage`). Two codes read differently here:
 * Immersion's "no article" and "failed" lines point at its Live mode, which an
 * import has no use for, so those two come from the novel reader's lazy pack.
 */
import { readerArticleErrorOf } from './readabilityArticle';
import { immersionUiTextLoaded, readerErrorMessage } from './components/immersion/immersionUiStrings';
import { novelReaderUiTextLoaded } from './novelReaderUiStrings';

export async function articleImportErrorText(
  error: unknown,
  source: 'page' | 'wiki' = 'page',
): Promise<string> {
  const coded = readerArticleErrorOf(error);
  if (coded.code === 'no-article') return novelReaderUiTextLoaded('novelReaderUi.import.noArticle');
  if (coded.code === 'failed') {
    return novelReaderUiTextLoaded(source === 'wiki' ? 'novelReaderUi.import.wikiFailed' : 'novelReaderUi.import.failed');
  }
  const { key, vars } = readerErrorMessage(coded.code, coded.status);
  return immersionUiTextLoaded(key, vars);
}
