import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { BookLevelEstimate } from '../../../shared/bookLevelEstimate';
import type { DictEntry, DictResult } from '../../../shared/types';
import type { ImmersionSite } from '../../../shared/immersion';
import {
  normalizeYtStore,
  youtubeWatchUrl,
  type YtPlaylistsStore,
  type YtVideo,
} from '../../../shared/ytPlaylists';
import { formatBytes, isBusy, type AssetSpec } from '../../../shared/assetRegistry';
import { COMMAND_CATALOG, runCommand } from '../../keyboardShortcuts';
import {
  clearAll,
  dismiss,
  getNotifications,
  onNotificationsChanged,
  type ShellNotification,
} from '../../notificationStore';
import { estimateLevelFromText } from '../../bookLevelEstimate';
import {
  knownPercent,
  scoreTextComprehensibility,
  type ComprehensibilityScore,
} from '../../comprehensibility';
import { getLevel } from '../../knownWords';
import { getTokenizer, tokenizeSync } from '../../tokenizer';
import { parseSubtitles, type Cue } from '../../subtitles';
import { addDeckCards } from '../../flashcardDeck';
import { loadSaved } from '../../savedWords';
import { loadDeck } from '../../flashcardDeck';
import { fuzzyScore } from '../../fuzzySearch';
import { KANJI_RADICALS } from '../../../shared/kanjiRadicals';
import { useAssets, type AssetView } from '../../assetStore';
import { useT } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';

// This panel renders Study OS class names, whose rules live in styles.css.
// Imported here rather than in the boot entry so the 468 KB sheet rides this
// lazy chunk instead of Blanc's boot. See theme/studyos-compat.css.
void import('../../theme/studyos-compat.css');

export type BlancAnalyzerResult = {
  level: BookLevelEstimate | null;
  score: ComprehensibilityScore | null;
  unknownLemmas: string[];
};

function formatImmersionDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatYtDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function notificationTime(ts: number): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (elapsed < 60) return 'just now';
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function openSection(id: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: id }));
}

async function collectUnknownLemmas(text: string, threshold = 2): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    await getTokenizer();
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const token of tokenizeSync(trimmed)) {
    if (!token.content || token.proper || !token.lemma) continue;
    if (seen.has(token.lemma)) continue;
    seen.add(token.lemma);
    if (getLevel(token.lemma) < threshold) unknown.push(token.lemma);
  }
  return unknown.slice(0, 40);
}

function firstSenseSummary(entry: DictEntry | undefined): string {
  if (!entry?.senses?.length) return '';
  const sense = entry.senses[0];
  const pos = sense.partsOfSpeech.length ? `${sense.partsOfSpeech.join(', ')} · ` : '';
  return `${pos}${sense.definitions.slice(0, 2).join('; ')}`;
}

function assetProgressPercent(view: AssetView): number {
  const { receivedBytes, totalBytes } = view.status;
  if (!totalBytes) return 0;
  return Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
}

function assetStatusLine(
  view: AssetView,
  t: (key: string, vars?: TVars) => string,
): string {
  const { status, spec } = view;
  switch (status.state) {
    case 'installed':
      return `${t('storage.state.installed')} · ${formatBytes(status.totalBytes || spec.sizeBytes)} · v${status.installedVersion ?? spec.version}`;
    case 'downloading': {
      const speed = status.bytesPerSecond ? ` · ${formatBytes(status.bytesPerSecond)}/s` : '';
      return `${t('storage.state.progress', {
        received: formatBytes(status.receivedBytes),
        total: formatBytes(status.totalBytes),
      })}${speed}`;
    }
    case 'queued':
      return t('storage.state.queued');
    case 'verifying':
      return t('storage.state.verifying');
    case 'paused':
      return status.receivedBytes > 0
        ? t('storage.state.pausedAt', {
            received: formatBytes(status.receivedBytes),
            total: formatBytes(status.totalBytes),
          })
        : t('storage.state.paused');
    case 'failed':
      return status.error ? t(status.error.key, status.error.vars) : t('storage.state.failed');
    default:
      return t('storage.state.available', { size: formatBytes(spec.sizeBytes) });
  }
}

