import { describe, expect, it } from 'vitest';
import {
  buildBrowserCaptureTarget,
  buildDocumentCaptureTarget,
  buildMangaCaptureTarget,
  buildVideoCaptureTarget,
  buildVisualNovelCaptureTarget,
  formatCaptureTimecode,
  LENS_CAPTURE_TARGET_MAX_AGE_MS,
  LENS_CAPTURE_TARGET_WORKFLOWS,
  normalizeLensCaptureTarget,
  parseLensCaptureTarget,
} from '../lensCaptureTarget';
import { normalizeReadingLensCapture } from '../readingLens';

const fields = {
  visualNovelId: ' vn-1 ',
  title: '  Steins;Gate ',
  routeId: ' route-a ',
  chapter: ' Chapter 2 ',
  scene: ' Lab ',
};

describe('lens capture target', () => {
  it('derives the contract provenance fields from the workflow context', () => {
    const target = buildVisualNovelCaptureTarget(fields, 50_000);
    expect(target).toEqual({
      workflow: 'visual-novel',
      sourceLabel: 'Steins;Gate · Chapter 2 · Lab',
      sourceRef: 'vn:vn-1?route=route-a&chapter=Chapter%202&scene=Lab',
      createdAt: 50_000,
      visualNovel: {
        visualNovelId: 'vn-1',
        title: 'Steins;Gate',
        routeId: 'route-a',
        chapter: 'Chapter 2',
        scene: 'Lab',
      },
    });
  });

  it('omits the context a workflow has not recorded', () => {
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: 'vn-2', title: 'Clannad', routeId: '', chapter: '', scene: '' },
      1,
    );
    expect(target.sourceLabel).toBe('Clannad');
    expect(target.sourceRef).toBe('vn:vn-2');
  });

  it('re-derives provenance on read rather than trusting what was stored', () => {
    const now = 1_000_000_000;
    const target = normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      sourceLabel: 'A title that was never this one',
      sourceRef: 'vn:some-other-novel',
      createdAt: now,
      visualNovel: { visualNovelId: 'vn-1', title: 'Steins;Gate', routeId: '', chapter: '', scene: '' },
    }, now);
    expect(target?.sourceLabel).toBe('Steins;Gate');
    expect(target?.sourceRef).toBe('vn:vn-1');
  });

  it('rejects malformed, unknown-workflow, expired, and implausibly future targets', () => {
    const now = 1_000_000_000;
    const visualNovel = { visualNovelId: 'vn-1', title: 'Title', routeId: '', chapter: '', scene: '' };
    expect(parseLensCaptureTarget('{', now)).toBeNull();
    expect(parseLensCaptureTarget(null, now)).toBeNull();
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now, visualNovel }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({ workflow: 'visual-novel', createdAt: now }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now,
      visualNovel: { ...visualNovel, title: '' },
    }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now - LENS_CAPTURE_TARGET_MAX_AGE_MS - 1,
      visualNovel,
    }, now)).toBeNull();
    expect(normalizeLensCaptureTarget({
      workflow: 'visual-novel',
      createdAt: now + 60_001,
      visualNovel,
    }, now)).toBeNull();
  });

  it('round-trips through storage', () => {
    const now = 2_000_000;
    const target = buildVisualNovelCaptureTarget(fields, now);
    expect(parseLensCaptureTarget(JSON.stringify(target), now)).toEqual(target);
  });

  it('keeps a Japanese ref inside the capture contract budget, escapes intact', () => {
    const long = '長'.repeat(240);
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: long, title: long, routeId: long, chapter: long, scene: long },
      1,
    );
    expect(target.sourceRef.length).toBeLessThanOrEqual(1_000);
    expect(target.sourceLabel.length).toBeLessThanOrEqual(240);
    // A ref sliced mid-escape would throw here instead of decoding.
    expect(() => decodeURIComponent(target.sourceRef.slice(3))).not.toThrow();
  });

  it('survives the capture normalizer that stores it, unchanged', () => {
    const target = buildVisualNovelCaptureTarget(
      { visualNovelId: 'vn-1', title: 'シュタインズ・ゲート', routeId: 'r', chapter: '第二章', scene: '' },
      1,
    );
    const capture = normalizeReadingLensCapture({
      source: 'screen',
      sourceLabel: target.sourceLabel,
      sourceRef: target.sourceRef,
      text: 'テスト',
      lines: [],
    });
    expect(capture?.sourceLabel).toBe(target.sourceLabel);
    expect(capture?.sourceRef).toBe(target.sourceRef);
  });
});

