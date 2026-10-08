/**
 * The renderer side of main's study bridges, as one installer.
 *
 * Main owns the extension server, the transcription queue and the Whisper
 * requests, but the deck, the clipboard history, word knowledge and the Whisper
 * model all live in a renderer. These listeners answer main on the renderer's
 * behalf. They used to be ~20 `useEffect`s inside Study OS's `App.tsx`, so they
 * ran only while a Study OS window was open: with Blanc as the only window, an
 * extension mine never reached the local deck, Blanc's "Queue transcription"
 * waited forever for a Whisper chunk nobody transcribed, and every extension
 * request (known words, level badge, clipboard list…) timed out.
 *
 * `App.tsx` installs this for its lifetime, exactly as before. Blanc installs it
 * only while no Study OS window is alive (blancBackgroundJobs.ts), so a mine is
 * never added to the deck twice.
 */
import { t as translateStatic } from './i18n';
import { addDeckCards, loadDeck, removeDeckCards } from './flashcardDeck';
import { recordClipboardEntry, loadClipboardHistory, type ClipboardEntryType } from './clipboardHistory';
import { getLevel, listKnownEntries, setLevel, type WkLevel } from './knownWords';
import { estimateLevelFromText } from './bookLevelEstimate';
import { getStudyLang } from './studyEnvironment';
import { studyLangOfText, type StudyLang } from '../shared/studyLang';
import { compactLevelBadge, resolvePageLevelLang } from '../shared/pageLevelDetect';
import { appendNotebookEvent } from './notebookTimeline';
import { appendTranslationHistory } from './translationHistory';
import { scoreTextComprehensibility, knownPercent } from './comprehensibility';
import { installRecorderMainBridge } from './recorder/recorderMainBridge';
import { noteStudyOsJobInstalled } from './studyOsJobsReady';
// `grammarMatch` is loaded on the first request: it carries the whole grammar
// data set (~2 MB built), which a Blanc-only session must not pay for at start.

/**
 * Reading and meaning for a single word the extension mined. The extension
 * sends only the selection, so without this its local card was a bare word
 * with an empty back. Offline dictionary only: mining must not wait on a
 * network lookup, and a miss simply leaves the fields empty as before.
 */
async function extensionWordGloss(term: string, lang: StudyLang): Promise<{ reading: string; meaning: string }> {
  try {
    if (typeof window.api?.lookupTermOffline !== 'function') return { reading: '', meaning: '' };
    // In the word's own language: unfiltered, a Chinese word was glossed from
    // whichever dictionary answered first, or from none.
    const result = await window.api.lookupTermOffline(term, lang);
    const entry = result?.entries?.find((e) => e.word === term) ?? result?.entries?.[0];
    if (!entry) return { reading: '', meaning: '' };
    const meaning = entry.senses
      .slice(0, 2)
      .map((sense) => sense.definitions.join('; '))
      .filter(Boolean)
      .join(' / ');
    return { reading: entry.reading && entry.reading !== entry.word ? entry.reading : '', meaning };
  } catch {
    return { reading: '', meaning: '' };
  }
}

/**
 * Extension mines this renderer has handled (or is handling) this session, by
 * main's `mineId`. Module-level so a re-install (StrictMode, remount) keeps it.
 */
const handledExtensionMines = new Map<string, 'running' | 'done'>();
const MAX_HANDLED_EXTENSION_MINES = 500;

function rememberExtensionMine(mineId: string, state: 'running' | 'done'): void {
  handledExtensionMines.delete(mineId);
  handledExtensionMines.set(mineId, state);
  while (handledExtensionMines.size > MAX_HANDLED_EXTENSION_MINES) {
    const oldest = handledExtensionMines.keys().next().value;
    if (oldest === undefined) break;
    handledExtensionMines.delete(oldest);
  }
}

/** Test hook. */
export function __resetHandledExtensionMinesForTests(): void {
  handledExtensionMines.clear();
}

