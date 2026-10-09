import { useEffect, useState } from 'react';
import { confirmDialog, Select } from '../components/ui';
import { KNOWN_LANGS, langNativeLabel } from '../../shared/langs';
import type { YomitanDictInfo } from '../../shared/types';
import {
  DICTIONARY_KIND_LABEL_KEYS,
  GLOBAL_PAIR,
  isGlobalPair,
  pairKey,
  type DictionaryLanguagePair,
  type DictionarySourceInfo,
} from '../../shared/dictionarySources';
import {
  bumpZoom,
  getZoom,
  onZoomChanged,
  setZoom,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '../appZoom';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import ShortcutSettings from '../components/ShortcutSettings';
import { loadClipboardSettings, saveClipboardSettings } from '../clipboardHistory';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { sendTelemetryPingIfNeeded } from '../telemetryPing';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import type { DictionaryImportJobSnapshot } from '../../shared/dictionaryImportJob';
import DictionaryDisplaySettings from '../components/settings/DictionaryDisplaySettings';

/** Study-profile picker and controls — shared by Settings and Anki views. */
export function ProfileSettingsSection() {
  return <ProfileSwitcher showHeading />;
}

/**
 * Queues a dictionary job and answers with the terminal snapshot it reaches.
 *
 * The listener is attached *before* `start` runs, and buffers terminal snapshots
 * it cannot yet attribute: the job id only exists once `start` has answered, and
 * a small relabel can finish inside that round trip. Attaching afterwards would
 * wait forever for an event already delivered.
 *
 * There is no timeout, deliberately: `importJobs.ts` synthesises a `failed`
 * terminal when the utility process exits without one, so every queued job ends
 * in an event rather than in silence.
 */
async function queueDictionaryJob<T extends { jobId?: string }>(
  start: () => Promise<T>,
): Promise<{ result: T; terminal: DictionaryImportJobSnapshot['terminal'] }> {
  const buffered = new Map<string, DictionaryImportJobSnapshot>();
  let wanted: string | null = null;
  let deliver: ((snapshot: DictionaryImportJobSnapshot) => void) | null = null;
  const off = window.api.onDictImportChanged((snapshot) => {
    if (!snapshot.terminal) return;
    if (wanted === snapshot.jobId) deliver?.(snapshot);
    else buffered.set(snapshot.jobId, snapshot);
  });
  try {
    const result = await start();
    if (!result.jobId) return { result, terminal: undefined };
    wanted = result.jobId;
    const already = buffered.get(wanted);
    const snapshot = already
      ?? (await new Promise<DictionaryImportJobSnapshot>((resolve) => { deliver = resolve; }));
    return { result, terminal: snapshot.terminal };
  } finally {
    off();
  }
}

function dictKindLabel(d: YomitanDictInfo, t: (key: string) => string): string {
  const parts: string[] = [];
  if (d.hasTerms) parts.push(t('settings.study.dict.kind.terms'));
  if (d.hasPitch) parts.push(t('settings.study.dict.kind.pitch'));
  if (d.hasIpa) parts.push(t('settings.study.dict.kind.ipa'));
  if (d.hasFreq) parts.push(t('settings.study.dict.kind.frequency'));
  return parts.length
    ? parts.join(t('settings.study.dict.kindJoin'))
    : t('settings.study.dict.kind.metadata');
}

/**
 * The same vocabulary for the SQLite source list, which stores one kind per row
 * instead of the legacy store's three booleans. It printed the raw column, so a
 * Russian UI read "日本語 · pitch · 107 978" with one untranslated word wedged
 * between two localized ones.
 *
 * An unmapped kind keeps printing the raw value: a source whose kind this build
 * does not know is better named in English than named wrongly.
 */
function sqliteDictKindLabel(kind: string, t: (key: string) => string): string {
  const key = DICTIONARY_KIND_LABEL_KEYS[kind];
  return key ? t(key) : kind;
}

/** Import / remove offline Yomitan dictionaries for the pop-up and mining. */
export function DictionarySettingsSection() {
  const { t, lang } = useT();
  const [dicts, setDicts] = useState<YomitanDictInfo[]>([]);
  const [sources, setSources] = useState<DictionarySourceInfo[]>([]);
  const [pairs, setPairs] = useState<DictionaryLanguagePair[]>([]);
  // Which language pair the source order below applies to. GLOBAL_PAIR is the
  // single `dictionaries.priority` order every pair falls back to.
  const [activePair, setActivePair] = useState<DictionaryLanguagePair>(GLOBAL_PAIR);
  const [pairOverridden, setPairOverridden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  /** The source whose relabel job is running; its select is locked meanwhile. */
  const [relabeling, setRelabeling] = useState<string | null>(null);
  const [exOffline, setExOffline] = useState<{
    installed: boolean;
    sentenceCount: number;
    updatedAt: number;
  } | null>(null);
  const [exImporting, setExImporting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  /** Load the source list for `pair`, plus whether that pair has its own order. */
  async function refreshSources(pair: DictionaryLanguagePair) {
    const scoped = isGlobalPair(pair) ? undefined : pair;
    const [importedSources, overridden] = await Promise.all([
      window.api.dictListSources(scoped),
      scoped ? window.api.dictPairHasOverride(scoped) : Promise.resolve(false),
    ]);
    setSources(importedSources);
    setPairOverridden(overridden);
  }

  async function refresh() {
    setLoading(true);
    try {
      const [list, availablePairs, offline] = await Promise.all([
        window.api.dictListYomitan(),
        window.api.dictListPairs(),
        window.api.examplesOfflineStatus(),
      ]);
      setDicts(list);
      setPairs(availablePairs);
      setExOffline(offline);
      // A pair can disappear when its last source is removed; fall back rather
      // than leaving the list showing an order nothing can produce any more.
      const stillThere = isGlobalPair(activePair)
        || availablePairs.some((pair) => pairKey(pair) === pairKey(activePair));
      const next = stillThere ? activePair : GLOBAL_PAIR;
      setActivePair(next);
      await refreshSources(next);
    } finally {
      setLoading(false);
    }
  }

  async function onSelectPair(key: string) {
    const next = pairs.find((pair) => pairKey(pair) === key) ?? GLOBAL_PAIR;
    setActivePair(next);
    setMsg(null);
    await refreshSources(next);
  }

  async function onMoveSource(id: string, direction: -1 | 1) {
    setMsg(null);
    const scoped = isGlobalPair(activePair) ? undefined : activePair;
    const next = await window.api.dictMoveSource(id, direction, scoped);
    setSources(next.sources);
    // The first move within a pair is what creates its own order, so this is
    // also what enables the reset control.
    if (next.ok && scoped) setPairOverridden(true);
    if (!next.ok && next.error !== 'edge') setMsg({ kind: 'err', text: t('settings.study.dict.updateFailed') });
  }

  /** The source being dragged in the global list, while a drag is in progress. */
  const [dragId, setDragId] = useState<string | null>(null);

  async function onDropSource(targetId: string) {
    const from = sources.findIndex((source) => source.id === dragId);
    const to = sources.findIndex((source) => source.id === targetId);
    setDragId(null);
    if (from < 0 || to < 0 || from === to || !isGlobalPair(activePair)) return;
    const api = window.api.dictSetSourceOrder;
    if (typeof api !== 'function') return;
    const next = [...sources];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setMsg(null);
    const result = await api(next.map((source) => source.id));
    setSources(result.sources);
    if (!result.ok) setMsg({ kind: 'err', text: t('settings.study.dict.updateFailed') });
  }

  async function onResetPair() {
    if (isGlobalPair(activePair)) return;
    setMsg(null);
    const next = await window.api.dictResetPairPriority(activePair);
    setSources(next.sources);
    setPairOverridden(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onImport() {
    setImporting(true);
    setMsg(null);
    const res = await window.api.dictImportYomitan();
    setImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: t('settings.study.dict.imported', {
          title: res.info?.title ?? t('settings.study.dict.fallbackTitle'),
        }),
      });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.importFailed') });
    }
  }

  async function onImportExamples() {
    setExImporting(true);
    setMsg(null);
    const res = await window.api.examplesImportOffline();
    setExImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: t('settings.study.dict.examples.indexed', { count: res.added }),
      });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.importFailed') });
    }
  }

  async function onRemove(id: string, title: string) {
    const ok = await confirmDialog({
      title: t('settings.study.dict.removeTitle'),
      message: t('settings.study.dict.removeMsg', { title }),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (!ok) return;
    setRemoving(id);
    setMsg(null);
    const res = await window.api.dictRemoveYomitan(id);
    setRemoving(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: t('settings.study.dict.removed') });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.removeFailed') });
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    setMsg(null);
    const res = await window.api.dictSetYomitanEnabled(id, enabled);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.updateFailed') });
  }

  async function onMove(id: string, dir: number) {
    setMsg(null);
    const res = await window.api.dictMoveYomitan(id, dir);
    if (res.ok) await refresh();
    else if (res.error !== 'Already at the edge.') {
      setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.reorderFailed') });
    }
  }

  async function onSetLang(id: string, glossLang: string) {
    setMsg(null);
    const res = await window.api.dictSetYomitanLang(id, glossLang);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? t('settings.study.dict.langFailed') });
  }

  async function updateSource(result: Promise<{ ok: boolean; error?: string; sources: DictionarySourceInfo[] }>) {
    setMsg(null);
    const next = await result;
    // Enable/remove are pair-agnostic and answer with the global order, so the
    // returned list would silently replace a pair's order with the global one.
    // Re-read for whichever pair is on screen instead.
    if (isGlobalPair(activePair)) setSources(next.sources);
    else await refreshSources(activePair);
    if (!next.ok && next.error !== 'edge') setMsg({ kind: 'err', text: t('settings.study.dict.updateFailed') });
  }

  // Not `updateSource`: relabelling headwords changes which pairs exist at all —
  // that is the point of it — so the pair selector and its active pair have to be
  // re-read, not only the source list.
  //
  // And not synchronous either: the relabel runs as a job on the import utility
  // process (7.2 s for 101,843 headwords), so the reply is a job id and the list
  // must not be re-read until that job reaches a terminal state — reading it
  // earlier would show the language the source still has and look like a control
  // that did nothing.
  async function onSetSourceLang(id: string, sourceLang: string) {
    setMsg(null);
    setRelabeling(id);
    try {
      const { result, terminal } = await queueDictionaryJob(() =>
        window.api.dictSetSourceLang(id, sourceLang));
      if (!result.ok) {
        setMsg({
          kind: 'err',
          text: result.error === 'busy'
            ? t('settings.study.dict.sources.langBusy')
            : t('settings.study.dict.sources.langFailed'),
        });
        return;
      }
      // `unchanged` means the source already had that language: nothing ran, and
      // nothing on screen is stale.
      if (result.unchanged) return;
      if (terminal && terminal.state !== 'committed') {
        setMsg({ kind: 'err', text: t('settings.study.dict.sources.langFailed') });
      }
      await refresh();
    } finally {
      setRelabeling(null);
    }
  }

  async function onRemoveSource(source: DictionarySourceInfo) {
    const ok = await confirmDialog({ title: t('settings.study.dict.removeTitle'), message: t('settings.study.dict.removeMsg', { title: source.title }), confirmLabel: t('common.remove'), danger: true });
    if (ok) await updateSource(window.api.dictRemoveSource(source.id));
  }

  return (
    <section className="set-section">
      <h2>{t('search.dictionary')}</h2>
      <p className="set-row-desc muted">
        {t('settings.study.dict.intro')}
      </p>

      <div className="set-profile-actions">
        <button className="btn primary" onClick={() => void onImport()} disabled={importing}>
          {importing ? t('settings.study.dict.importing') : t('settings.study.dict.import')}
        </button>
      </div>

      {loading && <div className="form-msg">{t('settings.study.dict.loading')}</div>}
      {!loading && dicts.length === 0 && (
        <div className="form-msg">{t('settings.study.dict.empty')}</div>
      )}
      {!loading && dicts.length > 0 && (
        <ul className="dict-manage-list">
          {dicts.map((d, i) => (
            <li className={`dict-manage-row ${d.enabled === false ? 'off' : ''}`} key={d.id}>
              <label className="dict-manage-toggle" title={t('settings.study.dict.useTitle')}>
                {/* The label wraps the box and carries no text, and a `title` on
                    an ancestor does not name the control — so every one of these
                    read as a bare "checkbox". Naming them all "Use this
                    dictionary" would still leave a list of identical controls,
                    so the title goes in too. */}
                <input
                  type="checkbox"
                  aria-label={`${t('settings.study.dict.useTitle')}: ${d.title}`}
                  checked={d.enabled !== false}
                  onChange={(e) => void onToggle(d.id, e.target.checked)}
                />
              </label>
              <div className="dict-manage-info">
                <div className="set-row-title">
                  {d.title}
                  {d.bundled && (
                    <span className="dict-badge bundled">{t('settings.study.dict.bundled')}</span>
                  )}
                </div>
                <div className="set-row-desc muted">
                  {dictKindLabel(d, t)}
                  {d.revision ? t('settings.study.dict.rev', { rev: d.revision }) : ''}
                  {d.hasTerms && !d.glossLangOverride && d.glossLangs?.length
                    ? t('settings.study.dict.langDetected', {
                        langs: d.glossLangs.join(', '),
                      })
                    : ''}
                </div>
              </div>
              <div className="dict-manage-actions">
                {d.hasTerms && (
                  <select
                    className="dict-lang-select"
                    title={t('settings.study.dict.langTitle')}
                    value={d.glossLangOverride ?? ''}
                    onChange={(e) => void onSetLang(d.id, e.target.value)}
                  >
                    <option value="">
                      {d.glossLangs?.length
                        ? t('settings.study.dict.langAutoWith', {
                            langs: d.glossLangs.join(', '),
                          })
                        : t('settings.study.dict.langAuto')}
                    </option>
                    {KNOWN_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn small"
                  title={t('settings.study.dict.higherPriority')} aria-label={t('settings.study.dict.higherPriority')}
                  disabled={i === 0}
                  onClick={() => void onMove(d.id, -1)}
                >
                  ↑
                </button>
                <button
                  className="btn small"
                  title={t('settings.study.dict.lowerPriority')} aria-label={t('settings.study.dict.lowerPriority')}
                  disabled={i === dicts.length - 1}
                  onClick={() => void onMove(d.id, 1)}
                >
                  ↓
                </button>
                {!d.bundled && (
                  <button
                    className="btn small"
                    disabled={removing === d.id}
                    onClick={() => void onRemove(d.id, d.title)}
                  >
                    {removing === d.id
                      ? t('settings.study.dict.removing')
                      : t('common.remove')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <DictionaryDisplaySettings />

      <h3 className="set-subhead">{t('settings.study.dict.sources.title')}</h3>
      <p className="set-row-desc muted">{t('settings.study.dict.sources.intro')}</p>
      {isGlobalPair(activePair) && sources.length > 1 && (
        <p className="set-row-desc muted">{t('dict3.settings.dragHint')}</p>
      )}
      {!loading && pairs.length > 0 && (
        <div className="set-row">
          <label className="set-row-title" htmlFor="dict-pair-order">
            {t('settings.study.dict.sources.pairLabel')}
          </label>
          <Select
            id="dict-pair-order"

            value={pairKey(activePair)}
            onChange={(event) => void onSelectPair(event.target.value)}
          >
            <option value={pairKey(GLOBAL_PAIR)}>{t('settings.study.dict.sources.pairGlobal')}</option>
            {pairs.map((pair) => (
              <option key={pairKey(pair)} value={pairKey(pair)}>
                {`${langNativeLabel(pair.sourceLang)} → ${langNativeLabel(pair.targetLang)}`}
              </option>
            ))}
          </Select>
        </div>
      )}
      {!loading && !isGlobalPair(activePair) && (
        <div className="set-row">
          <p className="set-row-desc muted">
            {pairOverridden
              ? t('settings.study.dict.sources.pairCustom')
              : t('settings.study.dict.sources.pairInherited')}
          </p>
          <button className="btn small" disabled={!pairOverridden} onClick={() => void onResetPair()}>
            {t('settings.study.dict.sources.pairReset')}
          </button>
        </div>
      )}
      {!loading && sources.length === 0 && <div className="form-msg">{t('settings.study.dict.sources.empty')}</div>}
      {!loading && sources.length > 0 && (
        <ul className="dict-manage-list">
          {sources.map((source, index) => (
            <li
              className={`dict-manage-row ${source.enabled ? '' : 'off'}${dragId === source.id ? ' is-dragging' : ''}`}
              key={source.id}
              // Drag to reorder the global order (a pair's own order keeps its
              // up/down buttons): the whole order is written in one call.
              draggable={isGlobalPair(activePair)}
              onDragStart={(event) => {
                setDragId(source.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                if (dragId && dragId !== source.id) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void onDropSource(source.id);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <label className="dict-manage-toggle" title={t('settings.study.dict.useTitle')}>
                <input type="checkbox" aria-label={`${t('settings.study.dict.useTitle')}: ${source.title}`} checked={source.enabled} onChange={(event) => void updateSource(window.api.dictSetSourceEnabled(source.id, event.target.checked))} />
              </label>
              <div className="dict-manage-info">
                <div className="set-row-title">{source.title}</div>
                <div className="set-row-desc muted">{langNativeLabel(source.sourceLang)} · {sqliteDictKindLabel(source.kind, t)} · {source.entryCount.toLocaleString(LANG_TAGS[lang])}</div>
                {relabeling === source.id && (
                  <div className="set-row-desc muted">{t('settings.study.dict.sources.langRunning')}</div>
                )}
                {(source.licence || source.attribution) && (
                  <div className="set-row-desc muted">
                    {[source.licence, source.attribution].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div className="dict-manage-actions">
                <select
                  className="dict-lang-select"
                  title={t('settings.study.dict.sources.langTitle')}
                  aria-label={t('settings.study.dict.sources.langTitle')}
                  value={source.sourceLang}
                  // One relabel at a time, and never a second one against the
                  // source a job is already rewriting: the queue would refuse it
                  // as `busy`, which is a worse answer than a locked control.
                  disabled={relabeling !== null}
                  onChange={(event) => void onSetSourceLang(source.id, event.target.value)}
                >
                  {/* An importer may have written a code this table does not carry
                      — StarDict writes 'und' when its archive declares nothing —
                      and a select whose value matches no option renders blank. */}
                  {(KNOWN_LANGS.some((known) => known.code === source.sourceLang)
                    ? KNOWN_LANGS
                    : [{ code: source.sourceLang, nativeLabel: langNativeLabel(source.sourceLang) }, ...KNOWN_LANGS]
                  ).map((known) => (
                    <option key={known.code} value={known.code}>
                      {known.nativeLabel}
                    </option>
                  ))}
                </select>
                <button className="btn small" title={t('settings.study.dict.higherPriority')} aria-label={t('settings.study.dict.higherPriority')} disabled={index === 0} onClick={() => void onMoveSource(source.id, -1)}>↑</button>
                <button className="btn small" title={t('settings.study.dict.lowerPriority')} aria-label={t('settings.study.dict.lowerPriority')} disabled={index === sources.length - 1} onClick={() => void onMoveSource(source.id, 1)}>↓</button>
                <button className="btn small" onClick={() => void onRemoveSource(source)}>{t('common.remove')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="set-subhead">{t('settings.study.dict.examples.title')}</h3>
      <p className="set-row-desc muted">
        {t('settings.study.dict.examples.intro')}{' '}
        <a href="https://tatoeba.org/en/downloads" target="_blank" rel="noreferrer">
          tatoeba.org/downloads
        </a>
      </p>
      <div className="set-profile-actions">
        <button className="btn" onClick={() => void onImportExamples()} disabled={exImporting}>
          {exImporting
            ? t('settings.study.dict.importing')
            : t('settings.study.dict.examples.import')}
        </button>
      </div>
      {!loading && exOffline && (
        <div className="form-msg">
          {exOffline.sentenceCount > 0
            ? t('settings.study.dict.examples.count', { count: exOffline.sentenceCount })
            : t('settings.study.dict.examples.empty')}
        </div>
      )}

      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

function ClipboardSettingsSection() {
  const { t } = useT();
  const [settings, setSettings] = useState(loadClipboardSettings);
  return (
    <section className="set-section">
      <h2>{t('settings.clipboard.title')}</h2>
      <p className="set-row-desc muted">{t('settings.clipboard.intro')}</p>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.maxSize')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.maxSize.desc')}</div>
        </div>
        <input
          type="number"
          min={10}
          max={2000}
          className="set-number"
          value={settings.maxSize}
          onChange={(e) => setSettings(saveClipboardSettings({ maxSize: Math.max(10, Number(e.target.value) || 200) }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.dedupe')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.dedupe.desc')}</div>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          aria-label={t('settings.clipboard.dedupe')}
          checked={settings.dedupeConsecutive}
          onChange={(e) => setSettings(saveClipboardSettings({ dedupeConsecutive: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.clearOnExit')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.clearOnExit.desc')}</div>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          aria-label={t('settings.clipboard.clearOnExit')}
          checked={settings.clearOnExit}
          onChange={(e) => setSettings(saveClipboardSettings({ clearOnExit: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.clipboard.monitoring')}</div>
          <div className="set-row-desc muted">{t('settings.clipboard.monitoring.desc')}</div>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          aria-label={t('settings.clipboard.monitoring')}
          checked={settings.monitoringEnabled}
          onChange={(e) => setSettings(saveClipboardSettings({ monitoringEnabled: e.target.checked }))}
        />
      </div>
    </section>
  );
}

function PrivacySettingsSection() {
  const { t } = useT();
  const [consent, setConsent] = useState<'yes' | 'no' | null>(() => {
    const v = localStorage.getItem(TELEMETRY_CONSENT_KEY);
    return v === 'yes' || v === 'no' ? v : null;
  });

  const share = consent === 'yes';

  const onToggle = (next: boolean) => {
    const value = next ? 'yes' : 'no';
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, value);
      if (next) void sendTelemetryPingIfNeeded();
    } catch {
      /* storage unavailable */
    }
    setConsent(value);
  };

  return (
    <section className="set-section">
      <h2>{t('settings.privacy.title')}</h2>
      <p className="set-row-desc muted">{t('settings.privacy.intro')}</p>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">{t('settings.privacy.heatmap')}</div>
          <div className="set-row-desc muted">{t('settings.privacy.heatmap.desc')}</div>
        </div>
        <input
          type="checkbox"
          role="switch"
          className="ui-switch"
          aria-label={t('settings.privacy.heatmap')}
          checked={share}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>
    </section>
  );
}

export default function SettingsView() {
  const { t } = useT();
  const [zoom, setZoomState] = useState<number>(getZoom());

  useEffect(() => onZoomChanged(setZoomState), []);

  const pct = Math.round(zoom * 100);
  const atMin = zoom <= ZOOM_MIN + 1e-9;
  const atMax = zoom >= ZOOM_MAX - 1e-9;

  return (
    <div className="settings-view">
      <div className="view-head">
        <div>
          <h1>{t('settings.appTitle')}</h1>
          <p className="muted">{t('settings.legacy.intro')}</p>
        </div>
      </div>

      <ProfileSettingsSection />

      <DictionarySettingsSection />

      <ShortcutSettings />

      <ClipboardSettingsSection />

      <PrivacySettingsSection />

      <section className="set-section">
        <h2>{t('settings.a11y.title')}</h2>

        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-title">{t('settings.a11y.zoom.title')}</div>
            <div className="set-row-desc muted">{t('settings.a11y.zoom.desc')}</div>
          </div>
          <div className="zoom-control">
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={atMin}
              aria-label={t('settings.a11y.zoom.decrease')}
            >
              −
            </button>
            <span className="zoom-val">{pct}%</span>
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={atMax}
              aria-label={t('settings.a11y.zoom.increase')}
            >
              +
            </button>
            <button
              className="btn small"
              onClick={() => setZoom(ZOOM_DEFAULT)}
              disabled={pct === Math.round(ZOOM_DEFAULT * 100)}
            >
              {t('common.reset')}
            </button>
          </div>
        </div>

        <input
          className="set-range"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t('settings.a11y.zoom.aria')}
        />
      </section>

      <section className="set-section">
        <h2>{t('settings.readerTip.title')}</h2>
        <p className="set-row-desc muted">{t('settings.readerTip.body')}</p>
      </section>
    </div>
  );
}
