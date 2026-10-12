// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  IMM5_READING_LIST_MAX,
  IMM5_SNAPSHOT_MAX_CHARS,
  imm5AddReadingItem,
  imm5ApplySiteDay,
  imm5DayRows,
  imm5HtmlText,
  imm5IPlusOneSentences,
  imm5MarkReadingItem,
  imm5NewWordsMet,
  imm5ParseHistoryQuery,
  imm5PruneSiteDays,
  imm5RecentDayKeys,
  imm5SanitizeReadingList,
  imm5SanitizeSiteDayLog,
  imm5SearchHistory,
  imm5SearchReadingList,
  imm5SentenceRanges,
  imm5SiteRows,
  imm5SortedReadingList,
  imm5ExportReadingList,
  imm5ForgetSnapshot,
  imm5MergeReadingLists,
  imm5PageCoverage,
  imm5ParseReadingListImport,
  imm5SnapshotHash,
  imm5TruncateSnapshot,
  imm5VerifySnapshot,
  IMM5_EXPORT_KIND,
} from '../immersionStudy5';

const NOW = new Date(2026, 9, 9, 15, 0, 0).getTime();
const TODAY = '2026-10-09';
const YESTERDAY = '2026-10-08';

describe('per-site, per-day stats', () => {
  it('adds deltas per host per day without touching the input', () => {
    const empty = {};
    const one = imm5ApplySiteDay(empty, TODAY, 'nhk.or.jp', { seconds: 60, lookups: 2 });
    const two = imm5ApplySiteDay(one, TODAY, 'nhk.or.jp', { seconds: 30, mined: 1, newWords: 4 });
    expect(empty).toEqual({});
    expect(two[TODAY]['nhk.or.jp']).toEqual({ seconds: 90, lookups: 2, mined: 1, newWords: 4 });
  });

  it('ignores a bad day key, an empty host and negative deltas', () => {
    expect(imm5ApplySiteDay({}, '2026/10/09', 'a.jp', { seconds: 5 })).toEqual({});
    expect(imm5ApplySiteDay({}, TODAY, '  ', { seconds: 5 })).toEqual({});
    expect(imm5ApplySiteDay({}, TODAY, 'a.jp', { seconds: -5 })[TODAY]['a.jp'].seconds).toBe(0);
  });

  it('sums the range per site, most time first, and counts active days', () => {
    let log = imm5ApplySiteDay({}, TODAY, 'a.jp', { seconds: 100, lookups: 1 });
    log = imm5ApplySiteDay(log, YESTERDAY, 'a.jp', { seconds: 50 });
    log = imm5ApplySiteDay(log, TODAY, 'b.jp', { seconds: 400, newWords: 3 });
    log = imm5ApplySiteDay(log, '2026-09-01', 'c.jp', { seconds: 999 });
    const rows = imm5SiteRows(log, NOW, 7);
    expect(rows.map((r) => r.host)).toEqual(['b.jp', 'a.jp']);
    expect(rows[1]).toMatchObject({ seconds: 150, lookups: 1, activeDays: 2 });
    expect(imm5SiteRows(log, NOW, 1).map((r) => r.host)).toEqual(['b.jp', 'a.jp']);
  });

  it('per-day rows fill gaps with zeros, oldest first, optionally for one host', () => {
    let log = imm5ApplySiteDay({}, TODAY, 'a.jp', { seconds: 10 });
    log = imm5ApplySiteDay(log, TODAY, 'b.jp', { seconds: 5 });
    const rows = imm5DayRows(log, NOW, 3);
    expect(rows.map((r) => r.day)).toEqual(['2026-10-07', YESTERDAY, TODAY]);
    expect(rows[2].seconds).toBe(15);
    expect(imm5DayRows(log, NOW, 3, 'b.jp')[2].seconds).toBe(5);
    expect(imm5RecentDayKeys(NOW, 1)).toEqual([TODAY]);
  });

  it('prunes old days and sanitizes stored junk', () => {
    const log = imm5ApplySiteDay(imm5ApplySiteDay({}, '2025-01-01', 'old.jp', { seconds: 1 }), TODAY, 'a.jp', { seconds: 1 });
    expect(Object.keys(imm5PruneSiteDays(log, NOW))).toEqual([TODAY]);
    expect(imm5SanitizeSiteDayLog({ [TODAY]: { 'a.jp': { seconds: '5', lookups: -1 } }, bad: {} })).toEqual({
      [TODAY]: { 'a.jp': { seconds: 5, lookups: 0, mined: 0, newWords: 0 } },
    });
    expect(imm5SanitizeSiteDayLog(null)).toEqual({});
  });
});

