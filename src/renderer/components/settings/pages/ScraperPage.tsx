import { useEffect, useMemo, useState } from 'react';
import {
  applyScraperPreset,
  createScraperProfile,
  deleteScraperProfile,
  patchScraperProfile,
  removeScraperSiteOverride,
  resetScraperProfile,
  rollbackScraperProfile,
  setScraperSiteOverride,
  updateScraperProfileDetails,
  type ScraperSettings,
  type ScraperSettingsDocument,
} from '../../../../shared/scraperSettings';
import {
  exportScraperSettings,
  importScraperSettings,
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  saveScraperSettingsDocument,
} from '../../../scraperSettingsStore';
import SettingsCard from '../SettingsCard';
import ConnectionProfilesPanel from './ConnectionProfilesPanel';
import MediaProviderPanel from './MediaProviderPanel';
import MalSyncPanel from './MalSyncPanel';
import MediaTrackingManager from './MediaTrackingManager';
import UnifiedSearchPanel from './UnifiedSearchPanel';
import VerifiedSitesManager from './VerifiedSitesManager';
import VideoServerProfilesManager from './VideoServerProfilesManager';
import SubtitleProviderPanel from './SubtitleProviderPanel';
import ExternalPlayerPanel from './ExternalPlayerPanel';

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="os-set-toggle-row">
      <span>
        <strong>{label}</strong>
        <small className="muted">{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="field-row" style={{ marginBottom: 0 }}>
      <label>
        {label}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isFinite(next)) onChange(next);
          }}
        />
      </label>
    </div>
  );
}

