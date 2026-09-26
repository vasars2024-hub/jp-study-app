// Source Manager — which sites the scraper tries, in what order, and what it
// falls back to when one fails.
//
// This is the page the whole "where do I get episodes from" question lives on.
// The order here IS the priority: rank follows position, so there is one
// source of truth rather than a hand-edited number that can disagree with the
// list you are looking at.

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import { Button, IconButton, Toggle } from '../../ui';
import ScrCard from '../ScrCard';
import { scrollIntoViewReliably } from '../../../utils/reliableScroll';
import Sparkline from '../Sparkline';
import StatusDot from '../StatusDot';
import { Pill } from '../result/Pill';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import { sx, sxn, sxs } from '../strings';
import { localizeScraperMessage, sourceKindText, tr } from '../localize';
import { loadVerifiedSitesDocument } from '../../../verifiedSitesStore';
import { verifiedSiteForSource, type VerifiedSitesDocument } from '../../../../shared/verifiedSites';
import {
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import { resolveScraperSettings } from '../../../../shared/scraperSettings';
import {
  SCRAPER_SOURCE_MODES,
  type ScraperSourceEntry,
  type ScraperSourceKind,
  type ScraperSourceMode,
} from '../../../../shared/scraperSourceSettings';
import type { SourceStatus } from '../../../../shared/scraperResults';
import type { AcquisitionProviderInventory } from '../../../../shared/acquisition';
import { resolveSourceHandoff } from '../data/sourceHandoff';

/** Labels come from `sourceKindText` at render, so they follow the UI language. */
const KIND_TABS: (ScraperSourceKind | 'all')[] = ['all', 'streaming', 'torrent', 'metadata', 'subtitles'];

const HEALTH_TONE = {
  ok: 'good',
  degraded: 'warn',
  blocked: 'bad',
  offline: 'bad',
  unknown: 'neutral',
} as const;

const INVENTORY_TONE = {
  ready: 'good',
  disabled: 'neutral',
  offline: 'bad',
  error: 'bad',
} as const;

/**
 * The stored source list, seeded from the discovered sources the first time
 * this page is opened. Without the seed the page would open empty on a fresh
 * install, which reads as broken rather than as "nothing configured yet".
 */
function seedEntries(discovered: SourceStatus[], sites: VerifiedSitesDocument): ScraperSourceEntry[] {
  return discovered.map((source, index) => ({
    id: source.id,
    label: source.label,
    host: source.host,
    kind: source.kind,
    enabled: source.enabled,
    priority: index + 1,
    fallbackIds: [],
    // Linked to the Verified Sites record on the same host, when there is one.
    verifiedSiteId: verifiedSiteForSource(sites, { host: source.host, verifiedSiteId: '' })?.id ?? '',
    requiresAuth: source.requiresAuth,
    supportsSubtitles: source.supportsSubtitles,
    health: source.health,
    lastCheckedAt: null,
    notes: '',
  }));
}

export default function SourceManagerPage() {
  const ctl = useScraper();
  const port = useScraperPort();

  const [doc, setDoc] = useState(() => loadScraperSettingsDocument());
  const [discovered, setDiscovered] = useState<SourceStatus[]>([]);
  const [inventory, setInventory] = useState<AcquisitionProviderInventory | null>(null);
  const [kind, setKind] = useState<ScraperSourceKind | 'all'>('all');
  const [probing, setProbing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [handoffSourceId, setHandoffSourceId] = useState<string | null>(null);
  const [probeNotice, setProbeNotice] = useState('');
  // Read once per visit: Verified Sites is edited in Settings, not here.
  const [verifiedSites] = useState(() => loadVerifiedSitesDocument());
  const sourceRefs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => onScraperSettingsChanged(setDoc), []);

  useEffect(() => {
    void port.listSources().then(setDiscovered, () => undefined);
    void port.listAcquisitionProviders().then(setInventory, () => undefined);
  }, [port]);

  const settings = useMemo(() => resolveScraperSettings(doc), [doc]);
  const stored = settings.sources.entries;

  // Seed once, when the profile has no sources but the port knows some.
  useEffect(() => {
    if (stored.length || !discovered.length) return;
    const entries = seedEntries(discovered, verifiedSites);
    setDoc(
      updateActiveScraperSettings({
        sources: { entries, order: entries.map((e) => e.id) },
      }),
    );
  }, [stored.length, discovered, verifiedSites]);

  const healthById = useMemo(
    () => new Map(discovered.map((s) => [s.id, s])),
    [discovered],
  );

  const visible = useMemo(
    () => (kind === 'all' ? stored : stored.filter((entry) => entry.kind === kind)),
    [stored, kind],
  );

  useEffect(() => {
    if (!ctl.sourceId) return;
    const availableIds = (stored.length ? stored : discovered).map((source) => source.id);
    if (!availableIds.length) return;
    const handoff = resolveSourceHandoff(ctl.sourceId, availableIds);
    ctl.clearSource();
    if (!handoff) return;
    setKind('all');
    setExpanded(handoff);
    setHandoffSourceId(handoff);
  }, [ctl.sourceId, ctl.clearSource, stored, discovered]);

  useEffect(() => {
    if (!handoffSourceId) return;
    let cancelScroll: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      const row = sourceRefs.current.get(handoffSourceId);
      cancelScroll = scrollIntoViewReliably(row, { block: 'center' });
      row?.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => setHandoffSourceId(null), 2_200);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      cancelScroll?.();
    };
  }, [handoffSourceId]);

  const patchSources = (entries: ScraperSourceEntry[]) => {
    setDoc(
      updateActiveScraperSettings({
        sources: { entries, order: entries.map((e) => e.id) },
      }),
    );
  };

  const move = (id: string, delta: number) => {
    const index = stored.findIndex((e) => e.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= stored.length) return;
    const reordered = [...stored];
    const [entry] = reordered.splice(index, 1);
    reordered.splice(next, 0, entry);
    patchSources(reordered);
  };

  const toggleEnabled = (id: string) => {
    patchSources(stored.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
  };

  const toggleFallback = (id: string, fallbackId: string) => {
    patchSources(
      stored.map((entry) => {
        if (entry.id !== id) return entry;
        const has = entry.fallbackIds.includes(fallbackId);
        return {
          ...entry,
          fallbackIds: has
            ? entry.fallbackIds.filter((f) => f !== fallbackId)
            : [...entry.fallbackIds, fallbackId],
        };
      }),
    );
  };

  const probe = async (id: string) => {
    setProbing(id);
    setProbeNotice('');
    try {
      const status = await port.probeSource(id);
      setDiscovered((prev) => prev.map((s) => (s.id === id ? status : s)));
      patchSources(
        stored.map((e) => (e.id === id ? { ...e, health: status.health } : e)),
      );
    } catch (error) {
      setProbeNotice(sxs('sources.testFailed', error instanceof Error ? error.message : String(error)));
    } finally {
      setProbing(null);
    }
  };

  const linkVerifiedSite = (id: string, siteId: string) => {
    patchSources(stored.map((entry) => (entry.id === id ? { ...entry, verifiedSiteId: siteId } : entry)));
  };

  const setMode = (mode: ScraperSourceMode) => {
    setDoc(updateActiveScraperSettings({ sources: { mode } }));
  };

  const mode = settings.sources.mode;
  const activeCount = stored.filter((e) => e.enabled).length;

  return (
    <div className="scr-page scr-page--sources">
      <header className="scr-page-head">
        <div>
          <h1 className="scr-page-title">
            {sx('page.sources.title')}
            <StatusDot id="page.sources" className="scr-page-dot" />
          </h1>
          <p className="scr-page-sub">{sx('page.sources.subtitle')}</p>
        </div>
        <div className="scr-page-actions">
          <Button size="sm" onClick={() => ctl.openDrawer('sources')}>
            {sx('sources.settings')}
          </Button>
        </div>
      </header>

      <ScrCard
        id="source-mode"
        title={sx('sources.mode')}
        description={sx('sources.modeDesc')}
        statusId="set.sources"
      >
        <div className="ui-segmented" role="group" aria-label={sx('sources.mode')}>
          {SCRAPER_SOURCE_MODES.map((value) => (
            <button
              key={value}
              type="button"
              // ui.css styles the selected segment via .active / .selected /
              // aria-selected — not .is-active, which this app uses elsewhere.
              className={`ui-segmented__item${mode === value ? ' active' : ''}`}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'streaming'
                ? sx('sources.modeStreaming')
                : value === 'torrent'
                  ? sx('sources.modeTorrent')
                  : sx('sources.modeBoth')}
            </button>
          ))}
        </div>
        <p className="scr-muted">
          {mode === 'streaming'
            ? sx('sources.modeStreamingHint')
            : mode === 'torrent'
              ? sx('sources.modeTorrentHint')
              : sx('sources.modeBothHint')}
        </p>
      </ScrCard>

      <ScrCard
        id="provider-inventory"
        title={sx('sources.providers')}
        description={sx('sources.providersDesc')}
        statusId="page.sources.providers"
        trailing={inventory && (
          <Pill tone={INVENTORY_TONE[inventory.state]}>
            {sx(`sources.providerState.${inventory.state}` as never)}
          </Pill>
        )}
      >
        {inventory ? (
          <>
            <div className="scr-toolbar">
              <span>{sxn('sources.providerCount', inventory.providers.length)}</span>
              <span className="scr-muted">{localizeScraperMessage(inventory.message)}</span>
            </div>
            <ul className="scr-source-list">
              {inventory.providers.map((provider) => (
                <li key={`${provider.kind}:${provider.id}`} className="scr-source">
                  <div className="scr-source-row">
                    <div className="scr-source-main">
                      <span className="scr-source-label">{provider.label}</span>
                      <span className="scr-source-host">{provider.id}</span>
                    </div>
                    <Pill tone="outline">
                      {sx(`sources.providerKind.${provider.kind}` as never)}
                    </Pill>
                    <Pill tone="neutral">{provider.language || '—'}</Pill>
                    {provider.capabilities.map((capability) => (
                      <Pill key={capability} tone="neutral">
                        {sx(`sources.providerCapability.${capability}` as never)}
                      </Pill>
                    ))}
                    {provider.supportsDub && (
                      <Pill tone="good">{sx('sources.providerDub')}</Pill>
                    )}
                    {provider.servers && provider.servers.length > 0 && (
                      <Pill tone="outline">
                        {sxn('sources.providerServers', provider.servers.length)}
                      </Pill>
                    )}
                  </div>
                </li>
              ))}
              {!inventory.providers.length && (
                <li className="scr-muted">{sx('sources.providersEmpty')}</li>
              )}
            </ul>
          </>
        ) : (
          <p className="scr-muted">{sx('sources.testing')}</p>
        )}
      </ScrCard>

      <ScrCard
        id="source-order"
        title={sx('sources.chain')}
        description={sx('sources.chainDesc')}
        statusId="page.sources"
        trailing={<span>{sxn('sources.activeCount', activeCount)}</span>}
      >
        <div className="scr-kind-tabs" role="tablist">
          {KIND_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={kind === tab}
              className={`scr-chip${kind === tab ? ' is-on' : ''}`}
              onClick={() => setKind(tab)}
            >
              {sourceKindText(tab)}
              <span className="scr-chip-count">
                {tab === 'all' ? stored.length : stored.filter((e) => e.kind === tab).length}
              </span>
            </button>
          ))}
        </div>

        <ol className="scr-source-list">
          {visible.map((entry) => {
            const live = healthById.get(entry.id);
            const health = live?.health ?? entry.health;
            const isOpen = expanded === entry.id;
            const rank = stored.findIndex((e) => e.id === entry.id);
            const linkedSite = verifiedSiteForSource(verifiedSites, entry);
            return (
              <li
                key={entry.id}
                ref={(node) => {
                  if (node) sourceRefs.current.set(entry.id, node);
                  else sourceRefs.current.delete(entry.id);
                }}
                tabIndex={-1}
                className={`scr-source${entry.enabled ? '' : ' is-off'}${
                  handoffSourceId === entry.id ? ' is-handoff' : ''
                }`}
              >
                <div className="scr-source-row">
                  <span className="scr-source-rank">{rank + 1}</span>

                  {/* Reordering is keyboard-first. Drag is a convenience on top
                      of these, never the only way to change the order. */}
                  <div className="scr-source-move">
                    <IconButton
                      label={tr('scrApp.r2.sources.moveUp', { name: entry.label })}
                      size="sm"
                      disabled={rank === 0 || kind !== 'all'}
                      onClick={() => move(entry.id, -1)}
                    >
                      <Icon name="chevron" size={11} />
                    </IconButton>
                    <IconButton
                      label={tr('scrApp.r2.sources.moveDown', { name: entry.label })}
                      size="sm"
                      disabled={rank === stored.length - 1 || kind !== 'all'}
                      onClick={() => move(entry.id, 1)}
                    >
                      <Icon name="chevron" size={11} />
                    </IconButton>
                  </div>

                  <Toggle
                    checked={entry.enabled}
                    aria-label={tr('scrApp.r2.sources.enable', { name: entry.label })}
                    onChange={() => toggleEnabled(entry.id)}
                  />

                  <div className="scr-source-main">
                    <span className="scr-source-label">{entry.label}</span>
                    <span className="scr-source-host">{entry.host}</span>
                  </div>

                  <Pill tone="outline">{sourceKindText(entry.kind)}</Pill>
                  <Pill tone={HEALTH_TONE[health]}>{sx(`health.${health}` as never)}</Pill>
                  <span className="scr-source-latency">
                    {live?.latencyMs ? `${live.latencyMs} ms` : '—'}
                  </span>
                  {live && <Sparkline values={live.history} width={70} height={20} />}
                  <Pill tone={entry.supportsSubtitles ? 'good' : 'neutral'}>
                    {entry.supportsSubtitles ? sx('sources.subsYes') : sx('sources.subsNo')}
                  </Pill>
                  {entry.requiresAuth && <Pill tone="warn">{sx('sources.auth')}</Pill>}
                  {linkedSite && (
                    <Pill
                      tone={linkedSite.status === 'verified' ? 'good' : linkedSite.status === 'broken' ? 'bad' : 'outline'}
                      title={sxs('sources.verifiedSiteReliability', String(linkedSite.reliabilityScore))}
                    >
                      {sxs('sources.verifiedSiteLinked', linkedSite.name)}
                    </Pill>
                  )}

                  <Button
                    size="sm"
                    disabled={probing === entry.id}
                    onClick={() => void probe(entry.id)}
                  >
                    {probing === entry.id ? sx('sources.testing') : sx('sources.test')}
                  </Button>
                  <IconButton
                    label={tr('scrApp.r2.sources.fallbacksFor', { name: entry.label })}
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                  >
                    <Icon name="chevron" size={12} />
                  </IconButton>
                </div>

                {isOpen && (
                  <div className="scr-source-fallbacks">
                    <p className="scr-muted">{sx('sources.fallbackHint')}</p>
                    <div className="scr-fallback-chips">
                      {stored
                        .filter((other) => other.id !== entry.id && other.kind === entry.kind)
                        .map((other) => (
                          <button
                            key={other.id}
                            type="button"
                            className={`scr-chip${entry.fallbackIds.includes(other.id) ? ' is-on' : ''}`}
                            aria-pressed={entry.fallbackIds.includes(other.id)}
                            onClick={() => toggleFallback(entry.id, other.id)}
                          >
                            {other.label}
                          </button>
                        ))}
                      {stored.filter((o) => o.id !== entry.id && o.kind === entry.kind).length === 0 && (
                        <p className="scr-muted">{sx('sources.noFallbackCandidates')}</p>
                      )}
                    </div>
                    {entry.fallbackIds.length > 0 && (
                      <p className="scr-muted">
                        {sx('sources.fallbackOrder')}: {entry.fallbackIds.join(' → ')}
                      </p>
                    )}
                    {/* Which Verified Sites record this source is. Matched by
                        host until the user picks one; the choice is kept on
                        the source, so a later host change does not lose it. */}
                    <label className="scr-result-inline-filter">
                      <span>{sx('sources.verifiedSite')}</span>
                      <select
                        className="scr-input"
                        value={linkedSite?.id ?? ''}
                        onChange={(event) => linkVerifiedSite(entry.id, event.target.value)}
                      >
                        <option value="">{sx('sources.verifiedSiteNone')}</option>
                        {verifiedSites.sites.map((site) => (
                          <option key={site.id} value={site.id}>{site.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
          {!visible.length && <p className="scr-muted">{sx('sources.empty')}</p>}
        </ol>

        {kind !== 'all' && <p className="scr-muted">{sx('sources.reorderAllOnly')}</p>}
        {probeNotice && <p className="scr-action-notice is-bad" role="status">{probeNotice}</p>}
      </ScrCard>
    </div>
  );
}