describe('new words met', () => {
  const levels: Record<string, number> = { 猫: 0, 犬: 3, 鳥: 0 };
  const levelOf = (w: string) => levels[w] ?? 1;

  it('counts level-0 words once per day', () => {
    const first = imm5NewWordsMet(['猫', '犬', '猫', '鳥', '魚'], levelOf, null, TODAY);
    expect(first.fresh).toEqual(['猫', '鳥']);
    const again = imm5NewWordsMet(['猫', '鳥'], levelOf, first.met, TODAY);
    expect(again.fresh).toEqual([]);
    const tomorrow = imm5NewWordsMet(['猫'], levelOf, again.met, '2026-10-10');
    expect(tomorrow.fresh).toEqual(['猫']);
  });
});

describe('reading list', () => {
  it('saves with an excerpt and snapshot size, re-saving moves to top and clears read', () => {
    const a = imm5AddReadingItem([], { url: 'https://a.jp/1', title: 'A', snapshotHtml: '<p>本文<b>です</b></p>' }, 1);
    expect(a.item).toMatchObject({ host: 'a.jp', excerpt: '本文 です', snapshotChars: 5 });
    const b = imm5AddReadingItem(a.list, { url: 'https://b.jp/1', title: 'B' }, 2);
    const read = imm5MarkReadingItem(b.list, a.item.id, true, 3);
    expect(imm5SortedReadingList(read).map((i) => i.title)).toEqual(['B', 'A']);
    const again = imm5AddReadingItem(read, { url: 'https://a.jp/1', title: 'A2' }, 4);
    expect(again.list[0]).toMatchObject({ title: 'A2', excerpt: '本文 です', snapshotChars: 5 });
    expect(again.list[0].readAt).toBeUndefined();
    expect(again.list).toHaveLength(2);
    expect(imm5MarkReadingItem(read, a.item.id, false, 5).find((i) => i.id === a.item.id)?.readAt).toBeUndefined();
  });

  it('truncates huge snapshots and caps the list', () => {
    const big = imm5AddReadingItem([], { url: 'https://a.jp/', title: 'x', snapshotHtml: 'あ'.repeat(IMM5_SNAPSHOT_MAX_CHARS + 50) }, 1);
    expect(big.snapshotHtml).toHaveLength(IMM5_SNAPSHOT_MAX_CHARS);
    let list = big.list;
    for (let i = 0; i < IMM5_READING_LIST_MAX + 5; i++) list = imm5AddReadingItem(list, { url: `https://a.jp/${i}`, title: `${i}` }, i).list;
    expect(list).toHaveLength(IMM5_READING_LIST_MAX);
  });

  it('sanitizes stored rows: non-web URLs and duplicates out', () => {
    const rows = imm5SanitizeReadingList([
      { url: 'https://a.jp/1', title: 'A', savedAt: 1 },
      { url: 'https://a.jp/1', title: 'dup' },
      { url: 'javascript:alert(1)', title: 'x' },
      'junk',
    ]);
    expect(rows.map((r) => r.title)).toEqual(['A']);
  });

  it('strips ruby text and tags for plain text', () => {
    expect(imm5HtmlText('<ruby>漢字<rt>かんじ</rt></ruby>&amp;<script>x()</script>')).toBe('漢字 &');
  });

  it('searches title, URL and excerpt with site: filters', () => {
    let list = imm5AddReadingItem([], { url: 'https://www3.nhk.or.jp/news/1', title: '天気', snapshotHtml: '<p>台風が来る</p>' }, 1).list;
    list = imm5AddReadingItem(list, { url: 'https://example.jp/2', title: '料理' }, 2).list;
    expect(imm5SearchReadingList(list, '台風').map((i) => i.title)).toEqual(['天気']);
    expect(imm5SearchReadingList(list, 'site:nhk.or.jp').map((i) => i.title)).toEqual(['天気']);
    expect(imm5SearchReadingList(list, '')).toHaveLength(2);
  });
});

describe('history search', () => {
  const sites = [
    { url: 'https://www3.nhk.or.jp/news/a', title: 'ニュース 天気', tags: [], lastVisited: 10, visitCount: 1 },
    { url: 'https://tenki.jp/forecast', title: '予報', tags: ['天気'], lastVisited: 20, visitCount: 1 },
    { url: 'https://example.com/tenki', title: 'Weather', tags: [], lastVisited: 30, visitCount: 5 },
  ];

  it('parses site: filters and quoted phrases', () => {
    expect(imm5ParseHistoryQuery('site:www.NHK.or.jp "a b" c')).toEqual({ hosts: ['nhk.or.jp'], terms: ['a b', 'c'] });
  });

  it('requires every term, ranks title over tags over URL, then recency', () => {
    expect(imm5SearchHistory(sites, '天気').map((s) => s.title)).toEqual(['ニュース 天気', '予報']);
    expect(imm5SearchHistory(sites, 'tenki').map((s) => s.title)).toEqual(['Weather', '予報']);
    expect(imm5SearchHistory(sites, '天気 ニュース').map((s) => s.title)).toEqual(['ニュース 天気']);
    expect(imm5SearchHistory(sites, 'site:nhk.or.jp').map((s) => s.title)).toEqual(['ニュース 天気']);
    expect(imm5SearchHistory(sites, '  ')).toHaveLength(3);
  });

  it('folds width and case (NFKC)', () => {
    expect(imm5SearchHistory(sites, 'ＷＥＡＴＨＥＲ').map((s) => s.title)).toEqual(['Weather']);
  });
});

