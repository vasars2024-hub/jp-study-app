import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icons';
import { Button, Select } from '../../ui';
import VirtualList from '../../VirtualList';
import ScrCard from '../ScrCard';
import StatusDot from '../StatusDot';
import { useScraper } from '../ScraperContext';
import { useScraperPort } from '../data/scraperPort';
import type { HttpProbeResult, SelectorMatch } from '../data/scraperPort';
import type { LogLine } from '../../../../shared/scraperResults';
import {
  SCRAPER_CONSOLE_COMMANDS,
  SCRAPER_CONSOLE_COMMAND_IDS,
  runConsoleCommand,
  type ScraperConsoleCommandId,
  type ScraperConsoleResult,
  type ScraperConsoleSource,
} from '../../../../shared/scraperConsole';
import { loadScraperSettingsDocument, onScraperSettingsChanged } from '../../../scraperSettingsStore';
import { sx, sxs, type ScraperTextKey } from '../strings';
import { FIXTURE_HTML } from '../data/fixtures';

function ToolHead({ page, title, subtitle }: { page: string; title: string; subtitle: string }) {
  return (
    <header className="scr-page-head">
      <div>
        <h1 className="scr-page-title">
          {title}
          <StatusDot id={`page.${page}`} className="scr-page-dot" />
        </h1>
        <p className="scr-page-sub">{subtitle}</p>
      </div>
      <span className="scr-tool-badge"><Icon name="shield" size={13} /> Local sandbox</span>
    </header>
  );
}