describe('lens capture target: manga', () => {
  const mangaFields = {
    mangaId: ' manga-1 ',
    title: '  よつばと！ ',
    chapter: ' 12 ',
    page: ' 47 ',
  };

  it('is a declared workflow beside the visual novel, not a loose string', () => {
    // Track 5 bullet 7 names five workflows; this list is the count.
    expect([...LENS_CAPTURE_TARGET_WORKFLOWS]).toEqual([
      'visual-novel', 'manga', 'video', 'document', 'browser',
    ]);
  });

  it('derives the contract provenance fields from the page the reader is on', () => {
    const target = buildMangaCaptureTarget(mangaFields, 50_000);
    expect(target).toEqual({
      workflow: 'manga',
      sourceLabel: 'よつばと！ · Ch. 12 · p. 47',
      sourceRef: 'manga:manga-1?chapter=12&page=47',
      createdAt: 50_000,
      manga: { mangaId: 'manga-1', title: 'よつばと！', chapter: '12', page: '47' },
    });
  });

  it('omits a chapter a plain import does not have, and keeps the page', () => {
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-2', title: 'Yotsuba', chapter: '', page: '3' },
      1,
    );
    expect(target.sourceLabel).toBe('Yotsuba · p. 3');
    expect(target.sourceRef).toBe('manga:manga-2?page=3');
  });

  it('re-derives provenance on read rather than trusting what was stored', () => {
    const now = 1_000_000_000;
    const target = normalizeLensCaptureTarget({
      workflow: 'manga',
      sourceLabel: 'A book that was never this one',
      sourceRef: 'manga:some-other-book?page=999',
      createdAt: now,
      manga: { mangaId: 'manga-1', title: 'Yotsuba', chapter: '', page: '47' },
    }, now);
    expect(target?.sourceLabel).toBe('Yotsuba · p. 47');
    expect(target?.sourceRef).toBe('manga:manga-1?page=47');
  });

  it('refuses a manga target whose payload cannot address a book', () => {
    const now = 1_000_000_000;
    const manga = { mangaId: 'manga-1', title: 'Yotsuba', chapter: '', page: '1' };
    // No payload at all, and the payload under the *other* workflow's key.
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now }, now)).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, visualNovel: manga },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, manga: { ...manga, title: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now, manga: { ...manga, mangaId: '' } },
      now,
    )).toBeNull();
    // The same expiry the novel is held to.
    expect(normalizeLensCaptureTarget(
      { workflow: 'manga', createdAt: now - LENS_CAPTURE_TARGET_MAX_AGE_MS - 1, manga },
      now,
    )).toBeNull();
    // Control: the same shape inside the window resolves, so the refusals above
    // are the named rules and not a dead manga branch.
    expect(normalizeLensCaptureTarget({ workflow: 'manga', createdAt: now, manga }, now))
      .not.toBeNull();
  });

  it('keeps a page with no number addressable, which an unpaginated view produces', () => {
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-3', title: 'Untitled', chapter: '', page: '' },
      1,
    );
    expect(target.sourceLabel).toBe('Untitled');
    expect(target.sourceRef).toBe('manga:manga-3');
    expect(parseLensCaptureTarget(JSON.stringify(target), 1)).toEqual(target);
  });

  it('keeps a Japanese ref inside the capture contract budget, escapes intact', () => {
    const long = '巻'.repeat(240);
    const target = buildMangaCaptureTarget(
      { mangaId: long, title: long, chapter: long, page: long },
      1,
    );
    expect(target.sourceRef.length).toBeLessThanOrEqual(1_000);
    expect(target.sourceLabel.length).toBeLessThanOrEqual(240);
    expect(() => decodeURIComponent(target.sourceRef.slice('manga:'.length))).not.toThrow();
  });

  it('survives the capture normalizer that stores it — label NFKC-folded, ref intact', () => {
    // TRAP for whoever adds the next workflow: `normalizeReadingLensCapture`
    // runs every string through `NFKC` (`readingLens.ts:129`), so a full-width
    // `！` in a title is stored as `!`. That is pre-existing and applies to the
    // visual-novel label too — its own test simply uses a title with no
    // full-width punctuation. The *ref* is percent-encoded and therefore ASCII,
    // so it round-trips byte-for-byte and stays the addressable half.
    const target = buildMangaCaptureTarget(
      { mangaId: 'manga-1', title: 'よつばと！', chapter: '第12話', page: '47' },
      1,
    );
    const capture = normalizeReadingLensCapture({
      source: 'screen',
      sourceLabel: target.sourceLabel,
      sourceRef: target.sourceRef,
      text: 'テスト',
      lines: [],
    });
    expect(capture?.sourceLabel).toBe(target.sourceLabel.normalize('NFKC'));
    expect(capture?.sourceLabel).toBe('よつばと! · Ch. 第12話 · p. 47');
    expect(capture?.sourceRef).toBe(target.sourceRef);
    expect(decodeURIComponent(capture!.sourceRef.slice('manga:'.length)))
      .toBe('manga-1?chapter=第12話&page=47');
  });
});

