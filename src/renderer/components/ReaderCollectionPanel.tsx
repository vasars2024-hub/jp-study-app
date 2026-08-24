// Local Flashcard Collection inbox for the novel reader.
// List is primary. Compose opens only when a list row is clicked.
// Translation prefs are global for the collection until the user changes them.
// Anki deck target + per-card export status; selective export when auto is off.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDeckCards,
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

type SortMode = 'newest' | 'oldest' | 'word' | 'frequency';
type TargetLang = 'en' | 'ru' | 'zh';
type TxStatus = 'idle' | 'loading' | 'translating' | 'done' | 'error';

export interface CollectionAddPayload {
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
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
const STUDY_KIND_LABELS: Record<VisualNovelStudyCardKind, string> = {
  vocabulary: 'Vocabulary',
  sentence: 'Sentence',
  kanji: 'Kanji',
  grammar: 'Grammar',
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

  const runTranslate = useCallback(async (jpText: string, lang: TargetLang) => {
    const text = jpText.trim();
    if (!text) {
      setTxStatus('idle');
      setTxMsg('');
      return '';
    }
    const id = ++txReqRef.current;
    setTxStatus('loading');
    setTxMsg('Loading translator…');
    // Per-subscription, so a Translate view or a sentence popup loading the same model at the
    // same time keeps its own progress. This used to be one global slot.
    offModelRef.current?.();
    offModelRef.current = onModelProgress((p) => {
      if (id !== txReqRef.current) return;
      if (p.status === 'progress' && typeof p.progress === 'number') {
        setTxMsg(`Loading model… ${Math.round(p.progress)}%`);
      }
    });
    try {
      const result = await translateTo(text, 'ja' as TransLang, lang, (prog) => {
        if (id !== txReqRef.current) return;
        setTxStatus('translating');
        setTxMsg(`Translating… ${Math.round(prog * 100)}%`);
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
            if (res.noteId && res.ok) {
              const noteId = res.noteId;
              const cardId = c.id;
              const term = c.word;
              pushUndo(
                `Anki note “${term.slice(0, 40)}”`,
                async () => {
                  await window.api.ankiDeleteNotes([noteId]);
                  updateDeckCard(cardId, {
                    ankiExported: false,
                    ankiNoteId: undefined,
                    ankiExportError: undefined,
                  });
                  setCards(loadDeck());
                },
                'anki',
              );
            }
          } else {
            updateDeckCard(c.id, {
              ankiExported: false,
              ankiExportError: res.error ?? 'Export failed',
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
    const reading = (pendingAdd.reading ?? '').trim();
    const seedMeaning = (pendingAdd.meaning ?? '').trim();
    onPendingConsumed?.();
    if (!word) return;

    const seq = ++addSeqRef.current;
    const { targetLang, swapDefault, autoFlashcards, autoAnki, ankiDeck } = prefsRef.current;

    void (async () => {
      setStatusKind('busy');
      setStatusMsg(seedMeaning ? 'Saving…' : 'Translating…');

      let meaning = seedMeaning;
      if (!meaning || meaning === word) {
        const tx = await runTranslate(word, targetLang);
        if (seq !== addSeqRef.current) return;
        if (tx) meaning = tx;
      }

      let front = word;
      let back = meaning || word;
      if (swapDefault && meaning) {
        front = meaning;
        back = word;
      }

      const sentenceVal =
        sentence && sentence !== word ? sentence : sentence || undefined;
      const payload = {
        word: front,
        reading,
        meaning: back,
        sentence: sentenceVal,
        front,
        back,
        source: 'epub' as const,
        bookId,
        bookTitle,
      };

      const saveToDeck = autoFlashcards || !autoAnki;
      let card: DeckFlashcard | undefined;
      if (saveToDeck) {
        const created = addDeckCards([payload]);
        card = created[0];
        setCards(loadDeck());
      }

      let ankiOk = false;
      let ankiFail = false;
      if (autoAnki) {
        const res = await sendToAnki(
          {
            id: card?.id,
            word: payload.word,
            reading: payload.reading,
            meaning: payload.meaning,
            sentence: payload.sentence,
          },
          ankiDeck,
        );
        ankiOk = res.ok;
        ankiFail = !res.ok;
      }

      if (seq !== addSeqRef.current) return;
      setStatusKind(ankiFail ? 'error' : 'ok');
      const parts: string[] = [];
      if (saveToDeck) parts.push(autoFlashcards ? 'Flashcards' : 'Collection');
      if (autoAnki) parts.push(ankiOk ? `Anki${ankiDeck ? ` (${ankiDeck})` : ''}` : 'Anki failed');
      setStatusMsg(parts.length ? `Saved → ${parts.join(' · ')}` : 'Saved');
      if (card) {
        const cardId = card.id;
        setFlashId(cardId);
        window.setTimeout(() => setFlashId((id) => (id === cardId ? null : id)), 1600);
        listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    })();
  }, [pendingAdd, onPendingConsumed, bookId, bookTitle, runTranslate, sendToAnki]);

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
    setStatusMsg('Card updated');
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
        ? `Removed ${known.length} familiar or known vocabulary card${known.length === 1 ? '' : 's'}.`
        : 'No familiar or known vocabulary cards found.',
    );
  };

  const exportAnki = async () => {
    const targets = mine.filter((c) => selected.has(c.id));
    if (!targets.length) {
      setExportMsg('Select cards to export (checkboxes).');
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
  const frontLabel = edit?.swapped ? 'Front · translation' : 'Front · Japanese';
  const backLabel = edit?.swapped ? 'Back · Japanese' : 'Back · translation';
  const selectedCount = selected.size;

  return (
    <aside className="reader-collection" aria-label="Collection">
      <div className="reader-collection-head">
        <div className="reader-collection-head-text">
          <span className="reader-collection-title">Collection</span>
          <span className="reader-collection-count muted">{mine.length}</span>
        </div>
        <button type="button" className="btn small icon-btn" title="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="reader-collection-settings">
        <div className="reader-collection-settings-row">
          <span className="reader-collection-compose-label">Translate to</span>
          <div className="reader-collection-lang" role="group" aria-label="Translation language">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`reader-collection-lang-btn${prefs.targetLang === t.id ? ' active' : ''}`}
                disabled={busy}
                onClick={() => patchPrefs({ targetLang: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="reader-collection-check" title="New cards: translation on front, Japanese on back">
            <input
              type="checkbox"
              checked={prefs.swapDefault}
              onChange={(e) => patchPrefs({ swapDefault: e.target.checked })}
            />
            <span>Swap faces</span>
          </label>
        </div>

        <div className="reader-collection-settings-row reader-collection-import-row">
          <label className="reader-collection-check" title="Save into the Flashcards app deck when collecting">
            <input
              type="checkbox"
              checked={prefs.autoFlashcards}
              onChange={(e) => patchPrefs({ autoFlashcards: e.target.checked })}
            />
            <span>Flashcards</span>
          </label>
          <label className="reader-collection-check" title="Also send each new card to Anki">
            <input
              type="checkbox"
              checked={prefs.autoAnki}
              onChange={(e) => patchPrefs({ autoAnki: e.target.checked })}
            />
            <span>Anki</span>
          </label>
          <span className="muted reader-collection-settings-hint">Auto on collect</span>
        </div>

        <div className="reader-collection-settings-row reader-collection-deck-row">
          <span className="reader-collection-compose-label">Anki deck</span>
          <select
            className="reader-collection-deck"
            title={ankiConnected ? 'Deck for auto/manual Anki export' : 'Connect AnkiConnect to list decks'}
            value={prefs.ankiDeck}
            onChange={(e) => patchPrefs({ ankiDeck: e.target.value })}
          >
            <option value="">Profile default</option>
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
            <span className="reader-collection-compose-label">Edit card</span>
            <button type="button" className="btn small reader-collection-swap" disabled={busy} onClick={swapEditFaces}>
              Swap faces
            </button>
          </div>

          {editImageDataUrl && (
            <figure className="reader-collection-context-image">
              <img src={editImageDataUrl} alt="Visual novel scene context" />
              <figcaption>Captured scene context · included with Anki export</figcaption>
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
              placeholder={busy ? 'Translating…' : 'Translation'}
              onChange={(e) => setEdit((d) => (d ? { ...d, back: e.target.value } : d))}
            />
          </label>

          <div className="reader-collection-field-grid">
            <label className="reader-collection-field">
              <span className="reader-collection-field-label">Reading</span>
              <input
                lang="ja"
                value={edit.reading}
                placeholder="Optional"
                onChange={(e) => setEdit((d) => (d ? { ...d, reading: e.target.value } : d))}
              />
            </label>
            <label className="reader-collection-field">
              <span className="reader-collection-field-label">Sentence</span>
              <textarea
                className="reader-collection-sentence"
                lang="ja"
                rows={2}
                value={edit.sentence}
                placeholder="Context (Japanese)"
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
              Save
            </button>
            <button type="button" className="btn small" disabled={busy} onClick={() => void retranslateEdit()}>
              Retranslate
            </button>
            <button type="button" className="btn small" onClick={closeEdit}>
              Close
            </button>
          </div>
        </div>
      )}

      <div className="reader-collection-toolbar">
        <input
          className="reader-collection-search"
          placeholder="Search collection…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {Object.values(studyKindCounts).some(Boolean) && (
          <div className="reader-collection-kind-counts" aria-label="Visual novel card counts">
            {(Object.keys(STUDY_KIND_LABELS) as VisualNovelStudyCardKind[]).map((kind) => (
              <span key={kind}>
                {STUDY_KIND_LABELS[kind]} <strong>{studyKindCounts[kind]}</strong>
              </span>
            ))}
          </div>
        )}
        <div className="reader-collection-actions">
          <div className="reader-collection-actions-left">
            <button type="button" className="btn small" onClick={selectAll}>
              All
            </button>
            <button type="button" className="btn small" onClick={selectUnexported} title="Select cards not yet in Anki">
              Unexported
            </button>
            <button type="button" className="btn small" onClick={clearSel}>
              Clear
            </button>
            {studyKindCounts.vocabulary > 0 && (
              <button
                type="button"
                className="btn small"
                title="Remove vocabulary already marked Familiar or Known"
                onClick={removeKnownVocabulary}
              >
                Remove known
              </button>
            )}
            <select
              className="reader-collection-sort"
              title="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="word">Word A–Z</option>
              <option value="frequency">Most repeated</option>
            </select>
          </div>
          <div className="reader-collection-actions-right">
            <button
              type="button"
              className="btn small primary"
              disabled={exportState === 'busy' || selectedCount === 0}
              title={
                prefs.autoAnki
                  ? 'Manual export (also runs when auto Anki is on)'
                  : 'Export selected cards to Anki'
              }
              onClick={() => void exportAnki()}
            >
              Export{selectedCount ? ` (${selectedCount})` : ''} → Anki
            </button>
          </div>
        </div>
        {!prefs.autoAnki && (
          <p className="muted reader-collection-export-hint">
            Auto Anki is off — tick cards, then Export.
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
            No cards yet. Select a word or sentence and press Collect.
          </li>
        )}
        {mine.map((c) => {
          const exported = !!c.ankiExported;
          const failed = !exported && !!c.ankiExportError;
          const badgeTitle = exported
            ? `Exported to Anki${c.ankiDeck ? ` · ${c.ankiDeck}` : ''}${
                c.ankiExportedAt ? ` · ${new Date(c.ankiExportedAt).toLocaleString()}` : ''
              }`
            : failed
              ? `Anki export failed: ${c.ankiExportError}`
              : 'Not exported to Anki';
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
                title="Open to edit"
                onClick={() => openEdit(c)}
              >
                {c.studyKind && (
                  <span className="reader-collection-card-meta">
                    <span className={`reader-collection-kind-badge kind-${c.studyKind}`}>
                      {STUDY_KIND_LABELS[c.studyKind]}
                    </span>
                    {c.frequency != null && <span>Frequency {c.frequency}</span>}
                    {c.jlptLevel && <span>{c.jlptLevel.toUpperCase()}</span>}
                    {c.sceneReference && <span>{c.sceneReference}</span>}
                  </span>
                )}
                <span className="reader-collection-word" lang="ja">
                  {c.word}
                </span>
                {(c.meaning || c.back) && (
                  <span className="reader-collection-sent">{(c.meaning || c.back || '').slice(0, 100)}</span>
                )}
                {c.sentence && (
                  <span className="reader-collection-sent" lang="ja">
                    {c.sentence.slice(0, 100)}
                  </span>
                )}
              </button>
              {(c.audioDataUrl || c.audioPath) && (
                <button
                  type="button"
                  className="btn small icon-btn"
                  title="Play attached audio"
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
                <span className="reader-collection-media-badge" title="Includes captured scene context">
                  <Icon name="image" size={12} />
                </span>
              )}
              <button
                type="button"
                className="btn small icon-btn"
                title="Remove"
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
