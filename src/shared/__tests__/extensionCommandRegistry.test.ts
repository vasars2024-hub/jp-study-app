/*
 * extension/shared.js — the parts nothing else reaches.
 *
 * Two existing tests already load this file in a vm: extensionCaptureParity
 * (host lists + one sample URL per list) and analysisPanelRender (the whole AI
 * annotation panel, via jsdom). What neither touches is the layer every surface
 * of the extension actually runs through — the command registry that the wheel,
 * the context menu, the toolbar popup and the keyboard shortcuts all resolve
 * ids against, the save/capture result strings the user reads after every
 * action, and the language/sentence heuristics shared with the desktop app.
 *
 * The registry in particular is load-bearing in a way that is invisible: a
 * command id that stops resolving does not throw at load time, it throws
 * "Unknown command" the first time a user presses that wheel position.
 */
import { describe, expect, it } from 'vitest';
import { loadExtensionSandbox, type JpStudySharedModule } from './extensionHarness';
import { detectSentenceBounds as tsDetectSentenceBounds, sentenceAt as tsSentenceAt } from '../sentenceBounds';
import { detectMineLanguage } from '../profileRules';

const shared: JpStudySharedModule = loadExtensionSandbox({ files: ['shared.js'] }).jpStudyShared;

describe('command registry — internal coherence', () => {
  it('gives every command a unique, namespaced id', () => {
    const ids = shared.COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
  });

  it('gives every command the metadata the surfaces read', () => {
    for (const cmd of shared.COMMANDS) {
      expect(cmd.label, cmd.id).toBeTruthy();
      expect(cmd.shortLabel, cmd.id).toBeTruthy();
      expect(cmd.description, cmd.id).toBeTruthy();
      expect(cmd.contexts.length, cmd.id).toBeGreaterThan(0);
      expect(typeof cmd.wheel, cmd.id).toBe('boolean');
      expect(typeof cmd.contextMenu, cmd.id).toBe('boolean');
    }
  });

  it('resolves a current id to itself', () => {
    for (const cmd of shared.COMMANDS) expect(shared.resolveCommandId(cmd.id)).toBe(cmd.id);
  });

  it('resolves every legacy alias onto a command that still exists', () => {
    for (const [oldId, newId] of Object.entries(shared.COMMAND_ALIASES)) {
      expect({ oldId, resolved: shared.resolveCommandId(oldId) }).toEqual({ oldId, resolved: newId });
      expect(shared.getCommand(oldId)?.id).toBe(newId);
    }
  });

  it('never lets an alias shadow a real command id', () => {
    for (const oldId of Object.keys(shared.COMMAND_ALIASES)) {
      expect(shared.COMMANDS.some((c) => c.id === oldId)).toBe(false);
    }
  });

  it('keeps every "Mine"-era id pointing at the Save model the README describes', () => {
    expect(shared.resolveCommandId('mine')).toBe('save.word');
    expect(shared.resolveCommandId('mine-auto')).toBe('save.word');
    expect(shared.resolveCommandId('mine-word')).toBe('save.word');
    expect(shared.resolveCommandId('mine-sentence')).toBe('save.sentence');
    // 'save' meant *save the page* in v1, and must not be re-pointed at
    // save.word just because the word "Save" moved onto the mining verb.
    expect(shared.resolveCommandId('save')).toBe('capture.page');
  });

  it('returns null rather than guessing for anything unknown', () => {
    for (const junk of ['', '   ', 'nope', 'save.nothing', 'MINE']) {
      expect(shared.resolveCommandId(junk)).toBeNull();
      expect(shared.getCommand(junk)).toBeNull();
    }
    expect(shared.resolveCommandId(undefined as unknown as string)).toBeNull();
  });

  it('trims a stored id before resolving it', () => {
    expect(shared.resolveCommandId('  save.word  ')).toBe('save.word');
  });

  it('offers only wheel-flagged commands for a wheel slot', () => {
    const assignable = shared.wheelAssignableCommands();
    expect(assignable.length).toBeGreaterThan(0);
    for (const cmd of assignable) expect(cmd.wheel).toBe(true);
    for (const cmd of shared.COMMANDS) {
      expect(assignable.includes(cmd)).toBe(cmd.wheel);
    }
  });
});