describe('lens capture target — video', () => {
  const videoFields = {
    mediaId: ' 21519 ',
    title: ' 君の名は。 ',
    episode: ' 3 ',
    positionSec: ' 3725 ',
  };

  it('carries the position, because the same episode is a different frame a second later', () => {
    const target = buildVideoCaptureTarget(videoFields, 50_000);
    expect(target).toEqual({
      workflow: 'video',
      sourceLabel: '君の名は。 · Ep. 3 · 1:02:05',
      sourceRef: 'video:21519?episode=3&t=3725',
      createdAt: 50_000,
      video: { mediaId: '21519', title: '君の名は。', episode: '3', positionSec: '3725' },
    });
  });

  it('formats a position the way a player shows it, and refuses one that is not a place', () => {
    expect(formatCaptureTimecode('0')).toBe('0:00');
    expect(formatCaptureTimecode('9')).toBe('0:09');
    expect(formatCaptureTimecode('61')).toBe('1:01');
    expect(formatCaptureTimecode('3599')).toBe('59:59');
    expect(formatCaptureTimecode('3600')).toBe('1:00:00');
    expect(formatCaptureTimecode('')).toBe('');
    // A fractional or negative position is floored / dropped before it is ever
    // formatted, so the ref never carries `t=NaN` or `t=-4`.
    expect(buildVideoCaptureTarget({ ...videoFields, positionSec: '12.75' }, 1).sourceRef)
      .toBe('video:21519?episode=3&t=12');
    expect(buildVideoCaptureTarget({ ...videoFields, positionSec: '-4' }, 1).sourceRef)
      .toBe('video:21519?episode=3');
    expect(buildVideoCaptureTarget({ ...videoFields, positionSec: 'later' }, 1).sourceRef)
      .toBe('video:21519?episode=3');
  });

  it('keeps a loose file addressable by its title when the library never matched it', () => {
    const target = buildVideoCaptureTarget(
      { mediaId: '', title: 'raw-episode.mkv', episode: '', positionSec: '90' },
      1,
    );
    expect(target.sourceLabel).toBe('raw-episode.mkv · 1:30');
    expect(target.sourceRef).toBe('video:?t=90');
    expect(parseLensCaptureTarget(JSON.stringify(target), 1)).toEqual(target);
  });

  it('re-derives provenance on read, and refuses a video that names nothing', () => {
    const now = 1_000_000_000;
    const video = { mediaId: '21519', title: '君の名は。', episode: '3', positionSec: '3725' };
    expect(normalizeLensCaptureTarget({
      workflow: 'video',
      sourceLabel: 'A film this capture never came from',
      sourceRef: 'video:9999?t=1',
      createdAt: now,
      video,
    }, now)?.sourceRef).toBe('video:21519?episode=3&t=3725');
    expect(normalizeLensCaptureTarget({ workflow: 'video', createdAt: now }, now)).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'video', createdAt: now, video: { ...video, title: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'video', createdAt: now - LENS_CAPTURE_TARGET_MAX_AGE_MS - 1, video },
      now,
    )).toBeNull();
    // Control: the same shape inside the window resolves.
    expect(normalizeLensCaptureTarget({ workflow: 'video', createdAt: now, video }, now))
      .not.toBeNull();
  });
});

