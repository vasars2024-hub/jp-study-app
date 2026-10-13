/**
 * About Gum: version, licence (GPL-3.0-or-later, with the source repository),
 * the open source licences, dictionary and data credits, and the privacy
 * statement. Shown in Settings → Help (Study OS, Aero, WIRED) and in Blanc's
 * Settings, always lazy-loaded, so neither boot graph carries it.
 *
 * Everything renders offline. The texts are the repository's own files,
 * imported as text and parsed by the same safe Markdown subset the release
 * notes use (no HTML is ever produced from them):
 *  - PRIVACY.md is bundled with this panel, so the in-app statement IS the
 *    file (`aboutPanel.test.tsx` checks they stay one text);
 *  - THIRD_PARTY_NOTICES.md and THIRD_PARTY_LICENSES.json (about 1 MB, every
 *    npm licence text) are split into their own chunks and loaded only when the
 *    licences tab is opened; LICENSE only when "Read the licence" is pressed.
 * The same files also ship as plain files in the app's resources folder.
 */

/* eslint-disable import/no-unresolved --
   The `?raw` suffix is Vite's inline-as-string import, resolved by the bundler at
   build time. eslint-plugin-import's resolver does not understand query suffixes
   and reports each one as unresolved; the files are the repository's own
   PRIVACY.md, THIRD_PARTY_NOTICES.md, THIRD_PARTY_LICENSES.json and LICENSE. */

import { useEffect, useId, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { Toggle } from '../ui/Toggle';
import ReleaseNotesMarkdown from '../settings/pages/ReleaseNotesMarkdown';
import { GITHUB_OWNER, GITHUB_REPO } from '../../../shared/release';
import { TELEMETRY_CONSENT_KEY } from '../../../shared/stats';
import { sendTelemetryPingIfNeeded } from '../../telemetryPing';
import bundled from '../../../shared/thirdPartyBundled.json';
import privacySource from '../../../../PRIVACY.md?raw';
import './about.css';

export const ABOUT_SOURCE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
/** The product name: a proper noun, the same in every UI language. */
const APP_NAME = 'Gum';
export const ABOUT_PRIVACY_SOURCE = privacySource;

export type AboutTab = 'overview' | 'licences' | 'credits' | 'privacy';
const TABS: readonly AboutTab[] = ['overview', 'licences', 'credits', 'privacy'];
const TAB_KEYS: Readonly<Record<AboutTab, string>> = {
  overview: 'about.tab.overview',
  licences: 'about.tab.licences',
  credits: 'about.tab.credits',
  privacy: 'about.tab.privacy',
};

interface BundledComponent {
  id: string;
  name: string;
  license: string;
  copyright: string;
  url: string;
  attribution: string;
  credit?: boolean;
}

interface NpmLicence {
  name: string;
  version: string;
  license: string;
  repository?: string;
  licenseText?: string;
  licenseTextIsStandard?: boolean;
  installed?: boolean;
}

const SCROLL_STYLE = { maxHeight: 420, overflow: 'auto', userSelect: 'text' } as const;
const LIST_CAP = 60;

function openProjectLink(url: string): void {
  void window.api?.appUpdateOpenLink?.(url);
}

type Load<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; value: T } | { state: 'failed' };

/** Load a text chunk once, on demand. */
function useLazyText<T>(enabled: boolean, load: () => Promise<T>): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: 'idle' });
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let alive = true;
    setResult({ state: 'loading' });
    load()
      .then((value) => alive && setResult({ state: 'ready', value }))
      .catch(() => alive && setResult({ state: 'failed' }));
    return () => {
      alive = false;
      // A tab switched away mid-load starts over next time.
      started.current = false;
    };
    // `load` is a module-level loader; only `enabled` decides when it runs.
  }, [enabled]);
  return result;
}

