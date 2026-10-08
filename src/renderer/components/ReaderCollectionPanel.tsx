// Local Flashcard Collection inbox for the novel reader.
// List is primary. Compose opens only when a list row is clicked.
// Translation prefs are global for the collection until the user changes them.
// Anki deck target + per-card export status; selective export when auto is off.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import { scrollToReliably } from '../utils/reliableScroll';
import {
  loadDeck,
  onDeckChanged,
  removeDeckCard,
  updateDeckCard,
  type DeckFlashcard,
} from '../flashcardDeck';
import { translateTo, onModelProgress, type TransLang } from '../translator';
import { pushUndo } from '../actionHistory';
import type { VisualNovelStudyCardKind } from '../../shared/visualNovelStudyCards';
import { getLevel } from '../knownWords';
import Icon from './Icons';
import { getTranslateTarget, setTranslateTarget } from '../translateTarget';
import { normalizeStudyLang, studyLangOfText, type StudyLang } from '../../shared/studyLang';
import { cardContentLang, getStudyLang, studyContentLang } from '../studyEnvironment';
import { glossFor } from '../companionMine';
import { mineReaderCollectionCard } from '../studyMiningRoutes';

type SortMode = 'newest' | 'oldest' | 'word' | 'frequency';
type TargetLang = 'en' | 'ru' | 'zh';
type TxStatus = 'idle' | 'loading' | 'translating' | 'done' | 'error';

export interface CollectionAddPayload {
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  /**
   * The word came out of a dictionary lookup (the reader's popup "Mine"): fill a
   * missing reading and meaning from the dictionary before trying the offline
   * translator. Without it an offline machine saved the word as its own meaning
   * — a card whose answer was its question.
   */
  lookup?: boolean;
}

interface Props {
  bookId: string;
  bookTitle: string;
  open: boolean;
  onClose: () => void;
  pendingAdd?: CollectionAddPayload | null;
  onPendingConsumed?: () => void;
}

const PREFS_KEY = 'jp-reader-collection-prefs-v1';
const TARGETS: { id: TargetLang; label: string }[] = [
  { id: 'en', label: 'EN' },
  { id: 'ru', label: 'RU' },
  { id: 'zh', label: 'ZH' },
];
/** Module-level, so it holds i18n keys and the consumer resolves them (CLAUDE.md §7). */
const STUDY_KIND_KEYS: Record<VisualNovelStudyCardKind, string> = {
  vocabulary: 'readerCollection.kind.vocabulary',
  sentence: 'readerCollection.kind.sentence',
  kanji: 'readerCollection.kind.kanji',
  grammar: 'readerCollection.kind.grammar',
};

interface CollectionPrefs {
  targetLang: TargetLang;
  swapDefault: boolean;
  autoFlashcards: boolean;
  autoAnki: boolean;
  /** Empty string = use Anki profile default deck. */
  ankiDeck: string;
}

function loadPrefs(): CollectionPrefs {
  let targetLang: TargetLang = 'en';
  const t = getTranslateTarget();
  if (t === 'en' || t === 'ru' || t === 'zh') targetLang = t;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<CollectionPrefs>;
      if (p.targetLang === 'en' || p.targetLang === 'ru' || p.targetLang === 'zh') {
        targetLang = p.targetLang;
      }
      return {
        targetLang,
        swapDefault: !!p.swapDefault,
        autoFlashcards: p.autoFlashcards !== false,
        autoAnki: !!p.autoAnki,
        ankiDeck: typeof p.ankiDeck === 'string' ? p.ankiDeck : '',
      };
    }
  } catch {
    /* ignore */
  }
  return { targetLang, swapDefault: false, autoFlashcards: true, autoAnki: false, ankiDeck: '' };
}

function savePrefs(prefs: CollectionPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    setTranslateTarget(prefs.targetLang);
  } catch {
    /* ignore */
  }
}

/**
 * Undo for an Anki export: delete the note it created and mark the card unexported.
 *
 * Built at module scope on purpose. The undo stack (`actionHistory.ts`, 40 entries) outlives
 * this panel, and a closure created inside the component keeps that render's whole scope,
 * with the panel's DOM, alive for as long as the entry stays on the stack (the same retention
 * that pinned a whole unmounted desktop per book read, see `pushWindowReopenUndo` in
 * DesktopShell). The panel needs no `setCards` here: `updateDeckCard` announces the change
 * and the panel's `onDeckChanged` subscription re-reads the deck while it is mounted.
 */
