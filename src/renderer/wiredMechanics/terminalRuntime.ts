/**
 * The real `TerminalContext`: what the Navi terminal's commands actually touch.
 *
 * Everything routes through the app's existing seams — the dictionary IPC the
 * Dictionary app uses (and its lookup history), `mineToStudy` for captures,
 * `getSummary`/`knowledgeCounts` for numbers, the deck store for due cards,
 * `syncKnowledgeFromAnki` for sync. Nothing here keeps a second copy of any
 * study data.
 */
import { getUiLang, t } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import type { DictResult } from '../../shared/types';
import { getSummary } from '../stats';
import { getLevel, knowledgeCounts } from '../knownWords';
import { dueDeckCards, loadDeck } from '../flashcardDeck';
import { loadLookupHistory, recordLookup } from '../lookupHistory';
import { getStudyLang } from '../studyEnvironment';
import { getActiveProfile } from '../profileState';
import { openSectionSurface } from '../sectionSurface';
import { speak, ttsAvailable } from '../tts';
import { getTokenizer, tokenizeSync } from '../tokenizer';
import { LAYER_THRESHOLDS, LAYER_UNLOCKS, nextLayerThreshold } from './layer';
import { getWiredLayerState, refreshWiredLayer } from './layerStore';
import { openWiredConsole, triggerIntercept } from './consoleBus';
import { loadInterceptRecord } from './interceptStore';
import type {
  DueSnapshot,
  EchoOutcome,
  LayerSnapshot,
  LookupRow,
  MineOutcome,
  RootSnapshot,
  StatsSnapshot,
  SyncOutcome,
  TerminalContext,
  TraceRow,
  WeakRow,
} from './terminalEngine';

const sessionStartedAt = Date.now();

function plainMeanings(entry: DictResult['entries'][number]): string[] {
  const senses = Array.isArray(entry.senses) ? entry.senses : [];
  return senses
    .map((s) => (Array.isArray(s.definitions) ? s.definitions.slice(0, 4).join('; ') : ''))
    .filter(Boolean);
}

async function lookup(word: string): Promise<LookupRow[] | null> {
  const query = word.trim();
  if (!query) return [];
  const lang = getStudyLang();
  let result: DictResult;
  try {
    const api = window.api;
    result = lang === 'zh' ? await api.lookupChinese(query, 8) : await api.lookupTerm(query, 8, lang);
  } catch {
    return null;
  }
  const entries = result && Array.isArray(result.entries) ? result.entries : null;
  if (!entries) return null;
  try {
    window.dispatchEvent(new CustomEvent('wired:db-blip'));
  } catch {
    /* ignore */
  }
  const rows = entries
    .filter((e) => e && typeof e.word === 'string')
    .map((e) => ({
      word: e.word,
      reading: typeof e.reading === 'string' ? e.reading : '',
      jlpt: Array.isArray(e.jlpt) ? e.jlpt[0] : undefined,
      meanings: plainMeanings(e),
    }));
  const top = entries[0];
  if (top && typeof top.word === 'string') {
    // Same evidence the Dictionary app records, so the query log, Study Mode's
    // repeated-lookup pack and the desktop's LAST QUERY all see terminal lookups.
    recordLookup({
      query,
      lemma: result.deinflection?.term?.trim() || top.word.trim() || query,
      reading: top.reading,
      meaning: plainMeanings(top)[0],
      jlptLevel: Array.isArray(top.jlpt) ? top.jlpt[0] : undefined,
      lang,
    });
  }
  return rows;
}

function stats(): StatsSnapshot {
  const s = getSummary();
  const counts = knowledgeCounts();
  const deck = loadDeck();
  return {
    todayReviews: s.todayReviews,
    todayPassed: s.recent[s.recent.length - 1]?.reviewsPassed ?? 0,
    streak: s.streak,
    daysActive: s.daysActive,
    totalReviews: s.totalReviews,
    totalPassed: s.totalReviewsPassed,
    known: counts[3] ?? 0,
    familiar: counts[2] ?? 0,
    deckSize: deck.length,
    dueNow: dueDeckCards(deck).length,
    todayStudyMinutes: Math.round((s.todaySeconds + s.todayWatchSeconds + s.todayStudySeconds) / 60),
  };
}

function due(): DueSnapshot {
  const deck = loadDeck();
  const now = Date.now();
  const dueCards = dueDeckCards(deck, now);
  let nextDueAt: number | null = null;
  for (const card of deck) {
    const at = card.srs?.dueAt;
    if (typeof at === 'number' && at > now && (nextDueAt === null || at < nextDueAt)) nextDueAt = at;
  }
  return {
    dueNow: dueCards.length,
    words: dueCards.map((c) => c.word || c.front || '').filter(Boolean),
    nextDueAt,
    deckSize: deck.length,
  };
}

function layerInfo(): LayerSnapshot {
  refreshWiredLayer(true);
  const s = getWiredLayerState();
  const next = nextLayerThreshold(s.layer);
  return {
    layer: s.layer,
    depth: s.depth,
    floor: LAYER_THRESHOLDS[s.layer - 1] ?? 0,
    nextLayer: next === null ? null : s.layer + 1,
    nextAt: next,
    unlocked: LAYER_UNLOCKS.filter((u) => u.layer <= s.layer).map((u) => ({ layer: u.layer, descKey: u.descKey })),
    sealed: LAYER_UNLOCKS.filter((u) => u.layer > s.layer).map((u) => ({ layer: u.layer, descKey: u.descKey })),
  };
}