const loadNotices = (): Promise<string> => import('../../../../THIRD_PARTY_NOTICES.md?raw').then((m) => m.default);
const loadLicences = (): Promise<NpmLicence[]> =>
  import('../../../../THIRD_PARTY_LICENSES.json?raw').then((m) => {
    const doc = JSON.parse(m.default) as { npm?: NpmLicence[] };
    return Array.isArray(doc.npm) ? doc.npm.filter((p) => p.installed !== false) : [];
  });
const loadGpl = (): Promise<string> => import('../../../../LICENSE?raw').then((m) => m.default);

export default function AboutPanel({ initialTab = 'overview' }: { initialTab?: AboutTab }) {
  const { t } = useT();
  const [tab, setTab] = useState<AboutTab>(initialTab);
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const jump = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
    if (!step && jump === null) return;
    event.preventDefault();
    const next = jump ?? (index + step + TABS.length) % TABS.length;
    setTab(TABS[next]);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="about-panel" data-about-tab={tab}>
      <div className="about-tabs" role="tablist" aria-label={t('about.title')}>
        {TABS.map((id, i) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${id}`}
            aria-selected={tab === id}
            // Only the shown panel exists, so only its tab points at it.
            aria-controls={tab === id ? `${baseId}-panel-${id}` : undefined}
            tabIndex={tab === id ? 0 : -1}
            className={`about-tab${tab === id ? ' is-active' : ''}`}
            data-about-tab-id={id}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>
      <div
        className="about-body"
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {tab === 'overview' && <Overview onPrivacy={() => setTab('privacy')} onLicences={() => setTab('licences')} />}
        {tab === 'licences' && <Licences />}
        {tab === 'credits' && <Credits />}
        {tab === 'privacy' && <Privacy />}
      </div>
    </div>
  );
}

function Overview({ onPrivacy, onLicences }: { onPrivacy: () => void; onLicences: () => void }) {
  const { t } = useT();
  const [version, setVersion] = useState<string | null>(null);
  const [showGpl, setShowGpl] = useState(false);
  const gpl = useLazyText(showGpl, loadGpl);
  useEffect(() => {
    let alive = true;
    Promise.resolve(window.api?.appVersion?.())
      .then((v) => alive && setVersion(typeof v === 'string' && v ? v : null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="about-overview">
      <p className="about-name">
        <strong>{APP_NAME}</strong>{' '}
        <span className="about-version" data-about-version={version ?? ''}>
          {version ? t('about.version', { version }) : t('about.versionUnknown')}
        </span>
      </p>
      <p className="muted">{t('about.tagline')}</p>
      <p>{t('about.licence')}</p>
      <p className="about-links">
        <a
          href={ABOUT_SOURCE_URL}
          className="about-link"
          rel="noreferrer noopener"
          onClick={(e) => {
            e.preventDefault();
            openProjectLink(ABOUT_SOURCE_URL);
          }}
        >
          {t('about.source')}
        </a>
        <span className="muted about-url" lang="en">{ABOUT_SOURCE_URL}</span>
      </p>
      <div className="about-actions">
        <button type="button" className="btn small" aria-expanded={showGpl} onClick={() => setShowGpl((v) => !v)}>
          {showGpl ? t('about.hideLicence') : t('about.readLicence')}
        </button>
        <button type="button" className="btn small" onClick={onLicences}>{t('about.tab.licences')}</button>
        <button type="button" className="btn small" onClick={onPrivacy}>{t('about.privacyLink')}</button>
      </div>
      {showGpl && (
        <LoadedText load={gpl}>
          {(text) => <pre className="about-pre" lang="en" style={SCROLL_STYLE}>{text}</pre>}
        </LoadedText>
      )}
    </div>
  );
}

function LoadedText<T>({ load, children }: { load: Load<T>; children: (value: T) => JSX.Element }) {
  const { t } = useT();
  if (load.state === 'ready') return children(load.value);
  if (load.state === 'failed') return <p className="muted" role="alert">{t('about.loadFailed')}</p>;
  return <p className="muted" role="status">{t('about.loading')}</p>;
}

function Licences() {
  const { t } = useT();
  const notices = useLazyText(true, loadNotices);
  const licences = useLazyText(true, loadLicences);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const searchId = useId();
  const list = licences.state === 'ready' ? licences.value : [];
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q) || p.license.toLowerCase().includes(q)) : list;
  }, [list, query]);
  const chosen = picked ? list.find((p) => `${p.name}@${p.version}` === picked) ?? null : null;
  return (
    <div className="about-licences">
      <p className="muted">{t('about.notices.intro')}</p>
      <p className="muted about-note">{t('about.englishOnly')}</p>
      <LoadedText load={notices}>
        {(text) => <ReleaseNotesMarkdown source={text} emptyText={t('about.loadFailed')} className="about-md" style={SCROLL_STYLE} />}
      </LoadedText>
      <h4 className="about-h">{t('about.licences.fullText')}</h4>
      <LoadedText load={licences}>
        {() => (
          <>
            <label htmlFor={searchId} className="about-label">{t('about.licences.search')}</label>
            <input
              id={searchId}
              type="search"
              className="about-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
            />
            <p className="muted" role="status">{t('about.licences.count', { count: matches.length })}</p>
            <ul className="about-pkg-list">
              {matches.slice(0, LIST_CAP).map((p) => {
                const key = `${p.name}@${p.version}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`about-pkg${picked === key ? ' is-active' : ''}`}
                      aria-pressed={picked === key}
                      onClick={() => setPicked(picked === key ? null : key)}
                    >
                      <span className="about-pkg-name" lang="en">{p.name}</span>{' '}
                      <span className="muted">{p.version} · {p.license}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {matches.length > LIST_CAP && (
              <p className="muted">{t('common.moreNotShown', { count: matches.length - LIST_CAP })}</p>
            )}
            {chosen ? (
              <div className="about-pkg-text">
                <p className="about-pkg-title" lang="en">
                  <strong>{chosen.name}</strong> {chosen.version} · {chosen.license}
                </p>
                {chosen.licenseTextIsStandard && <p className="muted">{t('about.licences.standard', { licence: chosen.license })}</p>}
                <pre className="about-pre" lang="en" style={SCROLL_STYLE}>{chosen.licenseText || chosen.license}</pre>
              </div>
            ) : (
              <p className="muted">{t('about.licences.pick')}</p>
            )}
          </>
        )}
      </LoadedText>
    </div>
  );
}