export default function ScraperPage() {
  const [document, setDocument] = useState<ScraperSettingsDocument>(loadScraperSettingsDocument);
  const [query, setQuery] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [proxyText, setProxyText] = useState('');
  const [rotationText, setRotationText] = useState('');
  const [domainLimitsText, setDomainLimitsText] = useState('');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [siteOverride, setSiteOverride] = useState('');

  const active = useMemo(
    () => document.profiles.find((profile) => profile.id === document.activeProfileId) ?? document.profiles[0],
    [document],
  );
  const settings = active?.settings;

  useEffect(() => onScraperSettingsChanged(setDocument), []);
  useEffect(() => {
    if (!settings) return;
    setHeadersText(JSON.stringify(settings.network.headers, null, 2));
    setProxyText(settings.network.proxyUrl);
    setRotationText(settings.network.proxyRotation.join('\n'));
    setDomainLimitsText(Object.entries(settings.safety.domainRateLimits)
      .map(([domain, limit]) => `${domain}: ${limit}`)
      .join('\n'));
  }, [active?.id, active?.updatedAt, settings]);

  if (!active || !settings) return null;

  const commit = (next: ScraperSettingsDocument) => {
    setMessage(null);
    setDocument(saveScraperSettingsDocument(next));
  };
  const patch = (next: {
    network?: Partial<ScraperSettings['network']>;
    browser?: Partial<ScraperSettings['browser']>;
    session?: Partial<ScraperSettings['session']>;
    cache?: Partial<ScraperSettings['cache']>;
    safety?: Partial<ScraperSettings['safety']>;
    authentication?: Partial<ScraperSettings['authentication']>;
    extraction?: Partial<ScraperSettings['extraction']>;
    episodeProcessing?: Partial<ScraperSettings['episodeProcessing']>;
  }) => commit(patchScraperProfile(document, active.id, next));
  const matches = (terms: string) => {
    const needle = query.trim().toLowerCase();
    return !needle || terms.toLowerCase().includes(needle);
  };
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  } as const;

  return (
    <>
      <div className="field-row">
        <label htmlFor="scraper-settings-search">Find a scraper setting</label>
        <input
          id="scraper-settings-search"
          type="search"
          value={query}
          placeholder="Network, proxy, browser, session"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {matches('connection profiles inheritance presets monitoring logging diagnostics queue health check comparison') && <ConnectionProfilesPanel />}
      {matches('unified search multi source tachiyomi providers parallel results coordinator') && <UnifiedSearchPanel />}
      {matches('media providers identity tracking drama movie capability library offline') && <MediaProviderPanel />}
      {matches('tracking management totals episodes corrections ratings notes favorites preferences offline') && <MediaTrackingManager />}
      {matches('myanimelist mal sync account connect authenticate oauth anime list episodes progress status') && <MalSyncPanel />}
      {matches('verified sites manager source database status compatibility import export') && <VerifiedSitesManager />}
      {matches('video server profiles preferred ordering website provider reliability') && <VideoServerProfilesManager />}
      {matches('subtitle subtitles language provider quality timing') && <SubtitleProviderPanel />}
      {matches('external player playback vlc mpv iina handoff subtitles resume') && <ExternalPlayerPanel />}

      {matches('profile preset fast balanced thorough') && (
        <SettingsCard
          id="scraper-profiles"
          title="Profiles and presets"
          description="Begin with a safe preset. Any manual change marks the current profile as custom."
          trailing={<span className="os-set-adv-badge">{active.preset}</span>}
        >
          <div className="field-row">
            <label htmlFor="scraper-profile">Active profile</label>
            <select
              id="scraper-profile"
              className="media-model-select"
              value={document.activeProfileId}
              onChange={(event) => commit({ ...document, activeProfileId: event.currentTarget.value })}
            >
              {document.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </div>
          <div className="sp-seg" role="group" aria-label="Scraper presets">
            {(['fast', 'balanced', 'thorough'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className={`sp-seg-btn ${active.preset === preset ? 'active' : ''}`}
                onClick={() => commit(applyScraperPreset(document, active.id, preset))}
              >
                {preset[0].toUpperCase() + preset.slice(1)}
              </button>
            ))}
          </div>
          <div className="field-row">
            <label htmlFor="scraper-profile-name">Profile name</label>
            <input key={active.id} id="scraper-profile-name" defaultValue={active.name} onBlur={(event) => { try { commit(updateScraperProfileDetails(document, active.id, { name: event.currentTarget.value })); } catch (error) { event.currentTarget.value = active.name; setMessage(error instanceof Error ? error.message : 'Could not rename profile.'); } }} />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-profile-description">Description</label>
            <input id="scraper-profile-description" value={active.description} onChange={(event) => commit(updateScraperProfileDetails(document, active.id, { description: event.currentTarget.value }))} />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-new-profile">New profile</label>
            <input id="scraper-new-profile" value={newProfileName} placeholder="Profile name" onChange={(event) => setNewProfileName(event.currentTarget.value)} />
            <button type="button" onClick={() => { try { commit(createScraperProfile(document, newProfileName)); setNewProfileName(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create profile.'); } }}>Clone active</button>
          </div>
          <div className="sp-seg" role="group" aria-label="Profile actions">
            <button type="button" className="sp-seg-btn" onClick={() => commit(resetScraperProfile(document, active.id))}>Reset</button>
            <button type="button" className="sp-seg-btn" disabled={document.profiles.length <= 1} onClick={() => commit(deleteScraperProfile(document, active.id))}>Delete</button>
          </div>
          <div className="field-row">
            <label htmlFor="scraper-site-override">Per-site configuration</label>
            <input id="scraper-site-override" value={siteOverride} placeholder="example.org" onChange={(event) => setSiteOverride(event.currentTarget.value)} />
            <button type="button" onClick={() => { try { commit(setScraperSiteOverride(document, siteOverride, {}, active.id)); setSiteOverride(''); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add site.'); } }}>Add current settings</button>
          </div>
          {Object.entries(document.siteOverrides).map(([site, override]) => (
            <div className="field-row" key={site}>
              <span><strong>{site}</strong><small className="muted">{override.profileId ? `Inherits ${document.profiles.find((profile) => profile.id === override.profileId)?.name ?? 'profile'}` : 'Saved settings snapshot'}</small></span>
              <button type="button" onClick={() => commit(removeScraperSiteOverride(document, site))}>Remove</button>
            </div>
          ))}
          {message && <p className="muted" role="status">{message}</p>}
        </SettingsCard>
      )}

      {matches('network user agent headers cookie proxy retry timeout concurrency delay redirect ssl') && (
        <SettingsCard
          id="scraper-network"
          title="Network"
          description="Request identity, pacing, retries, proxies, and transport safeguards."
        >
          <div className="field-row">
            <label htmlFor="scraper-user-agent">Custom User-Agent</label>
            <input
              id="scraper-user-agent"
              value={settings.network.userAgent}
              placeholder="Use the browser default"
              spellCheck={false}
              onChange={(event) => patch({ network: { userAgent: event.currentTarget.value } })}
            />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-proxy">HTTP, HTTPS, or SOCKS5 proxy</label>
            <input
              id="scraper-proxy"
              value={proxyText}
              placeholder="https://proxy.example:8080"
              spellCheck={false}
              onChange={(event) => setProxyText(event.currentTarget.value)}
              onBlur={() => patch({ network: { proxyUrl: proxyText } })}
            />
          </div>
          <div style={gridStyle}>
            <NumberField
              label="Retry attempts"
              value={settings.network.retryAttempts}
              min={0}
              max={12}
              onChange={(retryAttempts) => patch({ network: { retryAttempts } })}
            />
            <NumberField
              label="Retry delay (ms)"
              value={settings.network.retryDelayMs}
              min={0}
              max={120_000}
              step={100}
              onChange={(retryDelayMs) => patch({ network: { retryDelayMs } })}
            />
            <NumberField
              label="Request timeout (ms)"
              value={settings.network.requestTimeoutMs}
              min={1_000}
              max={300_000}
              step={1_000}
              onChange={(requestTimeoutMs) => patch({ network: { requestTimeoutMs } })}
            />
            <NumberField
              label="Concurrent requests"
              value={settings.network.concurrentRequests}
              min={1}
              max={32}
              onChange={(concurrentRequests) => patch({ network: { concurrentRequests } })}
            />
            <NumberField
              label="Minimum random delay (ms)"
              value={settings.network.randomDelayMinMs}
              min={0}
              max={120_000}
              step={50}
              onChange={(randomDelayMinMs) => patch({ network: { randomDelayMinMs } })}
            />
            <NumberField
              label="Maximum random delay (ms)"
              value={settings.network.randomDelayMaxMs}
              min={0}
              max={120_000}
              step={50}
              onChange={(randomDelayMaxMs) => patch({ network: { randomDelayMaxMs } })}
            />
          </div>
          <Toggle
            label="Follow redirects"
            description="Allow normal HTTP redirects during scraping."
            checked={settings.network.followRedirects}
            onChange={(followRedirects) => patch({ network: { followRedirects } })}
          />
          <Toggle
            label="Verify SSL certificates"
            description="Keep enabled unless diagnosing a trusted local endpoint."
            checked={settings.network.verifySsl}
            onChange={(verifySsl) => patch({ network: { verifySsl } })}
          />
          <div className="field-row">
            <label htmlFor="scraper-headers">Custom headers (JSON object)</label>
            <textarea
              id="scraper-headers"
              value={headersText}
              spellCheck={false}
              onChange={(event) => setHeadersText(event.currentTarget.value)}
              onBlur={() => {
                try {
                  const parsed = JSON.parse(headersText) as unknown;
                  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Headers must be a JSON object.');
                  }
                  patch({ network: { headers: parsed as Record<string, string> } });
                  setMessage('Custom headers saved.');
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Headers are not valid JSON.');
                }
              }}
            />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-cookie">Cookie header</label>
            <textarea
              id="scraper-cookie"
              value={settings.network.cookieHeader}
              spellCheck={false}
              placeholder="Use only for a session you authenticated manually"
              onChange={(event) => patch({ network: { cookieHeader: event.currentTarget.value } })}
            />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-proxy-rotation">Proxy rotation (one URL per line)</label>
            <textarea
              id="scraper-proxy-rotation"
              value={rotationText}
              spellCheck={false}
              onChange={(event) => setRotationText(event.currentTarget.value)}
              onBlur={() => patch({
                network: {
                  proxyRotation: rotationText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
                },
              })}
            />
          </div>
        </SettingsCard>
      )}

      {matches('browser chromium firefox headless visible viewport javascript network idle scroll script') && (
        <SettingsCard
          id="scraper-browser"
          title="Browser automation"
          description="Configure the browser only for sources that require rendered pages."
        >
          <div style={gridStyle}>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <label htmlFor="scraper-engine">Browser engine</label>
              <select
                id="scraper-engine"
                className="media-model-select"
                value={settings.browser.engine}
                onChange={(event) => patch({ browser: { engine: event.currentTarget.value as 'chromium' | 'firefox' } })}
              >
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
              </select>
            </div>
            <NumberField
              label="Viewport width"
              value={settings.browser.viewportWidth}
              min={320}
              max={7_680}
              onChange={(viewportWidth) => patch({ browser: { viewportWidth } })}
            />
            <NumberField
              label="Viewport height"
              value={settings.browser.viewportHeight}
              min={240}
              max={4_320}
              onChange={(viewportHeight) => patch({ browser: { viewportHeight } })}
            />
            <NumberField
              label="JavaScript wait (ms)"
              value={settings.browser.javascriptWaitMs}
              min={0}
              max={300_000}
              step={500}
              onChange={(javascriptWaitMs) => patch({ browser: { javascriptWaitMs } })}
            />
            <NumberField
              label="Scroll speed (px/s)"
              value={settings.browser.scrollSpeedPxPerSecond}
              min={50}
              max={5_000}
              step={50}
              onChange={(scrollSpeedPxPerSecond) => patch({ browser: { scrollSpeedPxPerSecond } })}
            />
            <NumberField
              label="Scroll passes"
              value={settings.browser.scrollPasses}
              min={1}
              max={30}
              onChange={(scrollPasses) => patch({ browser: { scrollPasses } })}
            />
          </div>
          <Toggle
            label="Headless mode"
            description="Turn off to inspect the browser while a scrape runs."
            checked={settings.browser.headless}
            onChange={(headless) => patch({ browser: { headless } })}
          />
          <Toggle
            label="Wait until network idle"
            description="Wait for page requests to settle before extraction."
            checked={settings.browser.waitForNetworkIdle}
            onChange={(waitForNetworkIdle) => patch({ browser: { waitForNetworkIdle } })}
          />
          <Toggle
            label="Scroll before scraping"
            description="Run controlled scroll passes to load lazy content."
            checked={settings.browser.scrollBeforeScraping}
            onChange={(scrollBeforeScraping) => patch({ browser: { scrollBeforeScraping } })}
          />
          <div className="field-row">
            <label htmlFor="scraper-pre-script">JavaScript before extraction</label>
            <textarea
              id="scraper-pre-script"
              value={settings.browser.preExtractionScript}
              spellCheck={false}
              placeholder="Optional script for a trusted site profile"
              onChange={(event) => patch({ browser: { preExtractionScript: event.currentTarget.value } })}
            />
          </div>
        </SettingsCard>
      )}

      {matches('session fingerprint authentication persist compatibility') && (
        <SettingsCard
          id="scraper-session"
          title="Session compatibility"
          description="Reuse an authenticated session without attempting to evade site protections."
        >
          <Toggle
            label="Consistent browser fingerprint"
            description="Keep browser characteristics stable for site compatibility."
            checked={settings.session.consistentFingerprint}
            onChange={(consistentFingerprint) => patch({ session: { consistentFingerprint } })}
          />
          <Toggle
            label="Persist authenticated session"
            description="Reuse a session that you established through the normal sign-in flow."
            checked={settings.session.persistAuthenticatedSession}
            onChange={(persistAuthenticatedSession) => patch({ session: { persistAuthenticatedSession } })}
          />
          <div className="field-row">
            <label htmlFor="scraper-session-label">Session label</label>
            <input id="scraper-session-label" value={settings.session.sessionLabel} placeholder="Primary browser session" onChange={(event) => patch({ session: { sessionLabel: event.currentTarget.value } })} />
          </div>
          <div style={gridStyle}>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <label htmlFor="scraper-session-expires">Session expires</label>
              <input id="scraper-session-expires" type="datetime-local" value={settings.session.expiresAt?.slice(0, 16) ?? ''} onChange={(event) => patch({ session: { expiresAt: event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : null } })} />
            </div>
            <div className="field-row" style={{ marginBottom: 0 }}>
              <label htmlFor="scraper-session-validated">Last validated</label>
              <input id="scraper-session-validated" type="datetime-local" value={settings.session.lastValidatedAt?.slice(0, 16) ?? ''} onChange={(event) => patch({ session: { lastValidatedAt: event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : null } })} />
            </div>
          </div>
        </SettingsCard>
      )}

      {matches('cache offline html metadata thumbnail lifetime size') && (
        <SettingsCard id="scraper-cache" title="Cache and offline mode" description="Persist cache policy only. Cache storage and cleanup remain the responsibility of a future connector.">
          <div className="field-row">
            <label htmlFor="scraper-cache-mode">Cache mode</label>
            <select id="scraper-cache-mode" className="media-model-select" value={settings.cache.mode} onChange={(event) => patch({ cache: { mode: event.currentTarget.value as ScraperSettings['cache']['mode'] } })}>
              <option value="standard">Standard</option>
              <option value="offline">Offline only</option>
            </select>
          </div>
          <p className="muted">Offline mode records that network access must not be attempted; it does not start or stop any connector.</p>
          {([
            ['htmlEnabled', 'HTML cache', 'Allow fetched page documents to be cached.'],
            ['metadataEnabled', 'Metadata cache', 'Allow normalized series and episode metadata to be cached.'],
            ['thumbnailsEnabled', 'Thumbnail cache', 'Allow downloaded artwork to be cached.'],
          ] as const).map(([key, label, description]) => <Toggle key={key} label={label} description={description} checked={settings.cache[key]} onChange={(value) => patch({ cache: { [key]: value } })} />)}
          <div style={gridStyle}>
            <NumberField label="Cache lifetime (minutes)" value={settings.cache.lifetimeMinutes} min={0} max={525_600} onChange={(lifetimeMinutes) => patch({ cache: { lifetimeMinutes } })} />
            <NumberField label="Maximum cache size (MB)" value={settings.cache.maxSizeMb} min={16} max={1_048_576} onChange={(maxSizeMb) => patch({ cache: { maxSizeMb } })} />
          </div>
        </SettingsCard>
      )}

      {matches('safety robots crawl delay requests minute failures pause domain rate limit') && (
        <SettingsCard id="scraper-safety" title="Crawl safety" description="Conservative request boundaries that future connectors must honor per domain.">
          <Toggle label="Respect robots.txt" description="Require connectors to observe published crawl guidance." checked={settings.safety.respectRobotsTxt} onChange={(respectRobotsTxt) => patch({ safety: { respectRobotsTxt } })} />
          <div style={gridStyle}>
            <NumberField label="Crawl delay (ms)" value={settings.safety.crawlDelayMs} min={0} max={300_000} step={100} onChange={(crawlDelayMs) => patch({ safety: { crawlDelayMs } })} />
            <NumberField label="Maximum requests/minute" value={settings.safety.maxRequestsPerMinute} min={1} max={10_000} onChange={(maxRequestsPerMinute) => patch({ safety: { maxRequestsPerMinute } })} />
            <NumberField label="Pause after failures" value={settings.safety.pauseAfterFailures} min={1} max={1_000} onChange={(pauseAfterFailures) => patch({ safety: { pauseAfterFailures } })} />
            <NumberField label="Pause duration (ms)" value={settings.safety.pauseDurationMs} min={1_000} max={86_400_000} step={1_000} onChange={(pauseDurationMs) => patch({ safety: { pauseDurationMs } })} />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-domain-limits">Domain rate limits (requests/minute)</label>
            <textarea id="scraper-domain-limits" value={domainLimitsText} spellCheck={false} placeholder={'example.org: 12\nmedia.example.org: 6'} onChange={(event) => setDomainLimitsText(event.currentTarget.value)} onBlur={() => {
              try {
                const domainRateLimits = Object.fromEntries(domainLimitsText.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
                  const match = line.match(/^\s*([^:]+)\s*:\s*(\d+)\s*$/);
                  if (!match) throw new Error(`Invalid domain rate limit: ${line}`);
                  return [match[1], Number(match[2])];
                }));
                patch({ safety: { domainRateLimits } });
                setMessage('Domain rate limits saved.');
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Domain rate limits are invalid.');
              }
            }} />
            <small className="muted">One hostname and positive request limit per line. Hostnames and limits are normalized by the settings validator.</small>
          </div>
        </SettingsCard>
      )}

      {matches('authentication login account credential cookie jar manual session status') && (
        <SettingsCard id="scraper-authentication" title="Authentication metadata" description="Labels and opaque storage references only. This page does not store credentials or perform sign-in.">
          <div className="field-row">
            <label htmlFor="scraper-login-status">Recorded login status</label>
            <select id="scraper-login-status" className="media-model-select" value={settings.authentication.loginStatus} onChange={(event) => patch({ authentication: { loginStatus: event.currentTarget.value as ScraperSettings['authentication']['loginStatus'] } })}>
              <option value="not-configured">Not configured</option><option value="signed-out">Signed out</option><option value="signed-in">Signed in</option><option value="expired">Expired</option><option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="field-row"><label htmlFor="scraper-account-label">Account label</label><input id="scraper-account-label" value={settings.authentication.accountLabel} placeholder="Personal account" onChange={(event) => patch({ authentication: { accountLabel: event.currentTarget.value } })} /></div>
          <div className="field-row"><label htmlFor="scraper-credential-ref">Credential storage reference</label><input id="scraper-credential-ref" value={settings.authentication.credentialRef} placeholder="Opaque keychain or vault identifier" spellCheck={false} onChange={(event) => patch({ authentication: { credentialRef: event.currentTarget.value } })} /></div>
          <div className="field-row"><label htmlFor="scraper-cookie-jar-ref">Cookie jar reference</label><input id="scraper-cookie-jar-ref" value={settings.authentication.cookieJarRef} placeholder="Opaque local cookie store identifier" spellCheck={false} onChange={(event) => patch({ authentication: { cookieJarRef: event.currentTarget.value } })} /></div>
          <Toggle label="Manual login required" description="Record that a user-established browser session is required." checked={settings.authentication.manualLoginRequired} onChange={(manualLoginRequired) => patch({ authentication: { manualLoginRequired } })} />
        </SettingsCard>
      )}

      {matches('history version rollback restore change') && (
        <SettingsCard id="scraper-history" title="Version history" description="The 20 most recent profile snapshots are retained locally. Rollback also preserves the current state.">
          {active.history.length === 0 ? <p className="muted">No previous versions yet.</p> : active.history.map((version) => (
            <div className="field-row" key={version.id}>
              <span><strong>{version.reason}</strong><small className="muted">{new Date(version.createdAt).toLocaleString()} · {version.preset}</small></span>
              <button type="button" className="btn" onClick={() => {
                try {
                  commit(rollbackScraperProfile(document, active.id, version.id));
                  setMessage(`Restored version from ${new Date(version.createdAt).toLocaleString()}.`);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Could not restore this version.');
                }
              }}>Restore</button>
            </div>
          ))}
          {message && <p className="form-msg" role="status">{message}</p>}
        </SettingsCard>
      )}

      {matches('extraction css xpath regex attribute fallback hidden clean decode duplicate normalize season special ova movie') && (
        <SettingsCard id="scraper-extraction" title="Extraction" description="Override episode discovery rules. Selectors are tried in order until one matches.">
          <div className="field-row">
            <label htmlFor="scraper-css-selectors">CSS selectors (one fallback per line)</label>
            <textarea id="scraper-css-selectors" spellCheck={false} value={settings.extraction.cssSelectors.join('\n')} onChange={(event) => patch({ extraction: { cssSelectors: event.currentTarget.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) } })} />
          </div>
          <div className="field-row">
            <label htmlFor="scraper-xpath-selectors">XPath selectors (one fallback per line)</label>
            <textarea id="scraper-xpath-selectors" spellCheck={false} value={settings.extraction.xpathSelectors.join('\n')} onChange={(event) => patch({ extraction: { xpathSelectors: event.currentTarget.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) } })} />
          </div>
          <div style={gridStyle}>
            <div className="field-row" style={{ marginBottom: 0 }}><label htmlFor="scraper-regex">Regex filter<input id="scraper-regex" value={settings.extraction.regexPattern} spellCheck={false} onChange={(event) => patch({ extraction: { regexPattern: event.currentTarget.value } })} /></label></div>
            <div className="field-row" style={{ marginBottom: 0 }}><label htmlFor="scraper-regex-flags">Regex flags<input id="scraper-regex-flags" value={settings.extraction.regexFlags} spellCheck={false} onChange={(event) => patch({ extraction: { regexFlags: event.currentTarget.value } })} /></label></div>
            <div className="field-row" style={{ marginBottom: 0 }}><label htmlFor="scraper-attribute">Value attribute<input id="scraper-attribute" value={settings.extraction.attribute} spellCheck={false} onChange={(event) => patch({ extraction: { attribute: event.currentTarget.value } })} /></label></div>
          </div>
          {([
            ['ignoreHiddenElements', 'Ignore hidden elements', 'Skip hidden and aria-hidden episode nodes.'],
            ['cleanText', 'Clean extracted text', 'Collapse whitespace and trim extracted values.'],
            ['decodeHtmlEntities', 'Decode HTML entities', 'Decode encoded characters in titles and values.'],
            ['removeDuplicateEpisodes', 'Remove duplicate URLs', 'Keep the first occurrence of an identical episode URL.'],
            ['normalizeEpisodeNumbering', 'Normalize episode numbering', 'Parse common episode labels into numeric values.'],
            ['detectSeasonNumbers', 'Detect season numbers', 'Recognize season labels in titles and URLs.'],
            ['detectSpecials', 'Detect specials, OVAs, and movies', 'Classify non-standard episode entries.'],
          ] as const).map(([key, label, description]) => <Toggle key={key} label={label} description={description} checked={settings.extraction[key]} onChange={(value) => patch({ extraction: { [key]: value } })} />)}
        </SettingsCard>
      )}

      {matches('episode processing natural sort missing merge quality subbed dubbed raw language resolution filler recap rename') && (
        <SettingsCard id="scraper-episode-processing" title="Episode processing" description="Normalize a discovered episode list and choose the preferred source for duplicates.">
          <div className="field-row"><label htmlFor="scraper-audio-preference">Audio preference</label><select id="scraper-audio-preference" className="media-model-select" value={settings.episodeProcessing.audioPreference} onChange={(event) => patch({ episodeProcessing: { audioPreference: event.currentTarget.value as ScraperSettings['episodeProcessing']['audioPreference'] } })}><option value="subbed">Subbed</option><option value="dubbed">Dubbed</option><option value="raw">Raw</option><option value="none">No preference</option></select></div>
          <div className="field-row"><label htmlFor="scraper-language-priority">Language priority (comma separated)</label><input id="scraper-language-priority" value={settings.episodeProcessing.languagePriority.join(', ')} onChange={(event) => patch({ episodeProcessing: { languagePriority: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) } })} /></div>
          <div className="field-row"><label htmlFor="scraper-resolution-priority">Resolution priority (comma separated)</label><input id="scraper-resolution-priority" value={settings.episodeProcessing.resolutionPriority.join(', ')} onChange={(event) => patch({ episodeProcessing: { resolutionPriority: event.currentTarget.value.split(',').map(Number).filter(Number.isFinite) } })} /></div>
          {([
            ['naturalSort', 'Sort episodes naturally', 'Order by season and numeric episode number.'],
            ['detectMissingNumbers', 'Detect missing episode numbers', 'Report gaps in the processed episode sequence.'],
            ['mergeDuplicateSources', 'Merge duplicate sources', 'Combine mirrors for the same season and episode.'],
            ['keepHighestQuality', 'Keep highest preferred quality', 'Use the resolution priority when choosing a mirror.'],
            ['ignoreFiller', 'Ignore filler episodes', 'Remove entries marked as filler.'],
            ['ignoreRecaps', 'Ignore recap episodes', 'Remove entries marked as recaps.'],
            ['renameEpisodes', 'Rename episodes automatically', 'Use normalized SxxExx display titles.'],
          ] as const).map(([key, label, description]) => <Toggle key={key} label={label} description={description} checked={settings.episodeProcessing[key]} onChange={(value) => patch({ episodeProcessing: { [key]: value } })} />)}
        </SettingsCard>
      )}

      {matches('import export json backup portable') && (
        <SettingsCard
          id="scraper-import-export"
          title="Import and export"
          description="Portable versioned JSON. Imported values are validated before they are saved."
        >
          <div className="field-row">
            <label htmlFor="scraper-portable-json">Settings JSON</label>
            <textarea
              id="scraper-portable-json"
              value={portableJson}
              spellCheck={false}
              placeholder="Export settings or paste a previous export"
              onChange={(event) => setPortableJson(event.currentTarget.value)}
              style={{ minHeight: 140 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPortableJson(exportScraperSettings(document));
                setMessage('Settings exported to the JSON field.');
              }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={!portableJson.trim()}
              onClick={() => {
                try {
                  const imported = importScraperSettings(portableJson);
                  setDocument(imported.document);
                  setMessage(imported.issues.length
                    ? `Imported with ${imported.issues.length} corrected value(s).`
                    : 'Settings imported.');
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'Settings could not be imported.');
                }
              }}
            >
              Validate and import
            </button>
          </div>
          {message && <p className="form-msg" role="status">{message}</p>}
        </SettingsCard>
      )}
    </>
  );
}