async function sync(): Promise<SyncOutcome> {
  try {
    const link = await window.api.ankiLinkState();
    if (!link || link.state !== 'connected') return { ok: false, unavailable: true };
  } catch {
    return { ok: false, unavailable: true };
  }
  try {
    const { syncKnowledgeFromAnki } = await import('../ankiSync');
    const r = await syncKnowledgeFromAnki();
    return { ok: r.ok, changed: r.changed, scanned: r.scanned, stale: r.stale, error: r.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const JP = /[぀-ヿ㐀-鿿]/u;

/**
 * Capture a typed sentence as a card. The target word is the first content
 * word the operator does not yet know (i+1), else the first content word; the
 * gloss comes from the dictionary when it answers.
 */
async function mine(sentence: string): Promise<MineOutcome> {
  const line = sentence.trim();
  if (!JP.test(line)) return { ok: false, noTarget: true };
  let target = '';
  let reading = '';
  try {
    await getTokenizer();
    const tokens = tokenizeSync(line).filter((tk) => tk.content && !tk.proper && JP.test(tk.lemma || tk.surface));
    const pick = tokens.find((tk) => getLevel(tk.lemma || tk.surface) < 3) ?? tokens[0];
    if (pick) {
      target = pick.lemma && pick.lemma !== '*' ? pick.lemma : pick.surface;
      reading = pick.reading && pick.reading !== '*' ? pick.reading : '';
    }
  } catch {
    /* tokenizer assets missing: fall back to the whole line */
  }
  if (!target) target = [...line].slice(0, 12).join('');
  let meaning = '';
  try {
    const rows = await lookup(target);
    if (rows && rows[0]) {
      meaning = rows[0].meanings[0] ?? '';
      if (!reading) reading = rows[0].reading;
    }
  } catch {
    /* gloss is optional */
  }
  try {
    const { mineToStudy } = await import('../studyMining');
    const result = await mineToStudy({
      word: target,
      reading,
      meaning,
      sentence: line,
      source: 'analysis',
      sourceTitle: 'NAVI TTY',
      sourceId: 'wired-tty',
      studyLang: getStudyLang(),
    });
    return { ok: true, word: result.card.word, created: result.created };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function trace(): TraceRow[] {
  return loadLookupHistory().map((e) => ({ word: e.lemma || e.query, reading: e.reading, count: e.count, at: e.at }));
}

function weak(): WeakRow[] {
  return loadDeck()
    .filter((c) => (c.srs?.lapses ?? 0) > 0)
    .sort((a, b) => (b.srs?.lapses ?? 0) - (a.srs?.lapses ?? 0))
    .slice(0, 10)
    .map((c) => ({ word: c.word || c.front || '?', lapses: c.srs?.lapses ?? 0 }));
}

async function echo(text: string): Promise<EchoOutcome> {
  const line = text.trim();
  const spoken = ttsAvailable() ? speak(line, 'ja') : false;
  let tokens: EchoOutcome['tokens'] = [];
  try {
    await getTokenizer();
    tokens = tokenizeSync(line).map((tk) => ({ surface: tk.surface, reading: tk.reading && tk.reading !== '*' ? tk.reading : '' }));
  } catch {
    /* reading breakdown is optional */
  }
  return { spoken, tokens };
}

function forecast(): number[] {
  const deck = loadDeck();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const buckets = Array.from({ length: 7 }, () => 0);
  const now = Date.now();
  for (const card of deck) {
    const at = card.srs?.dueAt;
    if (typeof at !== 'number') continue;
    const idx = at <= now ? 0 : Math.floor((at - start.getTime()) / dayMs);
    if (idx >= 0 && idx < 7) buckets[idx] += 1;
  }
  return buckets;
}

function root(): RootSnapshot {
  const s = getWiredLayerState();
  const icp = loadInterceptRecord();
  return {
    stats: stats(),
    layer: s.layer,
    depth: s.depth,
    lookups: loadLookupHistory().reduce((sum, e) => sum + e.count, 0),
    intercepts: { total: icp.total, passed: icp.passed },
  };
}

/** Build a context. `history` is the caller's command history (newest last). */
export function createTerminalContext(history: () => string[]): TerminalContext {
  return {
    t: (key, params) => t(key, params),
    layer: () => getWiredLayerState().layer,
    history,
    lookup,
    stats,
    due,
    layerInfo,
    openModule: (section) => openSectionSurface(section),
    openConsole: (id) => openWiredConsole(id),
    sync,
    mine,
    whoami: () => ({
      operator: (() => {
        try {
          return getActiveProfile().label || 'OPERATOR';
        } catch {
          return 'OPERATOR';
        }
      })(),
      studyLang: getStudyLang(),
      uiLang: getUiLang(),
      layer: getWiredLayerState().layer,
      uptimeSec: Math.round((Date.now() - sessionStartedAt) / 1000),
    }),
    intercept: () => triggerIntercept(),
    trace,
    weak,
    echo,
    forecast,
    root,
    formatTime: (at) =>
      new Date(at).toLocaleString(LANG_TAGS[getUiLang()], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
  };
}