function Credits() {
  const { t } = useT();
  const credits = (bundled.components as BundledComponent[]).filter((c) => c.credit);
  return (
    <div className="about-credits">
      <p className="muted">{t('about.credits.intro')}</p>
      <ul className="about-credit-list" lang="en">
        {credits.map((c) => (
          <li key={c.id} className="about-credit" data-credit-id={c.id}>
            <p className="about-credit-name"><strong>{c.name}</strong></p>
            <p className="muted">{c.copyright} · {c.license} · {c.url}</p>
            <p className="about-credit-text">{c.attribution}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function readConsent(): boolean {
  try {
    return localStorage.getItem(TELEMETRY_CONSENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

function Privacy() {
  const { t } = useT();
  const [share, setShare] = useState(readConsent);
  const onShare = (next: boolean): void => {
    try {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, next ? 'yes' : 'no');
      if (next) void sendTelemetryPingIfNeeded();
    } catch {
      /* storage unavailable: the switch shows what is stored */
    }
    setShare(readConsent());
  };
  return (
    <div className="about-privacy">
      <p className="muted">{t('about.privacy.intro')}</p>
      <Toggle
        className="os-toggle os-toggle-compact about-consent"
        checked={share}
        onChange={(e) => onShare(e.target.checked)}
        label={t('about.privacy.heatmap')}
      />
      <p className="muted about-note">{t('about.privacy.heatmapHint')}</p>
      <ReleaseNotesMarkdown source={privacySource} emptyText={t('about.loadFailed')} className="about-md about-privacy-md" style={SCROLL_STYLE} />
    </div>
  );
}