describe('command registry — page-aware disabling', () => {
  it('allows an unrestricted command on any page', () => {
    for (const id of ['lookup.selection', 'save.word', 'capture.page', 'app.open']) {
      expect(shared.commandAvailableOnPage(id, 'article', 'news')).toBe(true);
      expect(shared.commandAvailableOnPage(id, 'youtube-video', 'youtube')).toBe(true);
    }
  });

  it('restricts Download video to YouTube pages', () => {
    expect(shared.commandAvailableOnPage('media.download', 'youtube-video', 'youtube')).toBe(true);
    expect(shared.commandAvailableOnPage('media.download', 'youtube-playlist', 'youtube')).toBe(true);
    expect(shared.commandAvailableOnPage('media.download', 'article', 'news')).toBe(false);
    expect(shared.commandAvailableOnPage('media.download', 'article', 'manga')).toBe(false);
  });

  it('restricts Import manga pages to manga pages, by category not by kind', () => {
    expect(shared.commandAvailableOnPage('capture.manga', 'article', 'manga')).toBe(true);
    expect(shared.commandAvailableOnPage('capture.manga', 'article', 'novel')).toBe(false);
    expect(shared.commandAvailableOnPage('capture.manga', 'youtube-video', 'youtube')).toBe(false);
  });

  it('applies the restriction through a legacy alias too', () => {
    expect(shared.commandAvailableOnPage('download', 'youtube-video', 'youtube')).toBe(true);
    expect(shared.commandAvailableOnPage('download', 'article', 'news')).toBe(false);
  });

  it('treats an unknown command as unavailable rather than throwing', () => {
    expect(shared.commandAvailableOnPage('ghost.command', 'article', 'news')).toBe(false);
  });
});

describe('page category — the manga host list does what it claims', () => {
  it('classifies every host in MANGA_HOST_SUFFIXES as manga', () => {
    for (const host of shared.MANGA_HOST_SUFFIXES) {
      expect({ host, category: shared.detectContentCategory(`https://${host}/`) }).toEqual({
        host,
        category: 'manga',
      });
    }
  });

  it('classifies every host in NOVEL_HOST_SUFFIXES as novel', () => {
    for (const host of shared.NOVEL_HOST_SUFFIXES) {
      expect({ host, category: shared.detectContentCategory(`https://${host}/`) }).toEqual({
        host,
        category: 'novel',
      });
    }
  });

  it('classifies every host in NEWS_HOST_SUFFIXES as news', () => {
    for (const host of shared.NEWS_HOST_SUFFIXES) {
      expect({ host, category: shared.detectContentCategory(`https://${host}/`) }).toEqual({
        host,
        category: 'news',
      });
    }
  });

  it('matches subdomains and strips www', () => {
    expect(shared.detectContentCategory('https://reader.mangadex.org/')).toBe('manga');
    expect(shared.detectContentCategory('https://www.mangadex.org/')).toBe('manga');
  });

  it('the host-suffix match itself rejects a lookalike host', () => {
    // hostMatchesSuffix is exact-or-dotted-suffix, so a host that merely
    // contains a listed one is not on the list. Probed with listed hosts that
    // carry no "manga"/"comic" substring, so only the suffix rule is in play.
    expect(shared.detectContentCategory('https://bato.to.evil.example/')).toBe('other');
    expect(shared.detectContentCategory('https://cmoa.jp.evil.example/')).toBe('other');
    expect(shared.detectContentCategory('https://notcmoa.jp/')).toBe('other');
  });

  it('KNOWN LOOSENESS: any host containing "manga" or "comic" classifies as manga', () => {
    // MANGA_TITLE_HINT is matched against `host + ' ' + title` with no word
    // boundary, so the substring alone is enough. Cheap and usually right on
    // real manga sites; the cost is a wrong OCR engine on a false positive.
    expect(shared.detectContentCategory('https://evilmangadex.org.example/')).toBe('manga');
    expect(shared.detectContentCategory('https://comicsanslovers.example/')).toBe('manga');
    expect(shared.detectContentCategory('https://example.com/', { title: 'Comic Sans considered harmful' }))
      .toBe('manga');
  });

  it('falls back to path and title hints for unlisted manga sites', () => {
    expect(shared.detectContentCategory('https://unknown.example/manga/123')).toBe('manga');
    expect(shared.detectContentCategory('https://unknown.example/viewer/9')).toBe('manga');
    expect(shared.detectContentCategory('https://unknown.example/', { title: '漫画' })).toBe('manga');
  });

  it('labels each category for the popup header', () => {
    expect(shared.contentCategoryLabel('news')).toBe('News');
    expect(shared.contentCategoryLabel('novel')).toBe('Web novel');
    expect(shared.contentCategoryLabel('manga')).toBe('Manga');
    expect(shared.contentCategoryLabel('youtube')).toBe('Video');
    expect(shared.contentCategoryLabel('article')).toBe('Article');
    expect(shared.contentCategoryLabel('anything-else')).toBe('Webpage');
  });
});