export function SelectorTesterPage() {
  const port = useScraperPort();
  const [mode, setMode] = useState<'css' | 'xpath'>('css');
  const [selector, setSelector] = useState('.ep-list > li');
  const [html, setHtml] = useState(FIXTURE_HTML);
  const [matches, setMatches] = useState<SelectorMatch[]>([]);
  const [error, setError] = useState('');

  const run = async () => {
    try {
      setMatches(await port.testSelector(html, selector, mode));
      setError('');
    } catch (reason) {
      setMatches([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    void run();
  }, []);

  return (
    <div className="scr-page">
      <ToolHead page="selector-tester" title="Selector Tester" subtitle="Test CSS and XPath selectors against a captured page without sending network requests." />
      <div className="scr-tool-controls">
        <Select
          value={mode}
          onChange={(event) => setMode(event.target.value as 'css' | 'xpath')}
          options={[{ value: 'css', label: 'CSS' }, { value: 'xpath', label: 'XPath' }]}
        />
        <input className="scr-input scr-input--mono" value={selector} onChange={(event) => setSelector(event.target.value)} />
        <Button variant="primary" size="sm" onClick={() => void run()}>Run selector</Button>
      </div>
      {error && <p className="scr-error-callout">{error}</p>}
      <div className="scr-tool-split">
        <ScrCard title="Page sample" description="Editable HTML fixture">
          <textarea className="scr-input scr-input--area scr-code-editor" value={html} onChange={(event) => setHtml(event.target.value)} />
        </ScrCard>
        <ScrCard title={`${matches.length} matches`} statusId="page.selector-tester">
          <div className="scr-match-list">
            {matches.map((match) => (
              <div key={`${match.index}-${match.path}`} className="scr-match">
                <span className="scr-match-index">{match.index + 1}</span>
                <div>
                  <code>{match.path}</code>
                  <p>{match.text}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrCard>
      </div>
    </div>
  );
}

interface RegexMatch {
  index: number;
  value: string;
  groups: string[];
}

const REGEX_SAMPLE = `[SubsPlease] One Piece - 1112 (1080p) [A1B2C3D4].mkv
[Judas] One Piece - 1113 [1080p][HEVC x265 10bit][Dual-Audio].mkv
[Erai-raws] ワンピース - 1114 [720p][Multiple Subtitle].mkv`;

const REGEX_PRESETS = [
  { label: 'Release group + episode', pattern: '\\[(?<group>[^\\]]+)\\].*?-\\s*(?<episode>\\d+)', flags: 'gmi' },
  { label: 'Resolution', pattern: '(?<resolution>2160p|1080p|720p|480p)', flags: 'gi' },
  { label: 'CRC checksum', pattern: '\\[(?<crc>[A-F0-9]{8})\\]', flags: 'gi' },
  { label: 'Japanese episode', pattern: '(?<episode>\\d+)\\s*話', flags: 'gi' },
] as const;

export function RegexTesterPage() {
  const [pattern, setPattern] = useState('\\[(?<group>[^\\]]+)\\].*?-\\s*(?<episode>\\d+)');
  const [flags, setFlags] = useState('gmi');
  const [sample, setSample] = useState(REGEX_SAMPLE);
  const { matches, error } = useMemo(() => {
    try {
      const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
      const result: RegexMatch[] = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(sample)) && result.length < 100) {
        result.push({ index: match.index, value: match[0], groups: match.slice(1) });
        if (!match[0]) regex.lastIndex += 1;
      }
      return { matches: result, error: '' };
    } catch (reason) {
      return { matches: [] as RegexMatch[], error: reason instanceof Error ? reason.message : String(reason) };
    }
  }, [pattern, flags, sample]);

  return (
    <div className="scr-page">
      <ToolHead page="regex-tester" title="Regex Tester" subtitle="Build extraction patterns with live matches and capture-group visibility." />
      <section className="scr-tool-preset-row" aria-label="Regex pattern library">
        <span>Pattern library</span>
        {REGEX_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.label}
            className={preset.pattern === pattern ? 'is-active' : ''}
            onClick={() => {
              setPattern(preset.pattern);
              setFlags(preset.flags);
            }}
          >
            {preset.label}
          </button>
        ))}
      </section>
      <div className="scr-tool-controls">
        <span className="scr-code-prefix">/</span>
        <input className="scr-input scr-input--mono" value={pattern} onChange={(event) => setPattern(event.target.value)} />
        <span className="scr-code-prefix">/</span>
        <input className="scr-input scr-input--mono scr-input--flags" value={flags} onChange={(event) => setFlags(event.target.value)} />
      </div>
      {error && <p className="scr-error-callout">{error}</p>}
      <div className="scr-tile-row">
        <div className="scr-tile"><span className="scr-tile-label">Matches</span><span className="scr-tile-value">{matches.length}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Capture groups</span><span className="scr-tile-value">{matches[0]?.groups.length ?? 0}</span></div>
        <div className="scr-tile"><span className="scr-tile-label">Sample characters</span><span className="scr-tile-value">{sample.length}</span></div>
        <div className={`scr-tile${error ? ' is-bad' : ''}`}><span className="scr-tile-label">Pattern state</span><span className="scr-tile-value scr-tile-value--format">{error ? 'Invalid' : 'Valid'}</span></div>
      </div>
      <div className="scr-tool-split">
        <ScrCard title="Sample text">
          <textarea className="scr-input scr-input--area scr-code-editor" value={sample} onChange={(event) => setSample(event.target.value)} />
        </ScrCard>
        <ScrCard title={`${matches.length} matches`} statusId="page.regex-tester">
          <div className="scr-match-list">
            {matches.map((match, index) => (
              <div key={`${match.index}-${index}`} className="scr-match">
                <span className="scr-match-index">{index + 1}</span>
                <div>
                  <code>{match.value}</code>
                  <p>Offset {match.index} · Groups: {match.groups.join(' · ') || 'none'}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrCard>
      </div>
    </div>
  );
}

export function HttpInspectorPage() {
  const port = useScraperPort();
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('https://streamsb.example/anime/one-piece');
  const [result, setResult] = useState<HttpProbeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ id: string; method: string; url: string; status: number; duration: number }[]>([]);

  const send = async () => {
    setLoading(true);
    try {
      const next = await port.fetchHttp({ method, url, headers: { accept: 'text/html', 'user-agent': 'AnimeScraper/1.0' } });
      setResult(next);
      setHistory((current) => [
        {
          id: `${Date.now()}`,
          method,
          url,
          status: next.status,
          duration: Object.values(next.timingMs).reduce((sum, value) => sum + value, 0),
        },
        ...current,
      ].slice(0, 8));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scr-page">
      <ToolHead page="http-inspector" title="HTTP Inspector" subtitle="Inspect a redacted request/response exchange and its timing breakdown." />
      <section className="scr-tool-preset-row" aria-label="Request presets">
        <span>Request presets</span>
        {[
          ['Episode page', 'GET', 'https://streamsb.example/anime/one-piece'],
          ['Metadata API', 'GET', 'https://api.jikan.moe/v4/anime/21'],
          ['Subtitle manifest', 'HEAD', 'https://jimaku.example/one-piece/1'],
        ].map(([label, nextMethod, nextUrl]) => (
          <button
            type="button"
            key={label}
            onClick={() => {
              setMethod(nextMethod);
              setUrl(nextUrl);
            }}
          >
            {label}
          </button>
        ))}
      </section>
      <div className="scr-tool-controls">
        <Select value={method} onChange={(event) => setMethod(event.target.value)} options={['GET', 'HEAD', 'POST'].map((value) => ({ value, label: value }))} />
        <input className="scr-input scr-input--mono" value={url} onChange={(event) => setUrl(event.target.value)} />
        <Button variant="primary" size="sm" disabled={loading} onClick={() => void send()}>
          {loading ? 'Sending…' : 'Send request'}
        </Button>
      </div>
      <div className="scr-tool-split">
        <ScrCard title="Request headers" description="Sensitive values are redacted before they reach this inspector.">
          <div className="scr-header-list">
            <div><code>accept</code><span>text/html</span></div>
            <div><code>user-agent</code><span>AnimeScraper/1.0</span></div>
            <div><code>referer</code><span>same-origin</span></div>
          </div>
        </ScrCard>
        <ScrCard title="Request history" statusId="page.http-inspector">
          <div className="scr-http-history">
            {history.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() => {
                  setMethod(entry.method);
                  setUrl(entry.url);
                }}
              >
                <span className="scr-pill scr-pill--outline">{entry.method}</span>
                <span>{entry.url}</span>
                <b>{entry.status}</b>
                <small>{entry.duration} ms</small>
              </button>
            ))}
            {!history.length && <p className="scr-muted">Completed requests appear here for quick comparison.</p>}
          </div>
        </ScrCard>
      </div>
      {result ? (
        <>
          <div className="scr-http-stats">
            <span className="scr-http-status">{result.status} {result.statusText}</span>
            {Object.entries(result.timingMs).map(([key, value]) => <span key={key}><small>{key}</small><b>{value} ms</b></span>)}
            <span><small>size</small><b>{result.sizeBytes} B</b></span>
          </div>
          <div className="scr-tool-split">
            <ScrCard title="Response headers" statusId="page.http-inspector">
              <div className="scr-header-list">
                {Object.entries(result.headers).map(([key, value]) => <div key={key}><code>{key}</code><span>{value}</span></div>)}
              </div>
            </ScrCard>
            <ScrCard title="Response body">
              <pre className="scr-response-body">{result.body}</pre>
            </ScrCard>
          </div>
        </>
      ) : (
        <ScrCard title="Ready to inspect">
          <p className="scr-muted">Send the sample request to display status, headers, body, size, and timing.</p>
        </ScrCard>
      )}
    </div>
  );
}