/** Installs every bridge listener and returns one uninstall. */
export function installStudyRendererBridges(): () => void {
  const offs: Array<(() => void) | undefined | void> = [];

  // Chrome extension selection mining → local flashcard collection (Phase 9).
  //
  // Main already tried Anki (extensionServer.handleMine); this keeps the local
  // study copy through the same `mineToStudy` every in-app surface uses, so it
  // carries the page title/URL, the sentence and — for a single word, where the
  // extension sends only the selection — a reading and meaning from the local
  // dictionary. A card that could not reach Anki joins the pending queue.
  //
  // Main sends each mine to one host window and keeps it pending until acked;
  // a replay repeats its `mineId`, so one this window already saved is acked
  // again without adding a second card.
  offs.push(window.api.onExtensionMined((payload) => {
    const mineId = typeof payload.mineId === 'string' && payload.mineId ? payload.mineId : '';
    if (mineId) {
      const seen = handledExtensionMines.get(mineId);
      if (seen === 'done') {
        window.api.ackExtensionMined?.(mineId, { ok: true });
        return;
      }
      // Still saving: its ack follows when that finishes.
      if (seen === 'running') return;
      rememberExtensionMine(mineId, 'running');
    }
    void (async () => {
      const text = (payload.text || '').trim();
      const term =
        (payload.term || '').trim() ||
        text
          .split(/[\s。．！？!?]+/)
          .find((s) => s.trim().length > 0)
          ?.trim()
          .slice(0, 40) ||
        text.slice(0, 40);
      if (!term) return;
      const mode =
        payload.mode === 'word' || payload.mode === 'sentence'
          ? payload.mode
          : text.length > 40 || /[。．！？!?]/.test(text)
            ? 'sentence'
            : 'word';
      const folder =
        typeof payload.folder === 'string' && payload.folder.trim()
          ? payload.folder.trim().slice(0, 40)
          : 'Extension';
      let reading = (payload.reading || '').trim();
      let meaning = (payload.meaning || '').trim();
      // The page's language when the extension said it; else the text's own
      // script (Han alone follows the study language).
      const wordLang: StudyLang = payload.lang ?? studyLangOfText(`${term} ${payload.sentence ?? ''}`, getStudyLang());
      if (mode === 'word' && (!reading || !meaning)) {
        const found = await extensionWordGloss(term, wordLang);
        reading ||= found.reading;
        meaning ||= found.meaning;
      }
      const sentence = mode === 'sentence'
        ? (payload.sentence || text).slice(0, 2000)
        : payload.sentence?.trim() && payload.sentence.trim() !== term
          ? payload.sentence.trim().slice(0, 2000)
          : undefined;
      const { mineToStudy } = await import('./studyMining');
      await mineToStudy({
        word: term.slice(0, 80),
        reading,
        meaning,
        sentence,
        source: 'extension',
        // The page's language (from the extension), else its text; Han alone follows the study language.
        studyLang: payload.lang ?? studyLangOfText(`${term} ${sentence ?? ''}`, getStudyLang()),
        folder,
        sourceTitle: payload.title?.trim() || undefined,
        sourceUrl: payload.url?.trim() || undefined,
        audioDataUrl:
          typeof payload.audioDataUrl === 'string' && payload.audioDataUrl.startsWith('data:')
            ? payload.audioDataUrl
            : undefined,
        ankiResult: payload.anki,
        // Queued while Anki is down: replay this exact note (audio, deck, tags).
        ...(payload.ankiRequest ? { anki: payload.ankiRequest } : {}),
      });
      const isAudio = folder === 'audio' || !!payload.audioDataUrl;
      appendNotebookEvent({
        stream: isAudio ? 'audio' : folder.toLowerCase().includes('ocr') ? 'ocr' : 'extension',
        title: term.slice(0, 80),
        detail: sentence ? sentence.slice(0, 400) : undefined,
        folder: isAudio ? 'Audio' : folder.toLowerCase().includes('ocr') ? 'OCR' : 'Mined',
        origin: 'extension',
        href: 'flashcards',
      });
    })().then(
      () => {
        if (!mineId) return;
        rememberExtensionMine(mineId, 'done');
        window.api.ackExtensionMined?.(mineId, { ok: true });
      },
      (err: unknown) => {
        if (!mineId) return;
        // Not saved: a later replay of this mineId may try again.
        handledExtensionMines.delete(mineId);
        window.api.ackExtensionMined?.(mineId, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      },
    );
  }));

  // Extension audio → Whisper (installed model in renderer worker).
  offs.push(window.api.onExtensionTranscribeRequest(({ id, pcmBase64 }) => {
    void (async () => {
      const { decodePcmBase64, transcribePcm } = await import('./whisperTranscribePcm');
      try {
        const result = await transcribePcm(decodePcmBase64(pcmBase64));
        window.api.replyExtensionTranscribe(id, result.ok
          ? { ok: true, text: result.text ?? '' }
          // Not a component scope — the module-level `t` reads the live
          // language, so a deferred call still answers in the current one.
          : { ok: false, error: result.error ?? translateStatic('appShell.transcriptionFailed') });
      } catch (err) {
        window.api.replyExtensionTranscribe(id, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }));

  // Transcription queue → Whisper. The main process owns the queue but cannot
  // run the model, so it asks the renderer one chunk at a time.
  offs.push(window.api.onTranscriptionChunkRequest?.(({ id, pcmBase64, lang }) => {
    void (async () => {
      const { decodePcmBase64, transcribePcm } = await import('./whisperTranscribePcm');
      try {
        const result = await transcribePcm(decodePcmBase64(pcmBase64), lang);
        window.api.replyTranscriptionChunk({ id, ...result });
      } catch (err) {
        window.api.replyTranscriptionChunk({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }));

  // A completed Japanese transcript becomes one reversible local-deck batch.
  // Re-running transcription replaces that media/language batch instead of
  // silently duplicating every sentence.
  // Region Recorder: open a finished recording in this window's study player.
  offs.push(installRecorderMainBridge());

  offs.push(window.api.onTranscriptionCardsReady((payload) => {
    const previousIds = loadDeck()
      .filter((card) => card.studyActionId === payload.batchId)
      .map((card) => card.id);
    if (previousIds.length) removeDeckCards(previousIds);
    addDeckCards(payload.cards.map((card) => ({
      word: card.sentence,
      reading: '',
      meaning: card.translation,
      sentence: card.sentence,
      front: card.sentence,
      back: card.translation,
      source: 'media' as const,
      bookId: payload.mediaId,
      bookTitle: payload.title,
      folder: 'Media',
      audioPath: card.audioPath,
      sceneReference: card.timing === 'chunk-estimated'
        ? `≈ ${card.startSec.toFixed(2)}–${card.endSec.toFixed(2)} s`
        : `${card.startSec.toFixed(2)}–${card.endSec.toFixed(2)} s`,
      timingFidelity: card.timing,
      // Machine-read speech, not an authored subtitle line. A card that can be
      // wrong about what was said has to say where the text came from.
      textProvenance: 'transcript' as const,
      studyActionId: payload.batchId,
    })));
    appendNotebookEvent({
      stream: 'audio',
      title: payload.title,
      detail: `${payload.cards.length} transcript sentence cards`,
      folder: 'Media',
      origin: 'app',
      href: 'flashcards',
    });
  }));

  // Extension → app clipboard history
  offs.push(window.api.onExtensionClipboardAppend((payload) => {
    const text = (payload.text || '').trim();
    if (!text) return;
    const rawType = payload.type;
    const type: ClipboardEntryType =
      rawType === 'word' ||
      rawType === 'sentence' ||
      rawType === 'paragraph' ||
      rawType === 'dictionary' ||
      rawType === 'reader' ||
      rawType === 'manual' ||
      rawType === 'text'
        ? rawType
        : 'text';
    recordClipboardEntry(text, {
      type,
      readerMeta: payload.title || payload.url
        ? { book: payload.title || 'Web', chapter: payload.url }
        : undefined,
    });
  }));

  // Extension learning-tint: reply with known-word levels
  offs.push(window.api.onKnownLevelsRequest(({ id, terms }) => {
    const levels: Record<string, number> = {};
    for (const term of terms || []) {
      if (typeof term === 'string' && term) levels[term] = getLevel(term);
    }
    window.api.replyKnownLevels(id, levels);
  }));

  // Extension page word-status colouring: every known word and its level at once.
  offs.push(window.api.onKnownSnapshotRequest?.(({ id }) => {
    const words: Record<string, number> = {};
    try {
      for (const { word, level } of listKnownEntries()) words[word] = level;
    } catch {
      /* answer with what was read; main times out otherwise */
    }
    window.api.replyKnownSnapshot?.(id, { words, lang: getStudyLang() });
  }));

  // Extension /v1/annotate: page text → words with lemma, reading and known level.
  offs.push(window.api.onExtensionAnnotateRequest?.(({ id, texts, lang }) => {
    void (async () => {
      let results: unknown[] = [];
      try {
        const [{ annotateTexts }, tokenizer] = await Promise.all([
          import('./extensionAnnotate'),
          import('./tokenizer'),
        ]);
        if (lang === 'ja' && !tokenizer.tokenizerReady()) await tokenizer.getTokenizer();
        results = annotateTexts(Array.isArray(texts) ? texts : [], String(lang || getStudyLang()), {
          tokenizeJa: tokenizer.tokenizerReady() ? tokenizer.tokenizeSync : null,
          getLevel,
        });
      } catch {
        /* answer empty: the extension simply paints nothing for this batch */
      }
      window.api.replyExtensionAnnotate?.(id, results);
    })();
  }));

  offs.push(window.api.onKnownLevelSet(({ id, term, level }) => {
    try {
      const lv = ([0, 1, 2, 3].includes(level) ? level : 0) as WkLevel;
      setLevel(String(term || '').trim(), lv, true);
      window.api.replyKnownLevelSet(id, { ok: true });
    } catch (err) {
      window.api.replyKnownLevelSet(id, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }));

  offs.push(window.api.onComprehensibilityRequest(({ id, text }) => {
    void (async () => {
      try {
        const score = await scoreTextComprehensibility(text || '');
        window.api.replyComprehensibility(id, {
          ok: true,
          percent: knownPercent(score),
          known: score.knownWords,
          total: score.totalWords,
        });
      } catch (err) {
        window.api.replyComprehensibility(id, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }));

  offs.push(window.api.onGrammarMatchRequest(({ id, text }) => {
    void (async () => {
      try {
        const { matchGrammarPatterns } = await import('./grammarMatch');
        const matches = matchGrammarPatterns(text || '', 8);
        window.api.replyGrammarMatch(id, { ok: true, matches });
      } catch (err) {
        window.api.replyGrammarMatch(id, {
          ok: false,
          matches: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }));

  offs.push(window.api.onExtensionTranslationResult((payload) => {
    if (!payload?.sourceText || !payload?.resultText) return;
    appendTranslationHistory({
      sourceLang: payload.sourceLang || 'ja',
      targetLang: payload.targetLang || 'en',
      sourceText: payload.sourceText,
      resultText: payload.resultText,
      origin: 'extension',
    });
    appendNotebookEvent({
      stream: 'translations',
      title: payload.sourceText.slice(0, 80),
      detail: payload.resultText.slice(0, 120),
      folder: 'Translations',
      origin: 'extension',
      href: 'translate',
    });
  }));

  // Extension page-level badge: JLPT/HSK from Settings vocab bands (same as EPUB covers)
  offs.push(window.api.onLevelEstimateRequest(({ id, text }) => {
    void (async () => {
      try {
        const studyLang = getStudyLang();
        const lang = resolvePageLevelLang(text || '', studyLang);
        if (!lang) {
          window.api.replyLevelEstimate(id, {
            ok: true,
            badge: 'X',
            empty: true,
            lang: null,
            scheme: null,
          });
          return;
        }
        const estimate = await estimateLevelFromText(text || '', lang);
        if (!estimate) {
          window.api.replyLevelEstimate(id, {
            ok: true,
            badge: '—',
            noLists: true,
            lang,
            scheme: lang === 'zh' ? 'hsk' : 'jlpt',
          });
          return;
        }
        const badge = compactLevelBadge(estimate.label);
        window.api.replyLevelEstimate(id, {
          ok: true,
          badge: badge || '—',
          lang,
          scheme: estimate.scheme,
          label: estimate.label,
          confidence: estimate.confidence,
        });
      } catch (err) {
        window.api.replyLevelEstimate(id, {
          ok: false,
          badge: '—',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }));

  // Extension clipboard history list
  offs.push(window.api.onClipboardListRequest(({ id }) => {
    const entries = loadClipboardHistory()
      .slice(0, 40)
      .map((e) => ({
        id: e.id,
        type: e.type,
        text: e.text.slice(0, 500),
        createdAt: e.createdAt,
      }));
    window.api.replyClipboardList(id, entries);
  }));

  // Every listener is attached: main may now replay mines that arrived while
  // no window (or a still-loading one) could take them. Main replays only to
  // its host window, so a pop-out saying this is harmless.
  window.api.extensionBridgeReady?.();
  // Study OS acks Blanc only once this is in place (studyOsJobsReady.ts).
  offs.push(noteStudyOsJobInstalled('bridges'));

  return () => {
    for (const off of offs) {
      try {
        if (typeof off === 'function') off();
      } catch {
        /* one listener failing to detach must not keep the rest attached */
      }
    }
  };
}