describe('i+1 sentences', () => {
  const split = (text: string) => imm5SentenceRanges(text).map((r) => text.slice(r.start, r.end));

  it('keeps a quotation and its quotative particle in one sentence', () => {
    // 「行こう。」と言った。 is ONE sentence; splitting at 。」 made と言った a one-word "sentence".
    expect(split('「行こう。」と言った。本当？ はい')).toEqual(['「行こう。」と言った。', '本当？', 'はい']);
    expect(split('彼は「もう遅い。帰ろう。」って笑った。')).toEqual(['彼は「もう遅い。帰ろう。」って笑った。']);
  });

  it('splits back-to-back dialogue lines and narration after a closed quotation', () => {
    expect(split('「おはよう。」「おはよう！」彼女は笑った。')).toEqual(['「おはよう。」', '「おはよう！」', '彼女は笑った。']);
    expect(split('『終わり？』……そうだ。')).toEqual(['『終わり？』', '……そうだ。']);
  });

  it('ends a sentence at a line break and keeps decimals and URLs whole', () => {
    expect(split('雨が降る\n風が吹く。')).toEqual(['雨が降る', '風が吹く。']);
    expect(split('値は3.5です。example.jp を見て。')).toEqual(['値は3.5です。', 'example.jp を見て。']);
  });

  it('does not let an unclosed bracket swallow the rest of the text', () => {
    const long = `「${'あ'.repeat(200)}。次の文。`;
    expect(split(long).length).toBeGreaterThan(1);
  });

  it('treats an ellipsis as a pause unless the text breaks after it', () => {
    expect(split('えっと…それは違う。待って……')).toEqual(['えっと…それは違う。', '待って……']);
  });

  it('finds sentences with exactly one unknown word and at least three words', () => {
    // 私は猫が好き。犬と鳥。
    const text = '私は猫が好き。犬と鳥。';
    const words = [
      { start: 0, end: 1, level: 3 },
      { start: 2, end: 3, level: 0 },
      { start: 4, end: 6, level: 3 },
      { start: 7, end: 8, level: 0 },
      { start: 9, end: 10, level: 0 },
    ];
    expect(imm5IPlusOneSentences(text, words)).toEqual([{ start: 0, end: 7, word: { start: 2, end: 3 } }]);
    // A proper noun is never the unknown.
    expect(imm5IPlusOneSentences(text, words.map((w, i) => (i === 1 ? { ...w, proper: true } : w)))).toEqual([]);
  });
});

describe('offline copies: integrity', () => {
  it('stores a checksum with the copy and reports a damaged or missing one', () => {
    const html = '<p>本文です。</p>';
    const { item, snapshotHtml } = imm5AddReadingItem([], { url: 'https://a.jp/1', title: 'A', snapshotHtml: html }, 1);
    expect(item.snapshotHash).toBe(imm5SnapshotHash(html));
    expect(imm5VerifySnapshot(item, snapshotHtml)).toBe('ok');
    expect(imm5VerifySnapshot(item, html.slice(0, -3))).toBe('damaged');
    expect(imm5VerifySnapshot(item, null)).toBe('missing');
    // Items saved before checksums pass on presence alone.
    expect(imm5VerifySnapshot({}, html)).toBe('ok');
  });

  it('never cuts a snapshot inside a tag or an entity', () => {
    const html = `<p>${'あ'.repeat(20)}</p><a href="https://x.jp">リンク</a>&amp;`;
    const cut = imm5TruncateSnapshot(html, 30);
    expect(cut).toBe(`<p>${'あ'.repeat(20)}</p>`);
    expect(imm5TruncateSnapshot('abc&amp;def', 6)).toBe('abc');
    expect(imm5TruncateSnapshot(html, 1000)).toBe(html);
  });

  it('forgets a copy that turned out missing', () => {
    const { list, item } = imm5AddReadingItem([], { url: 'https://a.jp/1', title: 'A', snapshotHtml: '<p>本文</p>' }, 1);
    const next = imm5ForgetSnapshot(list, item.id)[0];
    expect(next.snapshotChars).toBe(0);
    expect(next.snapshotHash).toBeUndefined();
  });

  it('keeps a valid checksum through sanitize and drops a malformed one', () => {
    const rows = imm5SanitizeReadingList([
      { url: 'https://a.jp/1', title: 'A', snapshotChars: 3, snapshotHash: 'a.b1c' },
      { url: 'https://a.jp/2', title: 'B', snapshotChars: 3, snapshotHash: '<script>' },
    ]);
    expect(rows[0].snapshotHash).toBe('a.b1c');
    expect(rows[1].snapshotHash).toBeUndefined();
  });
});