/** One description per allow-listed command, resolved at render time. */
const CONSOLE_SUMMARY: Record<ScraperConsoleCommandId, ScraperTextKey> = {
  help: 'console.cmd.help',
  'backend.capabilities': 'console.cmd.backend.capabilities',
  'system.stats': 'console.cmd.system.stats',
  'jobs.active': 'console.cmd.jobs.active',
  'jobs.recent': 'console.cmd.jobs.recent',
  'sources.health': 'console.cmd.sources.health',
  'plugins.installed': 'console.cmd.plugins.installed',
  'exports.recent': 'console.cmd.exports.recent',
  'profile.active': 'console.cmd.profile.active',
  'logs.tail': 'console.cmd.logs.tail',
};

const COMMAND_LIST = SCRAPER_CONSOLE_COMMAND_IDS.join(', ');

/** How many log lines the page keeps, and therefore what `logs.tail` can see. */
const LOG_BUFFER = 40;

/**
 * The Script Console.
 *
 * It executes nothing. The input box selects a command from a fixed allow-list
 * (`shared/scraperConsole.ts`) and every answer is a read through the live port
 * — there is no evaluator, because this page renders in the app's own renderer
 * process and free-text `eval` there would run with full privileges over the
 * user's decks, settings and IPC surface. See PHASE_4_SEANIME_SCRAPER_STATE.md.
 */
