import { collectAllAnnotationsMap } from '../annotations';
import { loadClipboardHistory } from '../clipboardHistory';
import { loadDeck } from '../flashcardDeck';
import { loadLookupHistory } from '../lookupHistory';
import {
  loadNotebookTimeline,
  type NotebookStream,
  type NotebookTimelineEntry,
} from '../notebookTimeline';
import { loadSaved } from '../savedWords';
import { loadTranslationHistory } from '../translationHistory';
import { listKnownEntries } from '../knownWords';
import type { LibraryItem } from '../../shared/types';
import type { JitenPlanEntry } from '../../shared/jiten';
import {
  type CaptionScript,
  dayKey,
  scriptText,
  scriptTitle,
} from '../../shared/liveCaptions';

export interface NotebookFolderBucket {
  id: string;
  label: string;
  count: number;
}

export interface NotebookOverview {
  counts: Record<NotebookStream, number>;
  folders: NotebookFolderBucket[];
  entries: NotebookTimelineEntry[];
}

/**
 * Stores that live behind IPC rather than localStorage. The aggregator stays
 * synchronous (so it can run in a render pass and in tests without a fake
 * `window.api`); callers that want the library- and plan-derived streams fetch
 * these first via `loadNotebookSources` and pass them in.
 */
export interface NotebookSources {
  library?: LibraryItem[];
  plan?: JitenPlanEntry[];
  /** Captured Windows Live Captions sessions, oldest first. */
  captionScripts?: CaptionScript[];
}

function push(
  out: NotebookTimelineEntry[],
  entry: NotebookTimelineEntry,
): void {
  out.push(entry);
}

/**
 * A book id is a UUID on disk. Highlights grouped by raw id are unreadable, so
 * resolve to the library title where we have one and fall back to a short id
 * rather than showing the full UUID.
 */
function titleResolver(library: LibraryItem[]): (bookId: string) => string {
  const byId = new Map(library.map((i) => [i.id, i.title]));
  return (bookId) => byId.get(bookId) || `Unknown book (${bookId.slice(0, 8)})`;
}