export function NotificationCenterPanel() {
  const [, tick] = useState(0);
  useEffect(() => onNotificationsChanged(() => tick((n) => n + 1)), []);
  const items = getNotifications();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Task Center</legend>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => clearAll()} disabled={!items.length}>
            Clear all
          </button>
          <span className="blanc-status">{items.length} entries</span>
        </div>
        {!items.length ? (
          <p className="blanc-note">No notifications yet.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Message</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 50).map((item: ShellNotification) => (
                  <tr key={item.id}>
                    <td>{notificationTime(item.ts)}</td>
                    <td>
                      {item.title ? <strong>{item.title}: </strong> : null}
                      {item.message}
                    </td>
                    <td>
                      <button type="button" onClick={() => dismiss(item.id)}>
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function DifficultyAnalyzerPanel() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BlancAnalyzerResult | null>(null);

  const runCheck = async (): Promise<void> => {
    const sample = text.trim();
    if (!sample) {
      setError('Paste some text first.');
      setResult(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [level, score, unknownLemmas] = await Promise.all([
        estimateLevelFromText(sample),
        scoreTextComprehensibility(sample),
        collectUnknownLemmas(sample),
      ]);
      setResult({ level, score, unknownLemmas });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const score = result?.score;
  const unknownFromScore =
    score && 'unknownLemmas' in score && Array.isArray((score as { unknownLemmas?: string[] }).unknownLemmas)
      ? ((score as { unknownLemmas?: string[] }).unknownLemmas ?? [])
      : null;
  const unknownLemmas = unknownFromScore ?? result?.unknownLemmas ?? [];

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Level &amp; Difficulty Checker</legend>
        <label>
          Text sample
          <textarea
            rows={6}
            value={text}
            lang="ja"
            placeholder="Paste Japanese or Chinese text to analyze"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void runCheck()} disabled={busy || !text.trim()}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
        {error && <p className="blanc-error">{error}</p>}
        {result?.level && (
          <div className="blanc-result-box">
            <span className="blanc-status">{result.level.label}</span>
            {' · '}
            {Math.round(result.level.confidence * 100)}% band coverage
            {!result.level.metThreshold ? ' (below threshold)' : ''}
          </div>
        )}
        {score && score.totalWords > 0 && (
          <div className="blanc-result-box">
            Comprehension: {knownPercent(score)}% known ({score.knownWords}/{score.totalWords} tokens)
          </div>
        )}
        {unknownLemmas.length > 0 && (
          <p className="blanc-note">
            Unknown lemmas ({unknownLemmas.length}): {unknownLemmas.slice(0, 20).join(', ')}
            {unknownLemmas.length > 20 ? '…' : ''}
          </p>
        )}
        {result && !result.level && score && score.totalWords === 0 && (
          <p className="blanc-warning">No level lists configured or text could not be tokenized.</p>
        )}
      </fieldset>
    </div>
  );
}

export function ImmersionTrackerPanel() {
  const [sites, setSites] = useState<ImmersionSite[]>([]);
  const [error, setError] = useState('');

  const applyStore = useCallback((store: { sites: ImmersionSite[] }) => {
    setSites(
      [...store.sites].sort(
        (a, b) => b.totalSeconds - a.totalSeconds || b.lastVisited - a.lastVisited,
      ),
    );
  }, []);

  useEffect(() => {
    void window.api
      .immersionListSites()
      .then(applyStore)
      .catch(() => setError('Immersion data is not available.'));
    const off = window.api.onImmersionSitesChanged(applyStore);
    return () => off?.();
  }, [applyStore]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Immersion Tracker</legend>
        <p className="blanc-note">Read-only totals from your immersion site library.</p>
        {error && <p className="blanc-error">{error}</p>}
        {!sites.length ? (
          <p className="blanc-note">No immersion sites tracked yet.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Time</th>
                  <th>Chars</th>
                  <th>Streak</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td title={site.url}>{site.title || site.url}</td>
                    <td>{formatImmersionDuration(site.totalSeconds)}</td>
                    <td>{site.totalChars.toLocaleString()}</td>
                    <td>{site.streakDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function FrequencyExplorerPanel() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DictResult | null>(null);

  const lookup = async (): Promise<void> => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.api.lookupTerm(q);
      setResult(next);
      if (next.error) setError(next.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const entry = result?.entries?.[0];

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Frequency Explorer</legend>
        <div className="blanc-form-grid">
          <label>
            Term
            <input
              value={query}
              lang="ja"
              placeholder="Lookup word or kanji"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void lookup();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void lookup()} disabled={busy || !query.trim()}>
            {busy ? 'Looking up…' : 'Lookup'}
          </button>
        </div>
        {error && <p className="blanc-error">{error}</p>}
        {entry && (
          <div className="blanc-result-box">
            <div>
              <strong>{entry.word}</strong>
              {entry.reading ? ` · ${entry.reading}` : ''}
            </div>
            {entry.frequency != null ? (
              <div>Frequency rank: {entry.frequency.toLocaleString()}</div>
            ) : (
              <p className="blanc-note">No frequency rank in installed dictionaries.</p>
            )}
            {firstSenseSummary(entry) && <p className="blanc-note">{firstSenseSummary(entry)}</p>}
          </div>
        )}
        {result && !entry && !error && <p className="blanc-warning">No dictionary entries found.</p>}
      </fieldset>
    </div>
  );
}

export function SubtitleImporterPanel() {
  const [cues, setCues] = useState<Cue[]>([]);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = parseSubtitles(raw);
      setCues(parsed);
      setFileName(file.name);
      setStatus(parsed.length ? `Parsed ${parsed.length} cues from ${file.name}.` : 'No cues found.');
    } catch (err) {
      setCues([]);
      setFileName('');
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const sendToFlashcards = (): void => {
    if (!cues.length) {
      setStatus('Load a subtitle file first.');
      return;
    }
    const cards = cues
      .map((cue) => cue.text.trim())
      .filter(Boolean)
      .map((sentence) => ({
        word: sentence.slice(0, 48),
        reading: '',
        meaning: '',
        sentence,
        front: sentence,
        back: '',
        source: 'import' as const,
        folder: 'Subtitles',
      }));
    addDeckCards(cards);
    setStatus(`Added ${cards.length} cards to the Subtitles folder.`);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Subtitle Importer</legend>
        <label>
          Subtitle file
          <input type="file" accept=".srt,.vtt,.ass,.ssa,.lrc,.txt" onChange={(event) => void onFile(event)} />
        </label>
        {fileName && <p className="blanc-note">{fileName}</p>}
        {cues.length > 0 && (
          <>
            <div className="blanc-result-box">{cues.length} cues loaded</div>
            <ul className="blanc-plain-list">
              {cues.slice(0, 5).map((cue, index) => (
                <li key={`${cue.start}-${index}`}>{cue.text.replace(/\n/g, ' / ')}</li>
              ))}
            </ul>
            {cues.length > 5 && <p className="blanc-note">Showing first 5 cues.</p>}
          </>
        )}
        <div className="blanc-row-actions">
          <button type="button" onClick={sendToFlashcards} disabled={!cues.length}>
            Send to flashcards
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>
    </div>
  );
}

type ContextSearchItem = {
  key: string;
  label: string;
  sub?: string;
  run: () => void;
};

export function ContextSearchPanel() {
  const [query, setQuery] = useState('');
  const [grammarItems, setGrammarItems] = useState<ContextSearchItem[]>([]);

  useEffect(() => {
    let dead = false;
    import('../../data/grammar')
      .then(({ GRAMMAR }) => {
        if (dead) return;
        setGrammarItems(
          GRAMMAR.map((g) => ({
            key: `gr-${g.id}`,
            label: g.title,
            sub: `${g.level} · ${g.meaning}`,
            run: () => openSection('grammar'),
          })),
        );
      })
      .catch(() => {
        /* grammar data unavailable */
      });
    return () => {
      dead = true;
    };
  }, []);

  const items = useMemo<ContextSearchItem[]>(() => {
    const out: ContextSearchItem[] = [];
    for (const command of COMMAND_CATALOG) {
      out.push({
        key: `cmd-${command.id}`,
        label: command.label,
        sub: command.category,
        run: () => {
          void runCommand(command.id);
        },
      });
    }
    for (const saved of loadSaved().slice(0, 200)) {
      out.push({
        key: `sw-${saved.word}`,
        label: saved.word,
        sub: saved.meaning,
        run: () => openSection('dictionary'),
      });
    }
    for (const card of loadDeck().slice(0, 200)) {
      out.push({
        key: `fc-${card.id}`,
        label: card.word,
        sub: card.sentence ?? card.bookTitle,
        run: () => openSection('flashcards'),
      });
    }
    out.push(...grammarItems);
    return out;
  }, [grammarItems]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return items.slice(0, 30);
    const scored: { item: ContextSearchItem; score: number }[] = [];
    for (const item of items) {
      const hay = `${item.label} ${item.sub ?? ''}`;
      const score = fuzzyScore(q, hay);
      if (score != null) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 30).map((row) => row.item);
  }, [items, query]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Personal Context Search</legend>
        <label>
          Search
          <input
            value={query}
            placeholder="Commands, saved words, deck cards, grammar"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!results.length ? (
          <p className="blanc-note">No matches.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <tbody>
                {results.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <button type="button" onClick={item.run}>
                        {item.label}
                      </button>
                      {item.sub ? <div className="blanc-note">{item.sub}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function KanjiInspectorPanel() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const char = [...value.trim()][0] ?? '';

  const inspect = async (): Promise<void> => {
    if (!char) {
      setError('Enter one kanji character.');
      setEntry(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await window.api.lookupTerm(char);
      if (result.error) setError(result.error);
      setEntry(result.entries?.[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntry(null);
    } finally {
      setBusy(false);
    }
  };

  const isRadical = char ? KANJI_RADICALS.includes(char) : false;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Kanji Inspector</legend>
        <div className="blanc-form-grid">
          <label>
            Character
            <input
              value={value}
              lang="ja"
              maxLength={8}
              placeholder="一"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void inspect();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void inspect()} disabled={busy || !char}>
            {busy ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>
        {char && (
          <p className="blanc-note">
            {isRadical
              ? `${char} is listed in the common radical set.`
              : `${char} is not in the bundled radical picker list.`}
          </p>
        )}
        {error && <p className="blanc-error">{error}</p>}
        {entry && (
          <div className="blanc-result-box">
            <div>
              <strong>{entry.word}</strong>
              {entry.reading ? ` · ${entry.reading}` : ''}
            </div>
            {firstSenseSummary(entry) && <p className="blanc-note">{firstSenseSummary(entry)}</p>}
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function BlancYoutubePanel() {
  const [store, setStore] = useState<YtPlaylistsStore>(() => normalizeYtStore(null));
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applyStore = useCallback((next: YtPlaylistsStore) => {
    setStore(normalizeYtStore(next));
  }, []);

  useEffect(() => {
    void window.api.ytList().then(applyStore);
    return window.api.onYtChanged(applyStore);
  }, [applyStore]);

  const videos = store.videos ?? [];
  const planIds = new Set(store.planToWatchIds ?? []);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addPlaylist = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy('Syncing playlist…');
    setError('');
    const result = await window.api.ytAddPlaylist(trimmed);
    setBusy('');
    if ('error' in result) {
      setError(result.error);
      return;
    }
    applyStore(result.store);
    setUrl('');
  };

  const downloadSelected = async (): Promise<void> => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy('Downloading…');
    setError('');
    const result = await window.api.ytDownloadVideos(ids);
    setBusy('');
    applyStore(result.store);
    const fail = result.results.find((row) => !row.ok);
    if (fail?.error) setError(fail.error);
    setSelected(new Set());
  };

  const togglePlan = async (video: YtVideo): Promise<void> => {
    if (planIds.has(video.id)) {
      applyStore(await window.api.ytRemoveFromPlanToWatch([video.id]));
    } else {
      applyStore(await window.api.ytAddToPlanToWatch([video.id]));
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>YouTube Library</legend>
        <div className="blanc-form-grid">
          <label>
            Playlist URL
            <input
              value={url}
              placeholder="https://www.youtube.com/playlist?list=…"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addPlaylist();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void addPlaylist()} disabled={!!busy || !url.trim()}>
            Add playlist
          </button>
          <button type="button" onClick={() => void downloadSelected()} disabled={!!busy || !selected.size}>
            Download selected
          </button>
        </div>
        {busy && <p className="blanc-status">{busy}</p>}
        {error && <p className="blanc-error">{error}</p>}
        {!videos.length ? (
          <p className="blanc-note">No videos yet. Add a playlist to populate the list.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Duration</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td>
                      <label className="blanc-check">
                        <input
                          type="checkbox"
                          checked={selected.has(video.id)}
                          onChange={() => toggle(video.id)}
                        />
                      </label>
                    </td>
                    <td>
                      <a href={video.url || youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noreferrer">
                        {video.title}
                      </a>
                    </td>
                    <td>{formatYtDuration(video.durationSec)}</td>
                    <td>
                      <button type="button" onClick={() => void togglePlan(video)}>
                        {planIds.has(video.id) ? 'Remove plan' : 'Plan to watch'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function BlancModelsPanel() {
  const { views, loading, start, pause, cancel } = useAssets();
  const { t } = useT();
  const [notice, setNotice] = useState('');

  const topLevel = useMemo(() => {
    const companionIds = new Set(views.flatMap((view) => view.spec.requires ?? []));
    return views.filter((view) => !companionIds.has(view.spec.id));
  }, [views]);

  const onStart = async (spec: AssetSpec): Promise<void> => {
    setNotice('');
    const result = await start(spec.id);
    if (!result.ok && result.error) setNotice(t(result.error.key, result.error.vars));
  };

  return (
    <div className="blanc-tool-detail">
      {notice && <p className="blanc-warning">{notice}</p>}
      {loading ? (
        <p className="blanc-note">{t('storage.reading')}</p>
      ) : !topLevel.length ? (
        <p className="blanc-note">No downloadable models listed.</p>
      ) : (
        topLevel.map((view) => {
          const busy = isBusy(view.status.state);
          const showBar = busy || view.status.state === 'paused';
          return (
            <div key={view.spec.id} className="blanc-result-box" style={{ marginBottom: '0.75rem' }}>
              <div>
                <strong>{view.spec.name}</strong>
                {view.spec.lang !== 'any' && (
                  <span className="blanc-status"> · {view.spec.lang === 'ja' ? 'JA' : 'ZH'}</span>
                )}
              </div>
              <p className="blanc-note">{view.spec.description}</p>
              <p className={`blanc-status${view.status.state === 'failed' ? ' blanc-error' : ''}`}>
                {assetStatusLine(view, t)}
              </p>
              {showBar && (
                <div className="blanc-result-box" style={{ padding: '0.25rem 0' }}>
                  <div
                    style={{
                      height: '4px',
                      width: `${assetProgressPercent(view)}%`,
                      background: 'var(--blanc-accent, #c41e3a)',
                    }}
                  />
                </div>
              )}
              <div className="blanc-row-actions">
                {view.status.state === 'not-installed' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Download ({formatBytes(view.spec.sizeBytes)})
                  </button>
                )}
                {view.status.state === 'failed' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Try again
                  </button>
                )}
                {(view.status.state === 'downloading' || view.status.state === 'queued') && (
                  <button type="button" onClick={() => pause(view.spec.id)}>
                    Pause
                  </button>
                )}
                {view.status.state === 'paused' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Resume
                  </button>
                )}
                {(busy || view.status.state === 'paused') && view.status.state !== 'verifying' && (
                  <button type="button" onClick={() => cancel(view.spec.id)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const WORKSPACE_LAUNCHER_KEY = 'jp-study.blanc.toolbox.workspaces.v1';

/** One launchable target inside a workspace. */
interface WorkspaceTarget {
  id: string;
  /** Absolute path from the native picker, or an http(s) URL. */
  target: string;
  label: string;
}

interface Workspace {
  id: string;
  name: string;
  targets: WorkspaceTarget[];
}

function readWorkspaces(): Workspace[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAUNCHER_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    // Rebuild from known keys only — stale shapes must not survive a reload.
    return parsed.flatMap((raw): Workspace[] => {
      if (!raw || typeof raw !== 'object') return [];
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string') return [];
      const targets = Array.isArray(row.targets) ? row.targets : [];
      return [{
        id: row.id,
        name: row.name,
        targets: targets.flatMap((rawTarget): WorkspaceTarget[] => {
          if (!rawTarget || typeof rawTarget !== 'object') return [];
          const entry = rawTarget as Record<string, unknown>;
          if (typeof entry.id !== 'string' || typeof entry.target !== 'string' || !entry.target) return [];
          return [{ id: entry.id, target: entry.target, label: typeof entry.label === 'string' ? entry.label : entry.target }];
        }),
      }];
    });
  } catch {
    return [];
  }
}

function writeWorkspaces(value: Workspace[]): void {
  try {
    window.localStorage.setItem(WORKSPACE_LAUNCHER_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function isLaunchableUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

type BatchImageFormat = 'image/png' | 'image/jpeg' | 'image/webp';

const BATCH_FORMAT_EXT: Record<BatchImageFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function batchOutputName(fileName: string, format: BatchImageFormat): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'converted-image';
  return `${base}.${BATCH_FORMAT_EXT[format]}`;
}

interface BatchConvertItem {
  id: string;
  file: File;
  state: 'queued' | 'converting' | 'done' | 'failed';
  outputUrl: string;
  outputSize: number;
  error: string;
}

async function convertImageFile(file: File, format: BatchImageFormat, quality: number): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
    });
    if (!blob) throw new Error('Conversion failed.');
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function BatchConverterPanel() {
  const [items, setItems] = useState<BatchConvertItem[]>([]);
  const [format, setFormat] = useState<BatchImageFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [busy, setBusy] = useState(false);

  const chooseFiles = (list: FileList | null): void => {
    if (!list?.length) return;
    const images = Array.from(list).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        state: 'queued' as const,
        outputUrl: '',
        outputSize: 0,
        error: '',
      })),
    ]);
  };

  const clearAllItems = (): void => {
    for (const item of items) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    }
    setItems([]);
  };

  const convertAll = async (): Promise<void> => {
    setBusy(true);
    const pending = items.filter((item) => item.state === 'queued' || item.state === 'failed');
    for (const target of pending) {
      setItems((prev) => prev.map((item) => (item.id === target.id ? { ...item, state: 'converting', error: '' } : item)));
      try {
        const blob = await convertImageFile(target.file, format, quality);
        const outputUrl = URL.createObjectURL(blob);
        setItems((prev) => prev.map((item) => {
          if (item.id !== target.id) return item;
          if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
          return { ...item, state: 'done', outputUrl, outputSize: blob.size };
        }));
      } catch (error) {
        setItems((prev) => prev.map((item) => (
          item.id === target.id
            ? { ...item, state: 'failed', error: error instanceof Error ? error.message : 'Could not convert this image.' }
            : item
        )));
      }
    }
    setBusy(false);
  };

  const doneItems = items.filter((item) => item.state === 'done');
  const pendingCount = items.filter((item) => item.state === 'queued' || item.state === 'failed').length;
  const totalIn = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalOut = doneItems.reduce((sum, item) => sum + item.outputSize, 0);

  const saveAll = (): void => {
    for (const item of doneItems) {
      const link = document.createElement('a');
      link.href = item.outputUrl;
      link.download = batchOutputName(item.file.name, format);
      link.click();
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Batch Converter</legend>
        <p className="blanc-note">Convert a queue of images locally through browser canvas. PNG, JPEG, and WebP are supported; other batch formats can use OSS adapters later.</p>
        <label>
          Images
          <input type="file" accept="image/*" multiple onChange={(event) => { chooseFiles(event.target.files); event.target.value = ''; }} />
        </label>
        <div className="blanc-form-grid">
          <label>
            Output
            <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as BatchImageFormat)}>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          <label>
            Quality
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={quality}
              disabled={busy || format === 'image/png'}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" disabled={busy || !pendingCount} onClick={() => void convertAll()}>
            {busy ? 'Converting...' : 'Convert queued'}
          </button>
          <button type="button" disabled={busy || !doneItems.length} onClick={saveAll}>
            Save all ({doneItems.length})
          </button>
          <button type="button" disabled={busy || !items.length} onClick={clearAllItems}>
            Clear
          </button>
          <span className="blanc-note">
            {items.length
              ? `${items.length} files | In ${formatBytes(totalIn)}${totalOut ? ` | Out ${formatBytes(totalOut)}` : ''}`
              : 'Choose images to queue.'}
          </span>
        </div>
      </fieldset>
      {items.length > 0 && (
        <fieldset>
          <legend>Queue</legend>
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.file.name}</td>
                    <td>{formatBytes(item.file.size)}</td>
                    <td>
                      {item.state === 'queued' && 'Queued'}
                      {item.state === 'converting' && 'Converting...'}
                      {item.state === 'done' && `Done (${formatBytes(item.outputSize)})`}
                      {item.state === 'failed' && (item.error || 'Failed')}
                    </td>
                    <td>
                      {item.state === 'done' && (
                        <a className="blanc-file-link" href={item.outputUrl} download={batchOutputName(item.file.name, format)}>
                          Save
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function WorkspaceLauncherPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => readWorkspaces());
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [status, setStatus] = useState('');
  const [launching, setLaunching] = useState(false);

  const selected = workspaces.find((workspace) => workspace.id === selectedId) ?? workspaces[0] ?? null;

  const commit = useCallback((next: Workspace[]): void => {
    setWorkspaces(next);
    writeWorkspaces(next);
  }, []);

  const updateSelected = useCallback((patch: (workspace: Workspace) => Workspace): void => {
    if (!selected) return;
    commit(workspaces.map((workspace) => (workspace.id === selected.id ? patch(workspace) : workspace)));
  }, [commit, selected, workspaces]);

  const addWorkspace = (): void => {
    const name = newName.trim();
    if (!name) return;
    const workspace: Workspace = { id: `ws-${Date.now()}`, name, targets: [] };
    commit([...workspaces, workspace]);
    setSelectedId(workspace.id);
    setNewName('');
    setStatus(`Created "${name}".`);
  };

  const removeWorkspace = (): void => {
    if (!selected) return;
    commit(workspaces.filter((workspace) => workspace.id !== selected.id));
    setSelectedId('');
    setStatus(`Removed "${selected.name}".`);
  };

  const addPickedTarget = async (): Promise<void> => {
    if (!selected) return;
    const picked = await window.api.pickShortcut();
    if (!picked) return;
    updateSelected((workspace) => ({
      ...workspace,
      targets: [...workspace.targets, { id: `t-${Date.now()}`, target: picked.target, label: picked.name || picked.target }],
    }));
    setStatus(`Added ${picked.name || picked.target}.`);
  };

  const addUrlTarget = (): void => {
    if (!selected) return;
    const url = urlDraft.trim();
    if (!isLaunchableUrl(url)) {
      setStatus('Enter a full http:// or https:// address.');
      return;
    }
    updateSelected((workspace) => ({
      ...workspace,
      targets: [...workspace.targets, { id: `t-${Date.now()}`, target: url, label: url }],
    }));
    setUrlDraft('');
    setStatus('Added link.');
  };

  const removeTarget = (targetId: string): void => {
    updateSelected((workspace) => ({ ...workspace, targets: workspace.targets.filter((entry) => entry.id !== targetId) }));
  };

  const moveTarget = (index: number, delta: number): void => {
    updateSelected((workspace) => {
      const next = [...workspace.targets];
      const swap = index + delta;
      if (swap < 0 || swap >= next.length) return workspace;
      [next[index], next[swap]] = [next[swap], next[index]];
      return { ...workspace, targets: next };
    });
  };

  const launchOne = async (entry: WorkspaceTarget): Promise<string> => {
    const error = await window.api.launchTarget(entry.target);
    return error ? `${entry.label}: ${error}` : '';
  };

  const launchAll = async (): Promise<void> => {
    if (!selected?.targets.length) return;
    setLaunching(true);
    setStatus(`Launching ${selected.targets.length} targets...`);
    const failures: string[] = [];
    for (const entry of selected.targets) {
      const failure = await launchOne(entry);
      if (failure) failures.push(failure);
    }
    setLaunching(false);
    const opened = selected.targets.length - failures.length;
    setStatus(failures.length
      ? `Opened ${opened} of ${selected.targets.length}. Failed — ${failures.join('; ')}`
      : `Opened all ${opened} targets.`);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Workspaces</legend>
        <p className="blanc-note">
          Group the apps, files, and links you always open together, then start them in one click. Targets are added through the
          Windows picker or as full http(s) links.
        </p>
        <div className="blanc-row-actions">
          <input
            type="text"
            value={newName}
            placeholder="New workspace name"
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') addWorkspace(); }}
          />
          <button type="button" disabled={!newName.trim()} onClick={addWorkspace}>Create</button>
        </div>
        {workspaces.length > 0 && (
          <div className="blanc-form-grid">
            <label>
              Workspace
              <select value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.targets.length})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      {selected ? (
        <fieldset>
          <legend>{selected.name}</legend>
          <div className="blanc-row-actions">
            <button type="button" disabled={launching || !selected.targets.length} onClick={() => void launchAll()}>
              {launching ? 'Launching...' : `Launch all (${selected.targets.length})`}
            </button>
            <button type="button" disabled={launching} onClick={() => void addPickedTarget()}>Add app or file</button>
            <button type="button" disabled={launching} onClick={removeWorkspace}>Delete workspace</button>
          </div>
          <div className="blanc-row-actions">
            <input
              type="text"
              value={urlDraft}
              placeholder="https://example.com"
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') addUrlTarget(); }}
            />
            <button type="button" disabled={!urlDraft.trim()} onClick={addUrlTarget}>Add link</button>
          </div>
          {selected.targets.length ? (
            <div className="blanc-table-wrap">
              <table className="blanc-table">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Path</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {selected.targets.map((entry, index) => (
                    <tr key={entry.id}>
                      <td>{entry.label}</td>
                      <td className="blanc-note">{entry.target}</td>
                      <td>
                        <div className="blanc-row-actions">
                          <button type="button" disabled={index === 0} onClick={() => moveTarget(index, -1)}>Up</button>
                          <button type="button" disabled={index === selected.targets.length - 1} onClick={() => moveTarget(index, 1)}>Down</button>
                          <button
                            type="button"
                            disabled={launching}
                            onClick={() => { void launchOne(entry).then((failure) => setStatus(failure || `Opened ${entry.label}.`)); }}
                          >
                            Open
                          </button>
                          <button type="button" onClick={() => removeTarget(entry.id)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="blanc-note">No targets yet. Add an app, file, or link above.</p>
          )}
        </fieldset>
      ) : (
        <fieldset>
          <legend>No workspaces</legend>
          <p className="blanc-note">Create a workspace to start grouping targets.</p>
        </fieldset>
      )}
    </div>
  );
}