function pushAnkiNoteUndo(term: string, noteId: number, cardId: string): void {
  pushUndo(
    `Anki note “${term.slice(0, 40)}”`,
    async () => {
      await window.api.ankiDeleteNotes([noteId]);
      updateDeckCard(cardId, {
        ankiExported: false,
        ankiNoteId: undefined,
        ankiExportError: undefined,
      });
    },
    'anki',
  );
}

interface EditDraft {
  id: string;
  front: string;
  back: string;
  reading: string;
  sentence: string;
  swapped: boolean;
}

export default function ReaderCollectionPanel({
  bookId,
  bookTitle,
  open,
  onClose,
  pendingAdd,
  onPendingConsumed,
}: Props) {
  const { t, lang } = useT();
  const [cards, setCards] = useState<DeckFlashcard[]>(() => loadDeck());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = useState<CollectionPrefs>(() => loadPrefs());
  const [statusMsg, setStatusMsg] = useState('');
  const [statusKind, setStatusKind] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [exportMsg, setExportMsg] = useState('');
  const [ankiDecks, setAnkiDecks] = useState<string[]>([]);
  const [ankiConnected, setAnkiConnected] = useState(false);

  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [editImageDataUrl, setEditImageDataUrl] = useState('');
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txMsg, setTxMsg] = useState('');
  const txReqRef = useRef(0);
  const offModelRef = useRef<(() => void) | null>(null);
  const addSeqRef = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => onDeckChanged(() => setCards(loadDeck())), []);

  // Load Anki deck list when panel opens.
  useEffect(() => {
    if (!open) return;
    let dead = false;
    void window.api.ankiStatus().then((s) => {
      if (dead) return;
      setAnkiConnected(!!s.connected);
      setAnkiDecks(Array.isArray(s.decks) ? s.decks : []);
    });
    return () => {
      dead = true;
    };
  }, [open]);

  const patchPrefs = useCallback((partial: Partial<CollectionPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      savePrefs(next);
      return next;
    });
  }, []);

  const runTranslate = useCallback(async (sourceText: string, lang: TargetLang, source: StudyLang = 'ja') => {
    const text = sourceText.trim();
    if (!text) {
      setTxStatus('idle');
      setTxMsg('');
      return '';
    }
    const id = ++txReqRef.current;
    setTxStatus('loading');
    setTxMsg(t('readerCollection.msg.loadingTranslator'));
    // Per-subscription, so a Translate view or a sentence popup loading the same model at the
    // same time keeps its own progress. This used to be one global slot.
    offModelRef.current?.();
    offModelRef.current = onModelProgress((p) => {
      if (id !== txReqRef.current) return;
      if (p.status === 'progress' && typeof p.progress === 'number') {
        setTxMsg(t('readerCollection.msg.loadingModelPct', { percent: Math.round(p.progress) }));
      }
    });
    try {
      // From the card's own language: a Chinese or Russian book was translated as Japanese.
      const result = await translateTo(text, source as TransLang, lang, (prog) => {
        if (id !== txReqRef.current) return;
        setTxStatus('translating');
        setTxMsg(t('readerCollection.msg.translatingPct', { percent: Math.round(prog * 100) }));
      });
      if (id !== txReqRef.current) return '';
      setTxStatus('done');
      setTxMsg('');
      return result.trim();
    } catch (e) {
      if (id !== txReqRef.current) return '';
      setTxStatus('error');
      setTxMsg(e instanceof Error ? e.message : String(e));
      return '';
    } finally {
      if (id === txReqRef.current) {
        offModelRef.current?.();
        offModelRef.current = null;
      }
    }
  }, []);

  /** Mine one card; persists export status on the deck card when id is known. */
  const sendToAnki = useCallback(
    async (
      c: {
        id?: string;
        word: string;
        reading?: string;
        meaning?: string;
        sentence?: string;
        imagePath?: string;
        audioPath?: string;
        audioDataUrl?: string;
        studyKind?: VisualNovelStudyCardKind;
        frequency?: number;
        jlptLevel?: string;
        sceneReference?: string;
        studyLang?: StudyLang;
      },
      deckOverride?: string,
    ): Promise<{ ok: boolean; noteId?: number; error?: string; deck?: string }> => {
      const deck = (deckOverride ?? prefsRef.current.ankiDeck).trim() || undefined;
      try {
        let imageBase64: string | undefined;
        let imageFilename: string | undefined;
        if (c.imagePath) {
          const image = await window.api.visualNovelReadCaptureImage(c.imagePath);
          const match = image.dataUrl?.match(/^data:image\/(jpeg|png);base64,(.+)$/);
          if (image.ok && match) {
            imageBase64 = match[2];
            imageFilename = `visual-novel-context.${match[1] === 'png' ? 'png' : 'jpg'}`;
          }
        }
        let audioBase64: string | undefined;
        let audioFilename: string | undefined;
        if (c.audioPath) {
          const audio = await window.api.visualNovelReadCaptureAudio(c.audioPath);
          const match = audio.dataUrl?.match(/^data:audio\/[^;]+;base64,(.+)$/);
          if (audio.ok && match) {
            audioBase64 = match[1];
            audioFilename = audio.filename;
          }
        } else if (c.audioDataUrl) {
          const match = c.audioDataUrl.match(/^data:audio\/[^;]+;base64,(.+)$/);
          if (match) {
            audioBase64 = match[1];
            audioFilename = 'reader-recording.webm';
          }
        }
        const res = await window.api.ankiMineNote({
          route: {
            source: 'reader',
            cardKind: c.studyKind
              ? (c.studyKind === 'sentence' ? 'sentence' : 'word')
              : (c.sentence ? 'sentence' : 'word'),
            language: normalizeStudyLang(c.studyLang),
          },
          term: c.word,
          reading: c.reading || undefined,
          meaning: c.meaning || undefined,
          sentence: c.sentence || undefined,
          imageBase64,
          imageFilename,
          audioBase64,
          audioFilename,
          deckName: deck,
          frequencies: c.frequency ? { 'Visual Novel': c.frequency } : undefined,
          extraTags: c.studyKind
            ? [
                'JapaneseStudyOS::VisualNovel',
                `JapaneseStudyOS::VisualNovel::${c.studyKind}`,
                ...(c.jlptLevel ? [`JLPT::${c.jlptLevel.toUpperCase()}`] : []),
              ]
            : undefined,
        });
        const ok = res.ok || res.error === 'duplicate';
        if (c.id) {
          if (ok) {
            updateDeckCard(c.id, {
              ankiExported: true,
              ankiExportedAt: Date.now(),
              ankiNoteId: res.noteId,
              ankiExportError: undefined,
              ankiDeck: deck,
            });
            // Undo can delete the note we just created (AnkiConnect deleteNotes).
            if (res.noteId && res.ok) pushAnkiNoteUndo(c.word, res.noteId, c.id);
          } else {
            updateDeckCard(c.id, {
              ankiExported: false,
              ankiExportError: res.error ?? t('readerCollection.msg.exportFailed'),
              ankiDeck: deck,
            });
          }
          setCards(loadDeck());
        }
        return { ok, noteId: res.noteId, error: res.error, deck };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        if (c.id) {
          updateDeckCard(c.id, {
            ankiExported: false,
            ankiExportError: error,
            ankiDeck: deck,
          });
          setCards(loadDeck());
        }
        return { ok: false, error, deck };
      }
    },
    [],
  );

  useEffect(() => {
    if (!pendingAdd?.word) return;
    const word = pendingAdd.word.trim();
    const sentence = (pendingAdd.sentence ?? '').trim();
    let reading = (pendingAdd.reading ?? '').trim();
    const seedMeaning = (pendingAdd.meaning ?? '').trim();
    const fromLookup = pendingAdd.lookup === true;
    onPendingConsumed?.();
    if (!word) return;

    const seq = ++addSeqRef.current;
    const { targetLang, swapDefault, autoFlashcards, autoAnki, ankiDeck } = prefsRef.current;
    // The book's language, read off the text itself — a zh or ru book is not Japanese.
    const sourceLang = studyLangOfText(`${word} ${sentence}`, getStudyLang());

    void (async () => {
      setStatusKind('busy');
      setStatusMsg(seedMeaning ? t('readerCollection.msg.saving') : t('readerCollection.translating'));

      let meaning = seedMeaning;
      if (fromLookup && (!reading || !meaning)) {
        const found = await glossFor(word, sourceLang);
        if (seq !== addSeqRef.current) return;
        reading = reading || found.reading;
        meaning = meaning || found.meaning;
      }
      if (!meaning || meaning === word) {
        const tx = await runTranslate(word, targetLang, sourceLang);
        if (seq !== addSeqRef.current) return;
        if (tx) meaning = tx;
      }

      let front = word;
      // No meaning found (the offline dictionary still building, no translator
      // model): leave the answer empty — Flashcards says "No meaning saved" —
      // rather than saving the word as its own answer.
      let back = meaning === word ? '' : meaning;
      if (swapDefault && back) {
        front = meaning;
        back = word;
      }

      const sentenceVal =
        sentence && sentence !== word ? sentence : sentence || undefined;

      // One write through mineToStudy: the local card (found again, not doubled,
      // when the same word is mined twice) and, with auto-Anki on, the note.
      const saveToDeck = autoFlashcards || !autoAnki;
      let card: DeckFlashcard | undefined;
      let ankiOk = false;
      let ankiFail = false;
      try {
        const mined = await mineReaderCollectionCard({
          front,
          back,
          reading,
          sentence: sentenceVal,
          bookId,
          bookTitle,
          studyLang: sourceLang,
          sendToAnki: autoAnki,
          ankiDeck: ankiDeck || undefined,
        });
        card = mined.card;
        if (autoAnki) {
          ankiOk = mined.anki === 'added' || mined.anki === 'duplicate';
          ankiFail = !ankiOk;
          const noteId = mined.ankiResult?.ok ? mined.ankiResult.noteId : undefined;
          // Undo can delete the note we just created (AnkiConnect deleteNotes).
          if (noteId) pushAnkiNoteUndo(front, noteId, mined.card.id);
        }
      } catch {
        ankiFail = autoAnki;
      }
      setCards(loadDeck());

      if (seq !== addSeqRef.current) return;
      setStatusKind(ankiFail ? 'error' : 'ok');
      const parts: string[] = [];
      if (saveToDeck) parts.push(autoFlashcards ? t('readerCollection.flashcards') : t('readerCollection.title'));
      // The deck name is the user's own data; only the stem is translated.
      if (autoAnki) parts.push(ankiOk ? `${t('readerCollection.anki')}${ankiDeck ? ` (${ankiDeck})` : ''}` : t('readerCollection.msg.ankiFailed'));
      setStatusMsg(
        parts.length
          ? t('readerCollection.msg.savedTo', { targets: parts.join(' · ') })
          : t('readerCollection.msg.saved'),
      );
      if (card) {
        const cardId = card.id;
        setFlashId(cardId);
        window.setTimeout(() => setFlashId((id) => (id === cardId ? null : id)), 1600);
        scrollToReliably(listRef.current, { top: 0 });
      }
    })();
  }, [pendingAdd, onPendingConsumed, bookId, bookTitle, runTranslate]);

  const mine = useMemo(() => {
    let list = cards.filter((c) => c.bookId === bookId || (!c.bookId && c.bookTitle === bookTitle));
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (c) =>
          c.word.toLowerCase().includes(needle) ||
          (c.sentence ?? '').toLowerCase().includes(needle) ||
          (c.meaning ?? '').toLowerCase().includes(needle) ||
          (c.back ?? '').toLowerCase().includes(needle) ||
          (c.studyKind ?? '').toLowerCase().includes(needle) ||
          (c.jlptLevel ?? '').toLowerCase().includes(needle) ||
          (c.sceneReference ?? '').toLowerCase().includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => b.addedAt - a.addedAt);
    else if (sort === 'oldest') sorted.sort((a, b) => a.addedAt - b.addedAt);
    else if (sort === 'frequency') {
      sorted.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0) || b.addedAt - a.addedAt);
    }
    else sorted.sort((a, b) => a.word.localeCompare(b.word, 'ja'));
    return sorted;
  }, [cards, bookId, bookTitle, q, sort]);
  const studyKindCounts = useMemo(() => {
    const counts: Record<VisualNovelStudyCardKind, number> = {
      vocabulary: 0,
      sentence: 0,
      kanji: 0,
      grammar: 0,
    };
    for (const card of mine) {
      if (card.studyKind) counts[card.studyKind] += 1;
    }
    return counts;
  }, [mine]);

  const editImagePath = edit
    ? cards.find((card) => card.id === edit.id)?.imagePath ?? ''
    : '';
  useEffect(() => {
    let active = true;
    setEditImageDataUrl('');
    if (editImagePath) {
      void window.api.visualNovelReadCaptureImage(editImagePath).then((result) => {
        if (active && result.ok && result.dataUrl) setEditImageDataUrl(result.dataUrl);
      });
    }
    return () => {
      active = false;
    };
  }, [editImagePath]);

  const openEdit = useCallback((c: DeckFlashcard) => {
    setEdit({
      id: c.id,
      front: c.word || c.front || '',
      back: c.meaning || c.back || '',
      reading: c.reading ?? '',
      sentence: c.sentence ?? '',
      swapped: false,
    });
    setTxStatus('idle');
    setTxMsg('');
  }, []);

  const closeEdit = useCallback(() => {
    txReqRef.current++;
    offModelRef.current?.();
    offModelRef.current = null;
    setEdit(null);
    setTxStatus('idle');
    setTxMsg('');
  }, []);

  const swapEditFaces = useCallback(() => {
    setEdit((e) => {
      if (!e) return e;
      return { ...e, front: e.back, back: e.front, swapped: !e.swapped };
    });
  }, []);

  const retranslateEdit = useCallback(async () => {
    if (!edit) return;
    const jp = (edit.swapped ? edit.back : edit.front).trim();
    if (!jp) return;
    const translated = await runTranslate(jp, prefs.targetLang);
    if (!translated) return;
    setEdit((e) => {
      if (!e) return e;
      return e.swapped ? { ...e, front: translated } : { ...e, back: translated };
    });
  }, [edit, prefs.targetLang, runTranslate]);

  const saveEdit = useCallback(() => {
    if (!edit) return;
    const front = edit.front.trim();
    const back = edit.back.trim();
    if (!front && !back) return;
    const word = front || back;
    const meaning = front && back ? back : back || front;
    updateDeckCard(edit.id, {
      word,
      reading: edit.reading.trim(),
      meaning,
      sentence: edit.sentence.trim() || undefined,
      front: word,
      back: meaning,
    });
    setCards(loadDeck());
    closeEdit();
    setStatusKind('ok');
    setStatusMsg(t('readerCollection.msg.cardUpdated'));
  }, [edit, closeEdit]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelected(new Set(mine.map((c) => c.id)));
  const selectUnexported = () =>
    setSelected(new Set(mine.filter((c) => !c.ankiExported).map((c) => c.id)));
  const clearSel = () => setSelected(new Set());
  const removeKnownVocabulary = () => {
    const known = cards.filter(
      (card) =>
        (card.bookId === bookId || (!card.bookId && card.bookTitle === bookTitle)) &&
        card.studyKind === 'vocabulary' &&
        getLevel(card.word) >= 2,
    );
    for (const card of known) removeDeckCard(card.id);
    setCards(loadDeck());
    setSelected((current) => {
      const next = new Set(current);
      for (const card of known) next.delete(card.id);
      return next;
    });
    setStatusKind('ok');
    setStatusMsg(
      known.length
        ? t('readerCollection.msg.removedKnownVocab', { count: known.length })
        : t('readerCollection.msg.noKnownVocab'),
    );
  };

  const exportAnki = async () => {
    const targets = mine.filter((c) => selected.has(c.id));
    if (!targets.length) {
      setExportMsg(t('readerCollection.msg.selectToExport'));
      setExportState('error');
      return;
    }
    setExportState('busy');
    setExportMsg(`Exporting ${targets.length}…`);
    let ok = 0;
    let fail = 0;
    for (const c of targets) {
      const res = await sendToAnki(
        {
          id: c.id,
          word: c.word,
          reading: c.reading,
          meaning: c.meaning || c.back,
          sentence: c.sentence,
          imagePath: c.imagePath,
          audioPath: c.audioPath,
          audioDataUrl: c.audioDataUrl,
          studyKind: c.studyKind,
          frequency: c.frequency,
          jlptLevel: c.jlptLevel,
          sceneReference: c.sceneReference,
        },
        prefs.ankiDeck,
      );
      if (res.ok) ok++;
      else fail++;
    }
    setExportState(fail && !ok ? 'error' : 'done');
    const deckHint = prefs.ankiDeck ? ` → ${prefs.ankiDeck}` : '';
    setExportMsg(`Exported ${ok}${deckHint}${fail ? `, ${fail} failed` : ''}.`);
    setCards(loadDeck());
  };

  if (!open) return null;

  const busy = txStatus === 'loading' || txStatus === 'translating' || statusKind === 'busy';
  const frontLabel = edit?.swapped ? t('readerCollection.frontTranslation') : t('readerCollection.frontJapanese');
  const backLabel = edit?.swapped ? t('readerCollection.backJapanese') : t('readerCollection.backTranslation');
  const selectedCount = selected.size;

  return (
    <aside className="reader-collection" aria-label={t('readerCollection.title')}>
      <div className="reader-collection-head">
        <div className="reader-collection-head-text">
          <span className="reader-collection-title">{t('readerCollection.title')}</span>
          <span className="reader-collection-count muted">{mine.length}</span>
        </div>
        <button type="button" className="btn small icon-btn" title={t('common.close')} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="reader-collection-settings">
        <div className="reader-collection-settings-row">
          <span className="reader-collection-compose-label">{t('readerCollection.translateTo')}</span>
          <div className="reader-collection-lang" role="group" aria-label={t('readerCollection.aria.lang')}>
            {/* Named `target`, not `t` — `t` is the translator in this scope now. */}
            {TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`reader-collection-lang-btn${prefs.targetLang === target.id ? ' active' : ''}`}
                disabled={busy}
                onClick={() => patchPrefs({ targetLang: target.id })}
              >
                {target.label}
              </button>
            ))}
          </div>
          <label className="reader-collection-check" title={t('readerCollection.swapTitle')}>
            <input
              type="checkbox"
              checked={prefs.swapDefault}
              onChange={(e) => patchPrefs({ swapDefault: e.target.checked })}
            />
            <span>{t('readerCollection.swapFaces')}</span>
          </label>
        </div>

        <div className="reader-collection-settings-row reader-collection-import-row">
          <label className="reader-collection-check" title={t('readerCollection.flashcardsTitle')}>
            <input
              type="checkbox"
              checked={prefs.autoFlashcards}
              onChange={(e) => patchPrefs({ autoFlashcards: e.target.checked })}
            />
            <span>{t('readerCollection.flashcards')}</span>
          </label>
          <label className="reader-collection-check" title={t('readerCollection.ankiTitle')}>
            <input
              type="checkbox"
              checked={prefs.autoAnki}
              onChange={(e) => patchPrefs({ autoAnki: e.target.checked })}
            />
            <span>{t('readerCollection.anki')}</span>
          </label>
          <span className="muted reader-collection-settings-hint">{t('readerCollection.autoOnCollect')}</span>
        </div>

        <div className="reader-collection-settings-row reader-collection-deck-row">
          <span className="reader-collection-compose-label">{t('readerCollection.ankiDeck')}</span>
          <select
            className="reader-collection-deck"
            title={ankiConnected ? t('readerCollection.deckTitleConnected') : t('readerCollection.deckTitleDisconnected')}
            value={prefs.ankiDeck}
            onChange={(e) => patchPrefs({ ankiDeck: e.target.value })}
          >
            <option value="">{t('readerCollection.profileDefault')}</option>
            {prefs.ankiDeck && !ankiDecks.includes(prefs.ankiDeck) && (
              <option value={prefs.ankiDeck}>{prefs.ankiDeck}</option>
            )}
            {ankiDecks.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {edit && (
        <div className="reader-collection-compose">
          <div className="reader-collection-compose-row">
            <span className="reader-collection-compose-label">{t('readerCollection.editCard')}</span>
            <button type="button" className="btn small reader-collection-swap" disabled={busy} onClick={swapEditFaces}>
              {t('readerCollection.swapFaces')}
            </button>
          </div>

          {editImageDataUrl && (
            <figure className="reader-collection-context-image">
              <img src={editImageDataUrl} alt={t('readerCollection.sceneAlt')} />
              <figcaption>{t('readerCollection.sceneCaption')}</figcaption>
            </figure>
          )}

          <label className="reader-collection-field">
            <span className="reader-collection-field-label">{frontLabel}</span>
            <textarea
              className="reader-collection-face"
              lang={edit.swapped ? undefined : 'ja'}
              value={edit.front}
              rows={3}
              onChange={(e) => setEdit((d) => (d ? { ...d, front: e.target.value } : d))}
            />
          </label>

          <label className="reader-collection-field">
            <span className="reader-collection-field-label">{backLabel}</span>
            <textarea
              className="reader-collection-face"
              lang={edit.swapped ? 'ja' : undefined}
              value={edit.back}
              rows={3}
              placeholder={busy ? t('readerCollection.translating') : t('readerCollection.translation')}
              onChange={(e) => setEdit((d) => (d ? { ...d, back: e.target.value } : d))}
            />
          </label>

          <div className="reader-collection-field-grid">
            <label className="reader-collection-field">
              <span className="reader-collection-field-label">{t('readerCollection.reading')}</span>
              <input
                lang={studyContentLang()}
                value={edit.reading}
                placeholder={t('readerCollection.optional')}
                onChange={(e) => setEdit((d) => (d ? { ...d, reading: e.target.value } : d))}
              />
            </label>
            <label className="reader-collection-field">
              <span className="reader-collection-field-label">{t('readerCollection.sentence')}</span>
              <textarea
                className="reader-collection-sentence"
                lang={studyContentLang()}
                rows={2}
                value={edit.sentence}
                placeholder={t('readerCollection.contextJa')}
                onChange={(e) => setEdit((d) => (d ? { ...d, sentence: e.target.value } : d))}
              />
            </label>
          </div>

          {txMsg && (
            <div className={`reader-collection-msg${txStatus === 'error' ? ' error' : ''}`}>{txMsg}</div>
          )}

          <div className="reader-collection-compose-actions">
            <button
              type="button"
              className="btn small primary reader-collection-save"
              disabled={busy || (!edit.front.trim() && !edit.back.trim())}
              onClick={saveEdit}
            >
              {t('common.save')}
            </button>
            <button type="button" className="btn small" disabled={busy} onClick={() => void retranslateEdit()}>
              {t('readerCollection.retranslate')}
            </button>
            <button type="button" className="btn small" onClick={closeEdit}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      <div className="reader-collection-toolbar">
        <input
          className="reader-collection-search"
          placeholder={t('readerCollection.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {Object.values(studyKindCounts).some(Boolean) && (
          <div className="reader-collection-kind-counts" aria-label={t('readerCollection.aria.kindCounts')}>
            {(Object.keys(STUDY_KIND_KEYS) as VisualNovelStudyCardKind[]).map((kind) => (
              <span key={kind}>
                {t(STUDY_KIND_KEYS[kind])} <strong>{studyKindCounts[kind]}</strong>
              </span>
            ))}
          </div>
        )}
        <div className="reader-collection-actions">
          <div className="reader-collection-actions-left">
            <button type="button" className="btn small" onClick={selectAll}>
              {t('readerCollection.all')}
            </button>
            <button type="button" className="btn small" onClick={selectUnexported} title={t('readerCollection.unexportedTitle')}>
              {t('readerCollection.unexported')}
            </button>
            <button type="button" className="btn small" onClick={clearSel}>
              {t('readerCollection.clear')}
            </button>
            {studyKindCounts.vocabulary > 0 && (
              <button
                type="button"
                className="btn small"
                title={t('readerCollection.removeKnownTitle')}
                onClick={removeKnownVocabulary}
              >
                {t('readerCollection.removeKnown')}
              </button>
            )}
            <select
              className="reader-collection-sort"
              title={t('readerCollection.sortTitle')}
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="newest">{t('readerCollection.sort.newest')}</option>
              <option value="oldest">{t('readerCollection.sort.oldest')}</option>
              <option value="word">{t('readerCollection.sort.word')}</option>
              <option value="frequency">{t('readerCollection.sort.frequency')}</option>
            </select>
          </div>
          <div className="reader-collection-actions-right">
            <button
              type="button"
              className="btn small primary"
              disabled={exportState === 'busy' || selectedCount === 0}
              title={
                prefs.autoAnki
                  ? t('readerCollection.exportTitleAuto')
                  : t('readerCollection.exportTitle')
              }
              onClick={() => void exportAnki()}
            >
              {selectedCount
                ? t('readerCollection.exportN', { count: selectedCount })
                : t('readerCollection.export')}
            </button>
          </div>
        </div>
        {!prefs.autoAnki && (
          <p className="muted reader-collection-export-hint">
            {t('readerCollection.autoOffHint')}
          </p>
        )}
      </div>

      {(statusMsg || exportMsg) && (
        <div
          className={`reader-collection-msg${
            statusKind === 'error' || exportState === 'error' ? ' error' : ''
          }`}
        >
          {statusMsg || exportMsg}
        </div>
      )}

      <ul className="reader-collection-list" ref={listRef}>
        {mine.length === 0 && (
          <li className="muted reader-collection-empty">
            {t('readerCollection.empty')}
          </li>
        )}
        {mine.map((c) => {
          const exported = !!c.ankiExported;
          const failed = !exported && !!c.ankiExportError;
          // The deck name and timestamp are data, appended to the translated stem.
          const badgeTitle = exported
            ? `${t('readerCollection.badge.exported')}${c.ankiDeck ? ` · ${c.ankiDeck}` : ''}${
                c.ankiExportedAt ? ` · ${new Date(c.ankiExportedAt).toLocaleString(LANG_TAGS[lang])}` : ''
              }`
            : failed
              ? t('readerCollection.badge.failed', { error: c.ankiExportError ?? '' })
              : t('readerCollection.badge.notExported');
          return (
            <li
              key={c.id}
              className={[
                selected.has(c.id) ? 'sel' : '',
                edit?.id === c.id ? 'editing-open' : '',
                flashId === c.id ? 'just-added' : '',
                exported ? 'anki-ok' : '',
                failed ? 'anki-fail' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <label className="reader-collection-row" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
              </label>
              <span
                className={`reader-collection-anki-dot${
                  exported ? ' ok' : failed ? ' fail' : ' pending'
                }`}
                title={badgeTitle}
                aria-label={badgeTitle}
              />
              <button
                type="button"
                className="reader-collection-entry"
                title={t('readerCollection.openToEdit')}
                onClick={() => openEdit(c)}
              >
                {c.studyKind && (
                  <span className="reader-collection-card-meta">
                    <span className={`reader-collection-kind-badge kind-${c.studyKind}`}>
                      {t(STUDY_KIND_KEYS[c.studyKind])}
                    </span>
                    {c.frequency != null && <span>{t('readerCollection.frequency', { value: c.frequency })}</span>}
                    {c.jlptLevel && <span>{c.jlptLevel.toUpperCase()}</span>}
                    {c.sceneReference && <span>{c.sceneReference}</span>}
                  </span>
                )}
                <span className="reader-collection-word" lang={cardContentLang(c)}>
                  {c.word}
                </span>
                {(c.meaning || c.back) && (
                  <span className="reader-collection-sent">{(c.meaning || c.back || '').slice(0, 100)}</span>
                )}
                {c.sentence && (
                  <span className="reader-collection-sent" lang={cardContentLang(c)}>
                    {c.sentence.slice(0, 100)}
                  </span>
                )}
              </button>
              {(c.audioDataUrl || c.audioPath) && (
                <button
                  type="button"
                  className="btn small icon-btn"
                  title={t('readerCollection.playAudio')}
                  onClick={async (e) => {
                    e.stopPropagation();
                    let dataUrl = c.audioDataUrl;
                    if (!dataUrl && c.audioPath) {
                      const result = await window.api.visualNovelReadCaptureAudio(c.audioPath);
                      if (result.ok) dataUrl = result.dataUrl;
                    }
                    if (dataUrl) await new Audio(dataUrl).play().catch(() => undefined);
                  }}
                >
                  <Icon name="player" size={12} />
                </button>
              )}
              {c.imagePath && (
                <span className="reader-collection-media-badge" title={t('readerCollection.hasScene')}>
                  <Icon name="image" size={12} />
                </span>
              )}
              <button
                type="button"
                className="btn small icon-btn"
                title={t('common.remove')}
                onClick={() => {
                  if (edit?.id === c.id) closeEdit();
                  removeDeckCard(c.id);
                  setCards(loadDeck());
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