describe('reading list export / import', () => {
  const html = '<p>猫が好きです。</p>';
  const saved = imm5AddReadingItem([], { url: 'https://nhk.or.jp/a', title: 'ニュース', snapshotHtml: html }, 10);
  const two = imm5AddReadingItem(saved.list, { url: 'https://note.com/b', title: 'ブログ' }, 20);

  it('round-trips the list and the offline copies that verify', () => {
    const json = imm5ExportReadingList(two.list, { [saved.item.id]: html, bogus: '<p>x</p>' }, 99);
    const doc = JSON.parse(json);
    expect(doc.kind).toBe(IMM5_EXPORT_KIND);
    expect(Object.keys(doc.snapshots)).toEqual([saved.item.id]);
    const back = imm5ParseReadingListImport(json, 100);
    expect(back?.items.map((i) => i.url)).toEqual(['https://note.com/b', 'https://nhk.or.jp/a']);
    expect(back?.snapshots[saved.item.id]).toBe(html);
  });

  it('drops a tampered copy and the claim that went with it', () => {
    const json = imm5ExportReadingList(saved.list, { [saved.item.id]: html }, 1).replace(/猫が好き/g, '犬が好き');
    const back = imm5ParseReadingListImport(json, 2);
    expect(back?.snapshots).toEqual({});
    expect(back?.items[0].snapshotChars).toBe(0);
  });

  it('reads bookmark / Pocket HTML and plain URL lists, web URLs only', () => {
    const pocket = '<ul><li><a href="https://a.jp/x?y=1&amp;z=2" time_added="1700000000">記事 &amp; <b>A</b></a></li><li><a href="javascript:void(0)">bad</a></li></ul>';
    const fromHtml = imm5ParseReadingListImport(pocket, 5);
    expect(fromHtml?.items).toHaveLength(1);
    expect(fromHtml?.items[0]).toMatchObject({ url: 'https://a.jp/x?y=1&z=2', title: '記事 & A', savedAt: 1_700_000_000_000 });
    const csv = 'URL,Title\nhttps://b.jp/1,タイトル\nnot a url\nhttps://c.jp/2';
    const fromText = imm5ParseReadingListImport(csv, 5);
    expect(fromText?.items.map((i) => [i.url, i.title])).toEqual([['https://b.jp/1', 'タイトル'], ['https://c.jp/2', 'https://c.jp/2']]);
    expect(imm5ParseReadingListImport('nothing here', 5)).toBeNull();
    expect(imm5ParseReadingListImport('{broken', 5)).toBeNull();
  });

  it('merges without duplicating: an existing article takes a missing copy and a read mark', () => {
    const bare = imm5AddReadingItem([], { url: 'https://nhk.or.jp/a', title: '自分の題' }, 50).list;
    const incoming = imm5ParseReadingListImport(imm5ExportReadingList(imm5MarkReadingItem(two.list, saved.item.id, true, 60), { [saved.item.id]: html }, 1), 70);
    const merged = imm5MergeReadingLists(bare, incoming?.items ?? [], incoming?.snapshots ?? {});
    expect(merged.added).toBe(1);
    expect(merged.updated).toBe(1);
    expect(merged.snapshotIds).toEqual([saved.item.id]);
    const mine = merged.list.find((i) => i.url === 'https://nhk.or.jp/a');
    expect(mine).toMatchObject({ title: '自分の題', readAt: 60, snapshotChars: saved.item.snapshotChars });
    expect(merged.list).toHaveLength(2);
  });
});

describe('per-page coverage', () => {
  it('counts content tokens, skips names, and lists distinct unknowns', () => {
    const c = imm5PageCoverage([
      { lemma: '猫', level: 3 },
      { lemma: '猫', level: 3 },
      { lemma: '犬', level: 0 },
      { lemma: '犬', level: 0 },
      { lemma: '東京', level: 0, proper: true },
      { lemma: '鳥', level: 1 },
    ]);
    expect(c).toEqual({ tokens: 5, known: 2, knownPct: 40, unknownUnique: 2 });
    expect(imm5PageCoverage([]).knownPct).toBeNull();
  });
});