export function ScriptConsolePage() {
  const port = useScraperPort();
  const { openDrawer } = useScraper();
  const [command, setCommand] = useState<string>('backend.capabilities');
  const [history, setHistory] = useState<ScraperConsoleResult[]>([]);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [document, setDocument] = useState(() => loadScraperSettingsDocument());
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);

  // A ref, not state: `logs.tail` must read what is on screen at the moment the
  // command runs without every log line rebuilding the console source.
  const logsRef = useRef<LogLine[]>([]);
  logsRef.current = logs;

  useEffect(() => onScraperSettingsChanged(setDocument), []);

  useEffect(
    () => port.tailLogs((line) => setLogs((current) => [line, ...current].slice(0, LOG_BUFFER))),
    [port],
  );

  useEffect(() => {
    let cancelled = false;
    void port
      .backendCapabilities()
      .then((list) => !cancelled && setLive(list.length > 0))
      .catch(() => !cancelled && setLive(false));
    return () => {
      cancelled = true;
    };
  }, [port]);

  const unlocked = document.profiles.find((profile) => profile.id === document.activeProfileId)
    ?.settings.developer.allowScriptConsole ?? false;

  const source = useMemo<ScraperConsoleSource>(() => {
    const active =
      document.profiles.find((profile) => profile.id === document.activeProfileId)
      ?? document.profiles[0];
    return {
      backendCapabilities: () => port.backendCapabilities(),
      systemStats: () => port.systemStats(),
      listJobs: () => port.listJobs(),
      listSources: () => port.listSources(),
      listPlugins: () => port.listPlugins(),
      listExports: () => port.listExports(),
      recentLogs: () => logsRef.current,
      activeProfile: () => ({
        profileId: active.id,
        profileName: active.name,
        preset: active.preset,
        concurrentRequests: active.settings.network.concurrentRequests,
        requestTimeoutMs: active.settings.network.requestTimeoutMs,
        retryAttempts: active.settings.network.retryAttempts,
        crawlDelayMs: active.settings.safety.crawlDelayMs,
        maxRequestsPerMinute: active.settings.safety.maxRequestsPerMinute,
        respectRobotsTxt: active.settings.safety.respectRobotsTxt,
        cacheMode: active.settings.cache.mode,
        sourcesEnabled: active.settings.sources.entries.filter((entry) => entry.enabled).length,
      }),
    };
  }, [port, document]);

  const execute = async (nextCommand = command) => {
    if (!unlocked) return;
    setBusy(true);
    try {
      const result = await runConsoleCommand(nextCommand, source);
      setHistory((current) => [result, ...current].slice(0, 30));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scr-page">
      <ToolHead page="script-console" title={sx('console.title')} subtitle={sx('console.subtitle')} />
      <div className="scr-tile-row">
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('console.sandbox')}</span>
          <span className="scr-tile-value scr-tile-value--format">{sx('console.sandboxValue')}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('console.commands')}</span>
          <span className="scr-tile-value">{SCRAPER_CONSOLE_COMMANDS.length}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('console.backend')}</span>
          <span className="scr-tile-value scr-tile-value--format">
            {sx(live === false ? 'console.backendSample' : 'console.backendLive')}
          </span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('console.executions')}</span>
          <span className="scr-tile-value">{history.length}</span>
        </div>
        <div className="scr-tile">
          <span className="scr-tile-label">{sx('console.logRows')}</span>
          <span className="scr-tile-value">{logs.length}</span>
        </div>
      </div>
      <p className="scr-muted scr-console-note">{sx('console.notExecuted')}</p>
      {!unlocked && (
        <ScrCard title={sx('console.locked')}>
          <p className="scr-muted">{sx('console.lockedHint')}</p>
          <Button size="sm" onClick={() => openDrawer('developer')}>{sx('console.openSettings')}</Button>
        </ScrCard>
      )}
      <section className="scr-tool-preset-row" aria-label={sx('console.paletteLabel')}>
        <span>{sx('console.palette')}</span>
        {SCRAPER_CONSOLE_COMMANDS.map((entry) => (
          <button
            type="button"
            key={entry.id}
            title={sx(CONSOLE_SUMMARY[entry.id])}
            disabled={!unlocked}
            className={entry.id === command ? 'is-active' : ''}
            onClick={() => {
              setCommand(entry.id);
              void execute(entry.id);
            }}
          >
            {entry.id}
          </button>
        ))}
        <button type="button" onClick={() => setHistory([])}>{sx('console.clear')}</button>
      </section>
      <div className="scr-console">
        <div className="scr-console-input">
          <span>&gt;</span>
          <input
            className="scr-input scr-input--mono"
            aria-label={sx('console.inputLabel')}
            value={command}
            disabled={!unlocked}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void execute()}
          />
          <Button size="sm" variant="primary" disabled={!unlocked || busy} onClick={() => void execute()}>
            {sx('console.run')}
          </Button>
        </div>
        <div className="scr-console-output">
          {history.length === 0 && <p className="scr-muted">{sx('console.empty')}</p>}
          {history.map((entry, index) => (
            <div key={`${entry.input}-${index}`} className="scr-console-entry">
              <code>
                &gt; {entry.input}
                {entry.status === 'ok' && (
                  <span className={`scr-pill ${entry.live ? 'scr-pill--outline' : 'scr-pill--warn'}`}>
                    {sx(entry.live ? 'console.liveTag' : 'console.sampleTag')}
                  </span>
                )}
              </code>
              {entry.status === 'ok' && <pre>{entry.output}</pre>}
              {entry.status === 'unknown-command' && (
                <pre>{`${sxs('console.unknown', entry.input)}\n${sxs('console.unknownHint', COMMAND_LIST)}`}</pre>
              )}
              {entry.status === 'failed' && <pre>{sxs('console.failed', entry.detail)}</pre>}
            </div>
          ))}
        </div>
      </div>
      <ScrCard title={sx('console.liveLog')} statusId="page.script-console">
        <div className="scr-live-log">
          <VirtualList
            items={logs}
            itemHeight={34}
            getKey={(line) => line.id}
            emptyState={<p className="scr-muted">{sx('console.waiting')}</p>}
            renderItem={(line) => (
              <div className={`scr-log scr-log--${line.level}`}>
                <span className="scr-log-level">{line.level}</span>
                <span className="scr-log-channel">{line.channel}</span>
                <span className="scr-log-msg">{line.message}</span>
              </div>
            )}
          />
        </div>
      </ScrCard>
    </div>
  );
}