describe('lens capture target — document', () => {
  const docFields = {
    documentId: ' novel-7 ',
    title: ' こころ ',
    format: 'pdf' as const,
    section: ' 上 先生と私 ',
    page: ' 12 ',
  };

  it('records which loader produced the text in the ref, not in the label', () => {
    const target = buildDocumentCaptureTarget(docFields, 50_000);
    expect(target).toEqual({
      workflow: 'document',
      sourceLabel: 'こころ · 上 先生と私 · p. 12',
      sourceRef: 'doc:novel-7?format=pdf&section=%E4%B8%8A%20%E5%85%88%E7%94%9F%E3%81%A8%E7%A7%81&page=12',
      createdAt: 50_000,
      document: {
        documentId: 'novel-7', title: 'こころ', format: 'pdf', section: '上 先生と私', page: '12',
      },
    });
    expect(target.sourceRef).toContain('format=pdf');
  });

  it('keeps an epub and a plain text file on the same contract', () => {
    expect(buildDocumentCaptureTarget({ ...docFields, format: 'epub' }, 1).sourceRef)
      .toContain('format=epub');
    const plain = buildDocumentCaptureTarget(
      { documentId: 'novel-8', title: 'Notes', format: 'text', section: '', page: '' },
      1,
    );
    expect(plain.sourceLabel).toBe('Notes');
    expect(plain.sourceRef).toBe('doc:novel-8?format=text');
  });

  it('refuses a format outside the three rather than folding it into a default', () => {
    const now = 1_000_000_000;
    const document = {
      documentId: 'novel-7', title: 'こころ', format: 'pdf', section: '', page: '12',
    };
    expect(normalizeLensCaptureTarget(
      { workflow: 'document', createdAt: now, document: { ...document, format: 'djvu' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'document', createdAt: now, document: { ...document, format: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'document', createdAt: now, document: { ...document, documentId: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget(
      { workflow: 'document', createdAt: now, document: { ...document, title: '' } },
      now,
    )).toBeNull();
    expect(normalizeLensCaptureTarget({ workflow: 'document', createdAt: now }, now)).toBeNull();
    // Control: the untouched shape resolves, so the four refusals above are the
    // named rules and not a dead branch.
    expect(normalizeLensCaptureTarget({ workflow: 'document', createdAt: now, document }, now)
      ?.sourceRef).toBe('doc:novel-7?format=pdf&page=12');
  });
});

describe('lens capture target — browser', () => {
  it('addresses the page by its URL and names the host beside the title', () => {
    const target = buildBrowserCaptureTarget(
      { url: 'https://www3.nhk.or.jp/news/html/20260820/k100.html', title: 'ニュース' },
      50_000,
    );
    expect(target.workflow).toBe('browser');
    expect(target.sourceLabel).toBe('ニュース · www3.nhk.or.jp');
    expect(decodeURIComponent(target.sourceRef.slice('web:'.length)))
      .toBe('https://www3.nhk.or.jp/news/html/20260820/k100.html');
  });

  it('refuses every scheme that is not http(s)', () => {
    const now = 1_000_000_000;
    for (const url of [
      'file:///C:/Users/Arseniy/secret.txt',
      'about:blank',
      'data:text/html,<p>x</p>',
      'javascript:alert(1)',
      'not a url at all',
      '',
    ]) {
      expect(buildBrowserCaptureTarget({ url, title: 'x' }, now).sourceRef).toBe('');
      expect(normalizeLensCaptureTarget(
        { workflow: 'browser', createdAt: now, browser: { url, title: 'x' } },
        now,
      )).toBeNull();
    }
    // Control: an http URL through the identical path resolves.
    expect(normalizeLensCaptureTarget(
      { workflow: 'browser', createdAt: now, browser: { url: 'http://example.com/a', title: 'x' } },
      now,
    )?.sourceRef).toBe('web:http%3A%2F%2Fexample.com%2Fa');
  });

  it('drops embedded credentials, which are a secret the page does not need', () => {
    const target = buildBrowserCaptureTarget(
      { url: 'https://user:s3cret@example.com/read?page=2', title: 'Read' },
      1,
    );
    expect(target.browser.url).toBe('https://example.com/read?page=2');
    expect(target.sourceRef).not.toContain('s3cret');
    expect(target.sourceLabel).toBe('Read · example.com');
  });

  it('survives the capture normalizer that stores it', () => {
    const target = buildBrowserCaptureTarget(
      { url: 'https://example.com/読む', title: 'ページ' },
      1,
    );
    const capture = normalizeReadingLensCapture({
      source: 'screen',
      sourceLabel: target.sourceLabel,
      sourceRef: target.sourceRef,
      text: 'テスト',
      lines: [],
    });
    expect(capture?.sourceRef).toBe(target.sourceRef);
    expect(capture?.sourceLabel).toBe('ページ · example.com');
  });
});