describe('YouTube detection drives the primary action', () => {
  it('reads a video id out of every URL shape YouTube serves', () => {
    expect(shared.parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(shared.parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(shared.parseYoutubeVideoId('https://www.youtube.com/shorts/abcdef12345')).toBe('abcdef12345');
    expect(shared.parseYoutubeVideoId('https://www.youtube.com/embed/abcdef12345')).toBe('abcdef12345');
    expect(shared.parseYoutubeVideoId('https://m.youtube.com/watch?v=abcdef12345')).toBe('abcdef12345');
    expect(shared.parseYoutubeVideoId('https://music.youtube.com/watch?v=abcdef12345')).toBe('abcdef12345');
    expect(shared.parseYoutubeVideoId('https://example.com/')).toBeNull();
  });

  it('KNOWN LOOSENESS: the regex fallback finds "v=" on any host', () => {
    // The host-checked parse falls through to a bare regex over the raw string
    // (so a pasted id-ish fragment still resolves). src/shared/extensionCapture.ts
    // does exactly the same thing, so this is shared intent rather than drift.
    expect(shared.parseYoutubeVideoId('https://example.com/watch?v=abcdef12345')).toBe('abcdef12345');
    // detectPageKind is the guard that keeps it from mattering: it checks the
    // host before it ever asks for an id.
    expect(shared.detectPageKind('https://example.com/watch?v=abcdef12345')).toBe('article');
  });

  it('reads a playlist id and prefers it on a playlist page', () => {
    expect(shared.parseYoutubePlaylistId('https://www.youtube.com/playlist?list=PL123abc')).toBe('PL123abc');
    expect(shared.detectPageKind('https://www.youtube.com/playlist?list=PL123abc')).toBe('youtube-playlist');
    // A video inside a playlist is still a video — Download video must win.
    expect(shared.detectPageKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123abc')).toBe(
      'youtube-video',
    );
    expect(shared.detectPageKind('https://www.youtube.com/playlist')).toBe('article');
  });

  it('maps page kind to the toolbar popup primary action', () => {
    expect(shared.primaryAction('youtube-playlist')).toBe('playlist');
    expect(shared.primaryAction('youtube-video')).toBe('video');
    expect(shared.primaryAction('article')).toBe('inbox');
    expect(shared.primaryAction('anything-else')).toBe('inbox');
  });

  it('treats a non-URL as an ordinary article rather than throwing', () => {
    expect(shared.detectPageKind('not a url')).toBe('article');
    expect(shared.detectPageKind('')).toBe('article');
    expect(shared.detectContentCategory('not a url')).toBe('other');
  });
});

describe('word vs sentence — what a selection is taken to be', () => {
  it('treats a bare term as a word', () => {
    expect(shared.classifyMineSelection('猫')).toBe('word');
    expect(shared.classifyMineSelection('食べられる')).toBe('word');
    expect(shared.classifyMineSelection('あ'.repeat(24))).toBe('word');
  });

  it('treats anything with sentence punctuation as a sentence', () => {
    expect(shared.classifyMineSelection('これはペンです。')).toBe('sentence');
    expect(shared.classifyMineSelection('元気ですか？')).toBe('sentence');
    expect(shared.classifyMineSelection('Wait!')).toBe('sentence');
  });

  it('DEAD BRANCH: the \\n in the punctuation class can never match', () => {
    // classifyMineSelection collapses /\s+/ to a single space before testing
    // /[。．！？!?\n]/, so by the time the test runs there are no newlines left.
    // A two-line selection is judged purely on its length.
    expect(shared.classifyMineSelection('two\nlines')).toBe('word');
    expect(shared.classifyMineSelection(`${'あ'.repeat(20)}\n${'い'.repeat(20)}`)).toBe('sentence');
  });

  it('treats a long unpunctuated run as a sentence', () => {
    expect(shared.classifyMineSelection('あ'.repeat(25))).toBe('sentence');
    expect(shared.classifyMineSelection('あ'.repeat(41))).toBe('sentence');
  });

  it('treats a four-word Latin phrase as a sentence', () => {
    expect(shared.classifyMineSelection('the quick brown fox')).toBe('sentence');
    expect(shared.classifyMineSelection('quick brown fox')).toBe('word');
  });

  it('falls back to word for nothing at all', () => {
    expect(shared.classifyMineSelection('')).toBe('word');
    expect(shared.classifyMineSelection('   ')).toBe('word');
    expect(shared.classifyMineSelection(undefined as unknown as string)).toBe('word');
  });
});

describe('save destination — the honest two-value model', () => {
  it('only ever chooses between Anki and the app', () => {
    expect(shared.savePrimaryDestination('both')).toBe('anki');
    expect(shared.savePrimaryDestination('app')).toBe('app');
    expect(shared.savePrimaryDestination('anything-else')).toBe('app');
  });

  it('lets Create card force Anki regardless of the setting', () => {
    expect(shared.savePrimaryDestination('app', true)).toBe('anki');
    expect(shared.savePrimaryDestination('both', true)).toBe('anki');
  });

  it('says what it is about to do before the request goes out', () => {
    expect(shared.saveWorkingMessage('both')).toBe('Creating card…');
    expect(shared.saveWorkingMessage('app')).toBe('Saving to GrammarX…');
    expect(shared.saveWorkingMessage('app', true)).toBe('Creating card…');
  });
});

describe('result messages — what the user is told after an action', () => {
  it('reports an Anki card with its profile and deck', () => {
    expect(
      shared.formatSaveResultMessage({
        ok: true,
        mode: 'word',
        term: '猫',
        anki: { ok: true },
        profileName: 'JP',
        deckName: 'Mining',
      }),
    ).toBe('Card created in Anki “猫” (JP / Mining) · saved in GrammarX');
  });

  it('reads the Anki result out of the nested destinations shape too', () => {
    expect(
      shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫', destinations: { anki: { ok: true } } }),
    ).toBe('Card created in Anki “猫” · saved in GrammarX');
  });

  it('distinguishes a saved word from a saved sentence', () => {
    expect(shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫' })).toBe(
      'Word saved “猫” to GrammarX',
    );
    expect(shared.formatSaveResultMessage({ ok: true, mode: 'sentence', term: '猫が好き' })).toBe(
      'Sentence saved “猫が好き” to GrammarX',
    );
  });

  it('surfaces an Anki failure only when Anki was actually attempted', () => {
    const anki = { ok: false, error: 'AnkiConnect refused' };
    expect(shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫', anki, forceAnki: true })).toBe(
      'Word saved “猫” to GrammarX · Anki unavailable: AnkiConnect refused',
    );
    expect(shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫', anki, preferAnki: true })).toBe(
      'Word saved “猫” to GrammarX · Anki unavailable: AnkiConnect refused',
    );
    // No intent to use Anki → no scary line about Anki.
    expect(shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫', anki })).toBe(
      'Word saved “猫” to GrammarX',
    );
    // An explicit ankiAttempted:false wins over the inference.
    expect(
      shared.formatSaveResultMessage({ ok: true, mode: 'word', term: '猫', anki, forceAnki: true, ankiAttempted: false }),
    ).toBe('Word saved “猫” to GrammarX');
  });

  it('stays quiet when Anki was deliberately skipped', () => {
    expect(
      shared.formatSaveResultMessage({
        ok: true,
        mode: 'word',
        term: '猫',
        forceAnki: true,
        anki: { ok: false, error: 'skipped' },
      }),
    ).toBe('Word saved “猫” to GrammarX');
  });

  it('promises a queued save will sync rather than claiming success', () => {
    expect(shared.formatSaveResultMessage({ queued: true, mode: 'word', term: '猫' })).toBe(
      'Queued “猫” — will sync when GrammarX is open',
    );
    expect(shared.formatCaptureResultMessage({ queued: true })).toBe(
      'Page queued — will sync when GrammarX is open',
    );
    expect(shared.formatClipboardResultMessage({ queued: true })).toBe(
      'Queued — will sync when GrammarX is open',
    );
  });

  it('truncates a runaway term instead of pasting a paragraph into a toast', () => {
    const msg = shared.formatSaveResultMessage({ ok: true, mode: 'sentence', term: 'あ'.repeat(200) });
    expect(msg).toContain('あ'.repeat(40));
    expect(msg).not.toContain('あ'.repeat(41));
  });

  it('prefers the server error over a generic failure line', () => {
    expect(shared.formatSaveResultMessage({ ok: false, error: 'Deck not found' })).toBe('Deck not found');
    expect(shared.formatSaveResultMessage({ ok: false })).toBe('Save failed');
    expect(shared.formatSaveResultMessage(null)).toBe('Save failed');
    expect(shared.formatCaptureResultMessage({ ok: false })).toBe('Could not save this page');
    expect(shared.formatCaptureResultMessage(null)).toBe('Could not save this page');
    expect(shared.formatClipboardResultMessage(null)).toBe('Could not add to clipboard history');
  });

  it('names the media it captured', () => {
    expect(shared.formatCaptureResultMessage({ ok: true, action: 'playlist' })).toBe(
      'Playlist saved to GrammarX',
    );
    expect(shared.formatCaptureResultMessage({ ok: true, action: 'video' })).toBe('Video saved to GrammarX');
    expect(shared.formatCaptureResultMessage({ ok: true, action: 'video', duplicate: true })).toBe(
      'Video is already in GrammarX',
    );
    expect(shared.formatCaptureResultMessage({ ok: true })).toBe('Page saved to your GrammarX inbox');
    expect(shared.formatClipboardResultMessage({ ok: true })).toBe('Added to GrammarX clipboard history');
  });
});

describe('OCR language hints', () => {
  it('maps the BCP-47 tags an HTML lang attribute actually carries', () => {
    expect(shared.langTagToOcrLang('ja')).toBe('ja');
    expect(shared.langTagToOcrLang('ja-JP')).toBe('ja');
    expect(shared.langTagToOcrLang('ja_JP')).toBe('ja');
    expect(shared.langTagToOcrLang('JA-jp')).toBe('ja');
    expect(shared.langTagToOcrLang('  ja-JP  ')).toBe('ja');
    expect(shared.langTagToOcrLang('zh-Hans')).toBe('zh');
    expect(shared.langTagToOcrLang('zh-TW')).toBe('zh');
    expect(shared.langTagToOcrLang('ru-RU')).toBe('ru');
    expect(shared.langTagToOcrLang('en-US')).toBe('');
    expect(shared.langTagToOcrLang('')).toBe('');
    expect(shared.langTagToOcrLang(null)).toBe('');
  });

  it('agrees with the app on script detection, modulo the empty/unknown name', () => {
    const samples = ['猫が好き', '我喜欢猫', 'Кошка', 'plain english', '', '漢字だけ', '汉字'];
    for (const text of samples) {
      const app = detectMineLanguage(text);
      const ext = shared.detectScriptLang(text);
      expect({ text, ext }).toEqual({ text, ext: app === 'unknown' ? '' : app });
    }
  });

  it('never lets the browser UI language override the script on the page', () => {
    // A Japanese page read in a Russian-locale browser must still OCR as ja.
    expect(
      shared.detectPageLangHint({ sampleText: '猫が好きです', navigatorLanguages: ['ru-RU', 'en-US'] }),
    ).toBe('ja');
    expect(shared.detectPageLangHint({ htmlLang: 'zh-CN', sampleText: '猫が好きです' })).toBe('zh');
    expect(shared.detectPageLangHint({ badgeLang: 'ru', htmlLang: 'ja', sampleText: '猫' })).toBe('ru');
  });

  it('falls back to the browser languages only when the page says nothing', () => {
    expect(shared.detectPageLangHint({ navigatorLanguages: ['en-US', 'ru-RU'] })).toBe('ru');
    expect(shared.detectPageLangHint({ navigatorLanguages: ['en-US'] })).toBe('');
    expect(shared.detectPageLangHint({})).toBe('');
    expect(shared.detectPageLangHint(null)).toBe('');
  });

  it('ignores a badge language it does not have a model for', () => {
    expect(shared.detectPageLangHint({ badgeLang: 'ko', htmlLang: 'ja' })).toBe('ja');
  });
});

describe('sentence bounds — the copy of src/shared/sentenceBounds.ts', () => {
  const CORPUS: Array<[string, number]> = [
    ['これはペンです。あれは本です。', 3],
    ['これはペンです。あれは本です。', 12],
    ['「元気ですか」と彼は言った。', 4],
    ['一行目\n二行目です。', 1],
    ['ended already。', 20],
    ['', 0],
    ['no punctuation at all', 5],
    ['ああ！！！うう。', 1],
  ];

  it('agrees with the desktop implementation on the sentence text', () => {
    for (const [text, offset] of CORPUS) {
      expect({ text, offset, out: shared.sentenceAt(text, offset) }).toEqual({
        text,
        offset,
        out: tsSentenceAt(text, offset),
      });
    }
  });

  it('agrees on the offsets whenever the sentence does not start on whitespace', () => {
    for (const [text, offset] of CORPUS) {
      expect({ text, offset, out: shared.detectSentenceBounds(text, offset) }).toEqual({
        text,
        offset,
        out: { ...tsDetectSentenceBounds(text, offset) },
      });
    }
  });

  it('clamps an out-of-range offset instead of throwing', () => {
    expect(shared.detectSentenceBounds('あいう。', -5)).toEqual({ start: 0, end: 4 });
    expect(shared.detectSentenceBounds('あいう。', 999)).toEqual({ start: 4, end: 4 });
  });

  /*
   * There were two known divergences from the desktop twin, pinned rather than
   * fixed because changing either changes what the extension mines on live
   * pages. The length cap was the one worth closing (2026-08-02) — it produced
   * a different card from the same selection depending on which side mined it.
   * The offset one below is invisible to the mined text and stays pinned.
   */
  it('DIVERGES: does not skip leading whitespace when reporting offsets', () => {
    const text = '  これはテスト。';
    expect(shared.detectSentenceBounds(text, 3).start).toBe(0);
    expect(tsDetectSentenceBounds(text, 3).start).toBe(2);
    // Harmless for the mined text itself, because sentenceAt trims.
    expect(shared.sentenceAt(text, 3)).toBe(tsSentenceAt(text, 3));
  });

  it('caps a mined sentence at 200 characters, the same as the desktop twin', () => {
    // Fixed 2026-08-02. The extension used to return the whole sentence, so a
    // wall-of-text page mined a 4,000-character "sentence" onto a card that the
    // app would have trimmed to 200 — two different cards from one selection
    // depending on which side did the mining.
    const long = 'あ'.repeat(250) + '。';
    expect(shared.sentenceAt(long, 10)).toHaveLength(200);
    expect(shared.sentenceAt(long, 10)).toBe(tsSentenceAt(long, 10));
    // The cap is a default, not a constant: both sides take the same override.
    expect(shared.sentenceAt(long, 10, 20)).toBe(tsSentenceAt(long, 10, 20));
    expect(shared.sentenceAt(long, 10, 20)).toHaveLength(20);
  });
});