/** Build a unified timeline from existing stores + notebook event log. */
export function aggregateNotebook(sources: NotebookSources = {}): NotebookOverview {
  const library = sources.library ?? [];
  const plan = sources.plan ?? [];
  const titleOf = titleResolver(library);
  const entries: NotebookTimelineEntry[] = [];

  /*
   * One translation, one row. Every completed translation used to reach this
   * list twice — its history entry (below) and the timeline row Translate
   * appends on completion — and "Send to Notebook" added a third. A saved
   * translation note (`meta.translationId`) stands for its history entry; a
   * plain timeline row that repeats a history entry's preview is dropped.
   */
  const history = loadTranslationHistory();
  const trKey = (title: string, detail: string | undefined): string =>
    `${title.slice(0, 80)}\u0000${(detail ?? '').slice(0, 120)}`;
  const historyKeys = new Set(history.map((tr) => trKey(tr.sourceText, tr.resultText)));
  const savedTranslations = new Set<string>();
  for (const e of loadNotebookTimeline()) {
    const translationId = e.meta?.translationId;
    if (e.stream === 'translations') {
      if (typeof translationId === 'string') savedTranslations.add(translationId);
      else if (historyKeys.has(trKey(e.title, e.detail))) continue;
    }
    push(entries, e);
  }

  for (const w of loadSaved()) {
    push(entries, {
      id: `saved-${w.word}-${w.addedAt}`,
      stream: 'saved-words',
      title: w.word,
      detail: [w.reading, w.meaning].filter(Boolean).join(' · '),
      folder: 'Mined',
      ts: w.addedAt,
      origin: 'app',
      href: 'dictionary',
    });
  }

  for (const h of loadLookupHistory()) {
    push(entries, {
      id: `lookup-${h.query}-${h.at}`,
      stream: 'lookups',
      title: h.query,
      folder: 'Lookups',
      ts: h.at,
      origin: 'app',
      href: 'dictionary',
    });
  }

  for (const c of loadDeck()) {
    // `source` was added to DeckFlashcard after the extension bridge shipped,
    // so cards captured before then carry only `folder: 'Extension'`. Both the
    // stream and the origin have to ask the same question of a card — asking it
    // two different ways is what made the Extension chip read 1 against a
    // sidebar folder of 4, with the difference labelled "Flashcards".
    const fromExtension = c.source === 'extension' || c.folder === 'Extension';
    const stream: NotebookStream =
      c.folder === 'audio' || c.audioDataUrl
        ? 'audio'
        : c.source === 'epub' || c.source === 'epub-ai'
          ? 'mining'
          : c.ankiExported
            ? 'anki'
            : fromExtension
              ? 'extension'
              : 'flashcards';
    push(entries, {
      id: `deck-${c.id}`,
      stream,
      title: c.word || c.front || 'Card',
      detail: c.meaning || c.back,
      folder: c.folder || (stream === 'audio' ? 'Audio' : 'Flashcards'),
      ts: c.addedAt,
      origin: fromExtension || c.folder === 'audio' ? 'extension' : 'app',
      href: 'flashcards',
      meta: {
        ankiExported: !!c.ankiExported,
        bookId: c.bookId,
        bookTitle: c.bookTitle,
        source: c.source,
      },
    });
  }

  for (const tr of history) {
    if (savedTranslations.has(tr.id)) continue;
    push(entries, {
      id: `tr-${tr.id}`,
      stream: 'translations',
      title: tr.sourceText.slice(0, 80),
      detail: tr.resultText.slice(0, 120),
      folder: 'Translations',
      ts: tr.ts,
      origin: tr.origin,
      href: 'translate',
    });
  }

  for (const { word, level } of listKnownEntries()) {
    push(entries, {
      id: `known-${word}`,
      stream: 'known',
      title: word,
      detail: `Level ${level}`,
      folder: 'Known',
      ts: Date.now() - level * 1000,
      origin: 'app',
      href: 'dictionary',
      meta: { level },
    });
  }

  // Live Captions scripts. The timeline row is a single click-through button
  // with no clamp on `detail`, so only a bounded preview goes there; the whole
  // script travels in `meta.text` for the notebook's transcript panel.
  const captionScripts = sources.captionScripts ?? [];
  const perDay = new Map<string, number>();
  const now = Date.now();
  for (const script of captionScripts) {
    if (script.lines.length === 0) continue;
    const key = dayKey(script.startedAt);
    const seen = perDay.get(key) ?? 0;
    perDay.set(key, seen + 1);
    const text = scriptText(script);
    push(entries, {
      id: `lc-${script.id}`,
      stream: 'transcript',
      title: scriptTitle(script, now, seen),
      detail:
        text.length > 240
          ? // Don't cut between the halves of a surrogate pair.
            `${text.slice(0, (text.charCodeAt(239) & 0xfc00) === 0xd800 ? 239 : 240)}…`
          : text,
      folder: 'Live captions',
      ts: script.startedAt,
      origin: 'app',
      // The Reading workspace, not Files: gate 7b moved LiveCaptionsPanel to
      // ReadingCapturesView, and this row is a caption script, so the section
      // that can actually show its text is the one that mounts the panel.
      href: 'reading',
      meta: {
        text,
        lineCount: script.lines.length,
        startedAt: script.startedAt,
        endedAt: script.endedAt,
      },
    });
  }

  const annos = collectAllAnnotationsMap();
  for (const [bookId, list] of Object.entries(annos)) {
    const bookTitle = titleOf(bookId);
    for (const a of list) {
      push(entries, {
        id: `hl-${a.id}`,
        stream: 'highlights',
        title: a.text.slice(0, 80),
        detail: `Highlight · ${a.color}`,
        folder: `Highlights/${bookTitle}`,
        ts: a.createdAt,
        origin: 'app',
        href: 'library',
        meta: { bookId, bookTitle, color: a.color },
      });
    }
  }

  // Manga OCR. Page data itself lives on disk under `<item>/_ocr/`; `ocrMeta` is
  // the denormalized per-volume summary the library already keeps in sync, so
  // one entry per scanned volume is the honest granularity here — not one per page.
  for (const item of library) {
    const m = item.ocrMeta;
    if (!m || m.ocrPages <= 0) continue;
    const parts = [`${m.ocrPages} pages scanned`];
    if (m.translatedPages > 0) {
      parts.push(`${m.translatedPages} translated${m.targetLang ? ` → ${m.targetLang}` : ''}`);
    }
    if (m.completedAt) parts.push('complete');
    push(entries, {
      id: `ocr-${item.id}`,
      stream: 'ocr',
      title: item.title,
      detail: parts.join(' · '),
      folder: 'OCR',
      ts: m.updatedAt,
      origin: 'app',
      href: 'library',
      meta: {
        bookId: item.id,
        ocrPages: m.ocrPages,
        translatedPages: m.translatedPages,
        complete: !!m.completedAt,
      },
    });
  }

  // Articles pushed in from the Chrome extension's Inbox bridge.
  for (const item of library) {
    const inbox = item.inboxMeta;
    if (!inbox) continue;
    push(entries, {
      id: `inbox-${item.id}`,
      stream: 'extension',
      title: item.title,
      detail: `${inbox.sourceUrl} · ~${inbox.estMinutes} min`,
      folder: 'Inbox',
      ts: inbox.receivedAt,
      origin: 'extension',
      href: 'library',
      meta: {
        bookId: item.id,
        sourceUrl: inbox.sourceUrl,
        lang: inbox.lang,
        levelEstimate: inbox.levelEstimate ?? undefined,
      },
    });
  }

  // "Plan to read" — the Novels view's Jiten plan store (main-process backed).
  for (const p of plan) {
    const detail = [p.author, p.difficultyLabel, p.acquisitionStatus]
      .filter(Boolean)
      .join(' · ');
    push(entries, {
      id: `plan-${p.id}`,
      stream: 'plan',
      title: p.titleJp,
      detail: detail || undefined,
      folder: 'Plan to read',
      ts: p.updatedAt || p.createdAt,
      origin: 'app',
      href: 'novels',
      meta: {
        acquisitionStatus: p.acquisitionStatus,
        importedLibraryItemId: p.importedLibraryItemId,
        minedAt: p.minedAt,
        jitenDeckId: p.jitenDeckId,
      },
    });
  }

  try {
    for (const clip of loadClipboardHistory().slice(0, 80)) {
      const text = (clip.text || '').trim();
      if (!text) continue;
      // Light heuristic: CJK / study-tagged clips only
      if (!/[\u3040-\u30ff\u4e00-\u9fff]/.test(text) && !clip.pinned) continue;
      push(entries, {
        id: `clip-${clip.id}`,
        stream: 'clipboard',
        title: text.slice(0, 80),
        folder: 'Clipboard',
        ts: clip.createdAt,
        origin: 'app',
        href: 'clipboard',
      });
    }
  } catch {
    /* clipboard store shape may vary */
  }

  entries.sort((a, b) => b.ts - a.ts);

  const counts = {
    'saved-words': 0,
    lookups: 0,
    flashcards: 0,
    anki: 0,
    mining: 0,
    known: 0,
    translations: 0,
    plan: 0,
    highlights: 0,
    ocr: 0,
    audio: 0,
    clipboard: 0,
    extension: 0,
  } as Record<NotebookStream, number>;

  for (const e of entries) {
    counts[e.stream] = (counts[e.stream] || 0) + 1;
  }

  const folderMap = new Map<string, number>();
  for (const e of entries) {
    const f = e.folder || 'Other';
    folderMap.set(f, (folderMap.get(f) || 0) + 1);
  }
  const folders = [...folderMap.entries()]
    .map(([id, count]) => ({ id, label: id, count }))
    .sort((a, b) => b.count - a.count);

  return { counts, folders, entries };
}

/**
 * Fetch the IPC-backed stores. Either call can fail (no `window.api` in tests,
 * jiten store absent on a fresh profile) — a missing source degrades that one
 * stream, so failures resolve to empty instead of taking the whole hub down.
 */
export async function loadNotebookSources(): Promise<NotebookSources> {
  const [library, plan, captionScripts] = await Promise.all([
    Promise.resolve()
      .then(() => window.api?.listLibrary?.() ?? [])
      .catch(() => [] as LibraryItem[]),
    Promise.resolve()
      .then(() => window.api?.jitenGetStore?.())
      .then((s) => s?.plan ?? [])
      .catch(() => [] as JitenPlanEntry[]),
    Promise.resolve()
      .then(() => window.api?.liveCaptionsScripts?.() ?? [])
      .catch(() => [] as CaptionScript[]),
  ]);
  return { library, plan, captionScripts };
}

/** Convenience: load the IPC stores, then aggregate. */
export async function aggregateNotebookAsync(): Promise<NotebookOverview> {
  return aggregateNotebook(await loadNotebookSources());
}
