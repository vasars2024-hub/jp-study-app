// @vitest-environment jsdom
/**
 * F3: a failed web-page import (Library URL import, Wikipedia game, the novel
 * reader's link import) and a failed Jiten call show a translated, coded line,
 * never main's or fetch's English reason.
 */
import { describe, expect, it } from 'vitest';
import { articleImportErrorText } from '../articleImportError';
import { jitenErrorText } from '../components/novels/NovelsContent';
import { ReaderArticleError } from '../readabilityArticle';
import { NOVEL_READER_UI_EN } from '../../shared/i18n/novelReaderUi/en';
import { IMMERSION_UI_EN } from '../../shared/i18n/immersionUi/en';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

describe('articleImportErrorText', () => {
  it('maps fetch reasons through the Immersion code table', async () => {
    expect(await articleImportErrorText(new Error('took too long'))).toBe(IMMERSION_UI_EN['immersionUi.error.timeout']);
    expect(await articleImportErrorText(new ReaderArticleError('404 Not Found', 'http', 404))).toContain('404');
    expect(await articleImportErrorText(new Error('net::ERR_NAME_NOT_RESOLVED'))).toBe(
      IMMERSION_UI_EN['immersionUi.error.network'],
    );
  });

  it('uses the reader pack for "no article" and unclassified failures (no Live mode here)', async () => {
    expect(await articleImportErrorText(new Error('No readable article found on that page.'))).toBe(
      NOVEL_READER_UI_EN['novelReaderUi.import.noArticle'],
    );
    expect(await articleImportErrorText(new Error('something odd'))).toBe(NOVEL_READER_UI_EN['novelReaderUi.import.failed']);
    expect(await articleImportErrorText(new Error('Wikipedia returned no article.'), 'wiki')).toBe(
      NOVEL_READER_UI_EN['novelReaderUi.import.wikiFailed'],
    );
  });
});

describe('jitenErrorText', () => {
  it("codes main's Jiten reasons", () => {
    expect(jitenErrorText(new Error("Error invoking remote method 'jiten:search': Error: Jiten 503: Service Unavailable"), t)).toBe(
      'novelReaderUi.novels.jitenHttp:{"status":"503"}',
    );
    expect(jitenErrorText(new Error('Could not reach jiten.moe (network error). Check your internet connection and try again.'), t)).toBe(
      'novelReaderUi.novels.jitenNetwork',
    );
    expect(jitenErrorText('weird', t)).toBe('novelReaderUi.novels.jitenFailed');
  });
});
