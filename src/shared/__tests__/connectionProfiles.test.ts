import { describe, expect, it } from 'vitest';
import { DEFAULT_SCRAPER_SETTINGS } from '../scraperSettings';
import {
  CONNECTION_ATTEMPT_HISTORY_LIMIT,
  CONNECTION_LOG_LIMIT,
  CONNECTION_PRESET_IDS,
  CONNECTION_PROFILES_VERSION,
  appendConnectionLog,
  applyConnectionPreset,
  assignSiteProfile,
  cancelConnectionJob,
  clearFinishedConnectionJobs,
  cloneConnectionProfile,
  compareConnectionProfiles,
  connectionInheritanceChain,
  connectionTimeline,
  createDefaultConnectionProfilesDocument,
  deleteConnectionProfile,
  diagnoseConnectionProfile,
  dueHealthChecks,
  enqueueConnectionJob,
  exportConnectionLogs,
  exportConnectionProfiles,
  filterConnectionLogs,
  importConnectionProfiles,
  markConnectionJobFinished,
  markConnectionJobStarted,
  markHealthChecked,
  nextConnectionJobs,
  normalizeConnectionProfilesDocument,
  patchConnectionProfile,
  profileForSite,
  profilePerformance,
  recordConnectionAttempt,
  requestHistoryFor,
  resolveConnectionSettings,
  resolveConnectionSettingsForSite,
  rollbackConnectionProfile,
  setConnectionDebugMode,
  setConnectionJobPriority,
  setConnectionProfileParent,
  setConnectionQueueConcurrency,
  setConnectionQueuePaused,
  updateConnectionProfileDetails,
  type ConnectionAttempt,
  type ConnectionLogEntry,
  type ConnectionProfilesDocument,
} from '../connectionProfiles';

const NOW = '2026-07-25T12:00:00.000Z';

function doc(): ConnectionProfilesDocument {
  return createDefaultConnectionProfilesDocument(NOW);
}

function attempt(overrides: Partial<ConnectionAttempt> = {}): ConnectionAttempt {
  return {
    id: 'a1',
    profileId: 'balanced',
    site: 'example.org',
    startedAt: NOW,
    durationMs: 400,
    outcome: 'success',
    status: 200,
    bytes: 1024,
    fromCache: false,
    parsed: true,
    errorCategory: null,
    ...overrides,
  };
}

function log(overrides: Partial<ConnectionLogEntry> = {}): ConnectionLogEntry {
  return {
    id: 'l1',
    at: NOW,
    profileId: 'balanced',
    channel: 'network',
    level: 'info',
    code: 'connection.test',
    detail: {},
    durationMs: null,
    ...overrides,
  };
}

describe('connection profiles — built-in presets', () => {
  it('ships all six presets §2 names, with balanced as the neutral base', () => {
    const document = doc();
    expect(document.profiles.map((profile) => profile.id)).toEqual([...CONNECTION_PRESET_IDS]);
    expect(document.profiles).toHaveLength(6);
    expect(document.activeProfileId).toBe('balanced');
    const balanced = document.profiles.find((profile) => profile.id === 'balanced');
    // The neutral profile must resolve to the untouched §1 base, not a near-copy of it.
    expect(balanced?.overrides).toEqual({});
    expect(resolveConnectionSettings(document, 'balanced')).toEqual(DEFAULT_SCRAPER_SETTINGS);
  });

  it('presets are sparse overrides, so they only change what they name', () => {
    const document = doc();
    const conservative = resolveConnectionSettings(document, 'conservative');
    expect(conservative.network.concurrentRequests).toBe(1);
    expect(conservative.safety.respectRobotsTxt).toBe(true);
    // Untouched sections still come from the base.
    expect(conservative.extraction).toEqual(DEFAULT_SCRAPER_SETTINGS.extraction);
    expect(conservative.authentication).toEqual(DEFAULT_SCRAPER_SETTINGS.authentication);
  });

  it('every preset is marked built-in and therefore undeletable', () => {
    const document = doc();
    for (const preset of CONNECTION_PRESET_IDS) {
      expect(() => deleteConnectionProfile(document, preset)).toThrow(/built-in/i);
    }
  });
});

describe('connection profiles — rule inheritance', () => {
  it('resolves parent first, then the child overrides', () => {
    let document = cloneConnectionProfile(doc(), 'conservative', {
      id: 'nightly',
      name: 'Nightly',
      now: NOW,
      inherit: true,
    });
    document = patchConnectionProfile(document, 'nightly', { network: { retryAttempts: 9 } }, {
      now: NOW,
      versionId: 'v1',
    });

    const resolved = resolveConnectionSettings(document, 'nightly');
    // Inherited from conservative…
    expect(resolved.network.concurrentRequests).toBe(1);
    expect(resolved.safety.maxRequestsPerMinute).toBe(12);
    // …but the child's own override wins.
    expect(resolved.network.retryAttempts).toBe(9);
  });

  it('reports the chain root-first', () => {
    let document = cloneConnectionProfile(doc(), 'fast', { id: 'a', name: 'A', now: NOW, inherit: true });
    document = cloneConnectionProfile(document, 'a', { id: 'b', name: 'B', now: NOW, inherit: true });
    expect(connectionInheritanceChain(document, 'b').map((profile) => profile.id)).toEqual(['fast', 'a', 'b']);
  });

  it('refuses a parent that would close a cycle', () => {
    let document = cloneConnectionProfile(doc(), 'balanced', { id: 'a', name: 'A', now: NOW });
    document = cloneConnectionProfile(document, 'balanced', { id: 'b', name: 'B', now: NOW });
    document = setConnectionProfileParent(document, 'b', 'a', NOW);
    expect(() => setConnectionProfileParent(document, 'a', 'b', NOW)).toThrow(/cycle/i);
    expect(() => setConnectionProfileParent(document, 'a', 'a', NOW)).toThrow(/itself/i);
  });

  it('cuts a cycle that arrived through an import instead of looping forever', () => {
    const result = normalizeConnectionProfilesDocument({
      version: CONNECTION_PROFILES_VERSION,
      profiles: [
        { id: 'a', name: 'A', inheritsFrom: 'b' },
        { id: 'b', name: 'B', inheritsFrom: 'a' },
      ],
    }, NOW);
    const a = result.value.profiles.find((profile) => profile.id === 'a');
    const b = result.value.profiles.find((profile) => profile.id === 'b');
    expect([a?.inheritsFrom, b?.inheritsFrom]).toContain(null);
    expect(result.issues.some((issue) => /cycle/i.test(issue.message))).toBe(true);
    // And resolution terminates.
    expect(resolveConnectionSettings(result.value, 'a')).toBeTruthy();
  });

  it('re-points children at the grandparent when a middle profile is deleted', () => {
    let document = cloneConnectionProfile(doc(), 'fast', { id: 'mid', name: 'Mid', now: NOW, inherit: true });
    document = cloneConnectionProfile(document, 'mid', { id: 'leaf', name: 'Leaf', now: NOW, inherit: true });
    document = deleteConnectionProfile(document, 'mid');
    expect(document.profiles.find((profile) => profile.id === 'leaf')?.inheritsFrom).toBe('fast');
  });
});

describe('connection profiles — editing', () => {
  it('a manual patch detaches the profile from its preset and snapshots the old state', () => {
    const before = doc();
    const after = patchConnectionProfile(before, 'fast', { network: { concurrentRequests: 3 } }, {
      now: NOW,
      versionId: 'v1',
    });
    const profile = after.profiles.find((entry) => entry.id === 'fast');
    expect(profile?.preset).toBe('custom');
    expect(profile?.overrides.network?.concurrentRequests).toBe(3);
    // The retry override from the stock preset survives the partial patch.
    expect(profile?.overrides.network?.retryAttempts).toBe(1);
    expect(profile?.history[0]?.overrides.network?.concurrentRequests).toBe(8);
    expect(before.profiles.find((entry) => entry.id === 'fast')?.preset).toBe('fast');
  });

  it('rollback restores an earlier version and snapshots the state it replaced', () => {
    let document = patchConnectionProfile(doc(), 'fast', { network: { concurrentRequests: 3 } }, {
      now: NOW,
      versionId: 'v1',
    });
    document = rollbackConnectionProfile(document, 'fast', 'v1', { now: NOW, versionId: 'v2' });
    const profile = document.profiles.find((entry) => entry.id === 'fast');
    expect(profile?.overrides.network?.concurrentRequests).toBe(8);
    expect(profile?.preset).toBe('fast');
    expect(profile?.history[0]?.id).toBe('v2');
    expect(profile?.history[0]?.overrides.network?.concurrentRequests).toBe(3);
  });

  it('applying a preset replaces the overrides wholesale', () => {
    let document = patchConnectionProfile(doc(), 'balanced', { network: { retryAttempts: 7 } }, {
      now: NOW,
      versionId: 'v1',
    });
    document = applyConnectionPreset(document, 'balanced', 'low-bandwidth', { now: NOW, versionId: 'v2' });
    const profile = document.profiles.find((entry) => entry.id === 'balanced');
    expect(profile?.preset).toBe('low-bandwidth');
    expect(profile?.overrides.network?.retryAttempts).toBe(5);
    expect(resolveConnectionSettings(document, 'balanced').cache.thumbnailsEnabled).toBe(false);
  });

  it('validates names and rejects duplicate clone ids', () => {
    const document = doc();
    expect(() => updateConnectionProfileDetails(document, 'fast', { name: '   ' }, NOW)).toThrow(/empty/i);
    expect(() => cloneConnectionProfile(document, 'fast', { id: 'balanced', name: 'X', now: NOW })).toThrow(/exists/i);
    expect(() => cloneConnectionProfile(document, 'nope', { id: 'x', name: 'X', now: NOW })).toThrow(/unknown/i);
  });

  it('a plain clone stands alone; an inheriting clone starts empty', () => {
    const plain = cloneConnectionProfile(doc(), 'fast', { id: 'p', name: 'P', now: NOW });
    const inherited = cloneConnectionProfile(doc(), 'fast', { id: 'i', name: 'I', now: NOW, inherit: true });
    expect(plain.profiles.find((profile) => profile.id === 'p')?.inheritsFrom).toBeNull();
    expect(plain.profiles.find((profile) => profile.id === 'p')?.overrides.network?.concurrentRequests).toBe(8);
    expect(inherited.profiles.find((profile) => profile.id === 'i')?.inheritsFrom).toBe('fast');
    expect(inherited.profiles.find((profile) => profile.id === 'i')?.overrides).toEqual({});
    // Both still resolve identically — that is the point of inheritance.
    expect(resolveConnectionSettings(plain, 'p')).toEqual(resolveConnectionSettings(inherited, 'i'));
  });
});

describe('connection profiles — site assignment', () => {
  it('falls back to the active profile and normalizes the hostname', () => {
    let document = doc();
    expect(profileForSite(document, 'example.org')).toBe('balanced');
    document = assignSiteProfile(document, 'https://Example.ORG/browse', 'conservative');
    expect(document.siteAssignments['example.org']).toBe('conservative');
    expect(profileForSite(document, 'example.org')).toBe('conservative');
    expect(resolveConnectionSettingsForSite(document, 'example.org').network.concurrentRequests).toBe(1);
    expect(resolveConnectionSettingsForSite(document, 'other.org').network.concurrentRequests)
      .toBe(DEFAULT_SCRAPER_SETTINGS.network.concurrentRequests);
  });

  it('rejects an unusable hostname and an unknown profile', () => {
    const document = doc();
    expect(() => assignSiteProfile(document, '   ', 'fast')).toThrow(/hostname/i);
    expect(() => assignSiteProfile(document, 'example.org', 'nope')).toThrow(/unknown/i);
  });
});

describe('connection profiles — monitoring', () => {
  it('folds attempts into rates, latency percentiles and error categories', () => {
    let document = doc();
    document = recordConnectionAttempt(document, attempt({ id: 'a1', durationMs: 100 }));
    document = recordConnectionAttempt(document, attempt({ id: 'a2', durationMs: 300 }));
    document = recordConnectionAttempt(document, attempt({
      id: 'a3',
      durationMs: 5_000,
      outcome: 'failure',
      status: null,
      parsed: false,
      errorCategory: 'timeout',
    }));

    const performance = profilePerformance(document, 'balanced');
    expect(performance.attempts).toBe(3);
    expect(performance.successRate).toBeCloseTo(2 / 3, 3);
    expect(performance.failureRate).toBeCloseTo(1 / 3, 3);
    expect(performance.averageResponseMs).toBe(1_800);
    expect(performance.p50ResponseMs).toBe(300);
    expect(performance.p95ResponseMs).toBe(5_000);
    expect(performance.topErrors).toEqual([{ category: 'timeout', count: 1 }]);
    expect(performance.lastSuccessAt).toBe(NOW);
  });

  it('counts parsing only where parsing was actually attempted', () => {
    let document = doc();
    // A cache hit never reaches the parser…
    document = recordConnectionAttempt(document, attempt({ id: 'c1', fromCache: true, parsed: false }));
    // …and neither does a transport failure.
    document = recordConnectionAttempt(document, attempt({
      id: 'f1',
      outcome: 'failure',
      status: null,
      parsed: false,
      errorCategory: 'dns',
    }));
    document = recordConnectionAttempt(document, attempt({ id: 's1', parsed: true }));

    expect(document.stats.balanced.parseAttempts).toBe(1);
    expect(document.stats.balanced.parseSuccesses).toBe(1);
    expect(profilePerformance(document, 'balanced').parseSuccessRate).toBe(1);
    expect(profilePerformance(document, 'balanced').cacheHitRate).toBeCloseTo(1 / 3, 3);
  });

  it('caps request history and returns it newest-first per profile', () => {
    let document = doc();
    for (let index = 0; index < CONNECTION_ATTEMPT_HISTORY_LIMIT + 10; index += 1) {
      document = recordConnectionAttempt(document, attempt({ id: `a${index}` }));
    }
    expect(document.attemptHistory).toHaveLength(CONNECTION_ATTEMPT_HISTORY_LIMIT);
    expect(document.attemptHistory[0].id).toBe('a10');
    const recent = requestHistoryFor(document, 'balanced', 3);
    expect(recent.map((entry) => entry.id)).toEqual([
      `a${CONNECTION_ATTEMPT_HISTORY_LIMIT + 9}`,
      `a${CONNECTION_ATTEMPT_HISTORY_LIMIT + 8}`,
      `a${CONNECTION_ATTEMPT_HISTORY_LIMIT + 7}`,
    ]);
    // Stats keep counting past the history cap; only the raw log is trimmed.
    expect(document.stats.balanced.attempts).toBe(CONNECTION_ATTEMPT_HISTORY_LIMIT + 10);
  });

  it('rejects an attempt on an unknown profile rather than inventing stats', () => {
    expect(() => recordConnectionAttempt(doc(), attempt({ profileId: 'nope' }))).toThrow(/unknown/i);
  });
});

describe('connection profiles — diagnostics', () => {
  it('reports "unknown" with no data instead of a zero score', () => {
    const diagnostics = diagnoseConnectionProfile(doc(), 'balanced');
    expect(diagnostics.grade).toBe('unknown');
    expect(diagnostics.notes).toEqual(['no-data']);
  });

  it('a fast, reliable profile grades well and reports no problems', () => {
    let document = doc();
    for (let index = 0; index < 10; index += 1) {
      document = recordConnectionAttempt(document, attempt({
        id: `ok${index}`,
        durationMs: 200,
        fromCache: index % 2 === 0,
      }));
    }
    const diagnostics = diagnoseConnectionProfile(document, 'balanced');
    expect(diagnostics.connectionQuality).toBe(100);
    expect(diagnostics.parsingSuccess).toBe(100);
    expect(diagnostics.cacheEfficiency).toBe(50);
    expect(diagnostics.grade).toBe('excellent');
    expect(diagnostics.notes).toEqual(['healthy']);
  });

  it('flags selector drift separately from network trouble', () => {
    let document = doc();
    for (let index = 0; index < 10; index += 1) {
      document = recordConnectionAttempt(document, attempt({
        id: `p${index}`,
        durationMs: 200,
        parsed: index < 5,
      }));
    }
    const diagnostics = diagnoseConnectionProfile(document, 'balanced');
    // Every request succeeded; only extraction is failing.
    expect(diagnostics.connectionQuality).toBe(100);
    expect(diagnostics.parsingSuccess).toBe(50);
    expect(diagnostics.notes).toContain('parse-drift');
    expect(diagnostics.notes).not.toContain('low-success');
  });

  it('flags slow and unreliable profiles', () => {
    let document = doc();
    for (let index = 0; index < 10; index += 1) {
      document = recordConnectionAttempt(document, attempt({
        id: `s${index}`,
        durationMs: 6_000,
        outcome: index < 4 ? 'failure' : 'success',
        status: index < 4 ? null : 200,
        parsed: index >= 4,
        errorCategory: index < 4 ? 'http-5xx' : null,
      }));
    }
    const diagnostics = diagnoseConnectionProfile(document, 'balanced');
    expect(diagnostics.notes).toContain('low-success');
    expect(diagnostics.notes).toContain('high-latency');
    expect(diagnostics.grade === 'poor' || diagnostics.grade === 'fair').toBe(true);
  });

  it('does not punish a cache-only profile for never parsing', () => {
    let document = doc();
    for (let index = 0; index < 6; index += 1) {
      document = recordConnectionAttempt(document, attempt({
        id: `k${index}`,
        durationMs: 20,
        fromCache: true,
        parsed: false,
      }));
    }
    expect(diagnoseConnectionProfile(document, 'balanced').parsingSuccess).toBe(100);
  });
});

describe('connection profiles — comparison', () => {
  it('compares resolved settings, so inherited values read as equal', () => {
    const document = cloneConnectionProfile(doc(), 'fast', { id: 'copy', name: 'Copy', now: NOW, inherit: true });
    expect(compareConnectionProfiles(document, 'fast', 'copy')).toEqual([]);
  });

  it('lists differing paths in stable order', () => {
    const differences = compareConnectionProfiles(doc(), 'fast', 'conservative');
    const paths = differences.map((entry) => entry.path);
    expect(paths).toContain('network.concurrentRequests');
    expect(paths).toContain('safety.maxRequestsPerMinute');
    expect(paths).toEqual([...paths].sort());
    const concurrency = differences.find((entry) => entry.path === 'network.concurrentRequests');
    expect(concurrency).toEqual({ path: 'network.concurrentRequests', left: 8, right: 1 });
  });

  it('detects a structural difference, not just a scalar one', () => {
    const document = patchConnectionProfile(doc(), 'fast', {
      network: { proxyRotation: ['https://a.example:8080'] },
    }, { now: NOW, versionId: 'v1' });
    const differences = compareConnectionProfiles(document, 'fast', 'balanced');
    expect(differences.some((entry) => entry.path === 'network.proxyRotation')).toBe(true);
  });
});

describe('connection profiles — logging', () => {
  it('drops debug entries unless debug mode is on', () => {
    const quiet = appendConnectionLog(doc(), log({ level: 'debug' }));
    expect(quiet.logs).toHaveLength(0);
    const loud = appendConnectionLog(setConnectionDebugMode(doc(), true), log({ level: 'debug' }));
    expect(loud.logs).toHaveLength(1);
  });

  it('caps the ring buffer at the newest entries', () => {
    let document = doc();
    for (let index = 0; index < CONNECTION_LOG_LIMIT + 5; index += 1) {
      document = appendConnectionLog(document, log({ id: `l${index}` }));
    }
    expect(document.logs).toHaveLength(CONNECTION_LOG_LIMIT);
    expect(document.logs[0].id).toBe('l5');
  });

  it('filters by channel and minimum level', () => {
    let document = doc();
    document = appendConnectionLog(document, log({ id: 'n', channel: 'network', level: 'info' }));
    document = appendConnectionLog(document, log({ id: 'b', channel: 'browser', level: 'warn' }));
    document = appendConnectionLog(document, log({ id: 'e', channel: 'error', level: 'error' }));
    expect(filterConnectionLogs(document, { channel: 'browser' }).map((entry) => entry.id)).toEqual(['b']);
    expect(filterConnectionLogs(document, { level: 'warn' }).map((entry) => entry.id)).toEqual(['b', 'e']);
  });

  it('exports newline-delimited JSON that round-trips', () => {
    const document = appendConnectionLog(doc(), log({ id: 'x', code: 'connection.attempt.succeeded' }));
    const exported = exportConnectionLogs(document);
    expect(exported.split('\n')).toHaveLength(1);
    expect(JSON.parse(exported)).toMatchObject({ id: 'x', code: 'connection.attempt.succeeded' });
  });

  it('logs codes, never English sentences, when an attempt fails', () => {
    const document = recordConnectionAttempt(doc(), attempt({
      outcome: 'failure',
      status: null,
      parsed: false,
      errorCategory: 'tls',
    }));
    expect(document.logs[0].code).toBe('connection.attempt.failed.tls');
    expect(document.logs[0].channel).toBe('error');
  });

  it('buckets a performance timeline and leaves quiet periods empty', () => {
    let document = doc();
    document = recordConnectionAttempt(document, attempt({ id: 't1', startedAt: '2026-07-25T11:10:00.000Z', durationMs: 100 }));
    document = recordConnectionAttempt(document, attempt({ id: 't2', startedAt: '2026-07-25T11:20:00.000Z', durationMs: 300 }));
    const timeline = connectionTimeline(document, 'balanced', { bucketMinutes: 60, buckets: 3, now: NOW });
    expect(timeline).toHaveLength(3);
    expect(timeline.map((bucket) => bucket.attempts)).toEqual([0, 0, 2]);
    expect(timeline[2].averageResponseMs).toBe(200);
  });
});

describe('connection profiles — scheduled health checks', () => {
  it('only reports profiles whose interval has elapsed', () => {
    let document = updateConnectionProfileDetails(doc(), 'fast', { healthCheckIntervalMinutes: 60 }, NOW);
    expect(dueHealthChecks(document, NOW).map((profile) => profile.id)).toEqual(['fast']);
    document = markHealthChecked(document, 'fast', NOW);
    expect(dueHealthChecks(document, NOW)).toEqual([]);
    expect(dueHealthChecks(document, '2026-07-25T12:59:00.000Z')).toEqual([]);
    expect(dueHealthChecks(document, '2026-07-25T13:00:00.000Z').map((profile) => profile.id)).toEqual(['fast']);
  });

  it('an interval of zero disables checks entirely', () => {
    expect(dueHealthChecks(doc(), NOW)).toEqual([]);
  });
});

describe('connection profiles — batch queue', () => {
  it('orders by priority, then FIFO, then id, and honours concurrency', () => {
    let document = setConnectionQueueConcurrency(doc(), 2);
    document = enqueueConnectionJob(document, { id: 'low', profileId: 'fast', site: 'a.example', priority: 0 }, '2026-07-25T12:00:00.000Z');
    document = enqueueConnectionJob(document, { id: 'high', profileId: 'fast', site: 'b.example', priority: 5 }, '2026-07-25T12:00:01.000Z');
    document = enqueueConnectionJob(document, { id: 'mid', profileId: 'fast', site: 'c.example', priority: 5 }, '2026-07-25T12:00:02.000Z');

    // Two priority-5 jobs: the earlier enqueue wins.
    expect(nextConnectionJobs(document).map((item) => item.id)).toEqual(['high', 'mid']);
    document = markConnectionJobStarted(document, 'high', NOW);
    expect(nextConnectionJobs(document).map((item) => item.id)).toEqual(['mid']);
    document = markConnectionJobStarted(document, 'mid', NOW);
    expect(nextConnectionJobs(document)).toEqual([]);
  });

  it('breaks a same-timestamp tie on id so reloads agree', () => {
    let document = doc();
    document = enqueueConnectionJob(document, { id: 'zz', profileId: 'fast', site: 'a.example' }, NOW);
    document = enqueueConnectionJob(document, { id: 'aa', profileId: 'fast', site: 'b.example' }, NOW);
    expect(nextConnectionJobs(document).map((item) => item.id)).toEqual(['aa', 'zz']);
  });

  it('pausing stops dispatch without losing the queue', () => {
    let document = enqueueConnectionJob(doc(), { id: 'j', profileId: 'fast', site: 'a.example' }, NOW);
    document = setConnectionQueuePaused(document, true);
    expect(nextConnectionJobs(document)).toEqual([]);
    expect(document.queue.items).toHaveLength(1);
    document = setConnectionQueuePaused(document, false);
    expect(nextConnectionJobs(document).map((item) => item.id)).toEqual(['j']);
  });

  it('tracks attempts, terminal states, cancellation and cleanup', () => {
    let document = enqueueConnectionJob(doc(), { id: 'j', profileId: 'fast', site: 'a.example' }, NOW);
    document = enqueueConnectionJob(document, { id: 'k', profileId: 'fast', site: 'b.example' }, NOW);
    document = markConnectionJobStarted(document, 'j', NOW);
    document = markConnectionJobFinished(document, 'j', { state: 'failed', errorCategory: 'http-5xx' }, NOW);
    const failed = document.queue.items.find((item) => item.id === 'j');
    expect(failed).toMatchObject({ state: 'failed', attempts: 1, errorCategory: 'http-5xx' });

    document = cancelConnectionJob(document, 'k', NOW);
    document = clearFinishedConnectionJobs(document);
    expect(document.queue.items).toEqual([]);
  });

  it('rejects duplicate job ids, unknown jobs and unknown profiles', () => {
    const document = enqueueConnectionJob(doc(), { id: 'j', profileId: 'fast', site: 'a.example' }, NOW);
    expect(() => enqueueConnectionJob(document, { id: 'j', profileId: 'fast', site: 'a.example' }, NOW)).toThrow(/already queued/i);
    expect(() => enqueueConnectionJob(document, { id: 'x', profileId: 'nope', site: 'a.example' }, NOW)).toThrow(/unknown/i);
    expect(() => setConnectionJobPriority(document, 'missing', 3)).toThrow(/unknown/i);
  });

  it('drops a deleted profile’s queued work rather than orphaning it', () => {
    let document = cloneConnectionProfile(doc(), 'fast', { id: 'temp', name: 'Temp', now: NOW });
    document = enqueueConnectionJob(document, { id: 'j', profileId: 'temp', site: 'a.example' }, NOW);
    document = assignSiteProfile(document, 'a.example', 'temp');
    document = deleteConnectionProfile(document, 'temp');
    expect(document.queue.items).toEqual([]);
    expect(document.siteAssignments['a.example']).toBeUndefined();
  });
});

describe('connection profiles — normalization and portability', () => {
  it('rebuilds from known keys only and drops stale ones', () => {
    const result = normalizeConnectionProfilesDocument({
      version: CONNECTION_PROFILES_VERSION,
      activeProfileId: 'ghost',
      stray: 'value',
      profiles: [{
        id: 'x',
        name: 'X',
        icon: 'not-an-icon',
        tags: ['a', 'a', '  ', 'b'],
        overrides: { network: { concurrentRequests: 4, bogus: 1 }, nonsense: { a: 1 } },
        healthCheckIntervalMinutes: 999_999,
      }],
      siteAssignments: { 'not a host': 'x', 'good.example': 'nope' },
    }, NOW);

    expect('stray' in result.value).toBe(false);
    expect(result.value.activeProfileId).toBe('balanced');
    const profile = result.value.profiles.find((entry) => entry.id === 'x');
    expect(profile?.icon).toBe('gear');
    expect(profile?.tags).toEqual(['a', 'b']);
    expect(profile?.overrides).toEqual({ network: { concurrentRequests: 4 } });
    expect(profile?.healthCheckIntervalMinutes).toBe(10_080);
    expect(result.value.siteAssignments).toEqual({});
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('restores a built-in preset that a document lost', () => {
    const result = normalizeConnectionProfilesDocument({
      version: CONNECTION_PROFILES_VERSION,
      profiles: [{ id: 'fast', name: 'Fast', preset: 'fast' }],
    }, NOW);
    expect(result.value.profiles.map((profile) => profile.id).sort())
      .toEqual([...CONNECTION_PRESET_IDS].sort());
  });

  it('keeps a nullable session timestamp but rejects a wrong-typed one', () => {
    const result = normalizeConnectionProfilesDocument({
      profiles: [{
        id: 'x',
        name: 'X',
        overrides: { session: { expiresAt: '2026-08-01T00:00:00.000Z', lastValidatedAt: 12 } },
      }],
    }, NOW);
    const overrides = result.value.profiles.find((profile) => profile.id === 'x')?.overrides;
    expect(overrides?.session).toEqual({ expiresAt: '2026-08-01T00:00:00.000Z' });
  });

  it('normalization is idempotent', () => {
    const once = normalizeConnectionProfilesDocument(doc(), NOW).value;
    const twice = normalizeConnectionProfilesDocument(once, NOW).value;
    expect(twice).toEqual(once);
  });

  it('export carries configuration only, never the local operational record', () => {
    let document = recordConnectionAttempt(doc(), attempt());
    document = enqueueConnectionJob(document, { id: 'j', profileId: 'fast', site: 'a.example' }, NOW);
    const exported = exportConnectionProfiles(document);
    expect(Object.keys(exported).sort()).toEqual(['activeProfileId', 'profiles', 'siteAssignments', 'version']);
  });

  it('import replaces configuration and keeps this machine’s history', () => {
    let current = recordConnectionAttempt(doc(), attempt());
    current = setConnectionDebugMode(current, true);
    const incoming = exportConnectionProfiles(
      updateConnectionProfileDetails(doc(), 'fast', { name: 'Renamed' }, NOW),
    );

    const result = importConnectionProfiles(current, incoming, NOW);
    expect(result.value.profiles.find((profile) => profile.id === 'fast')?.name).toBe('Renamed');
    expect(result.value.attemptHistory).toHaveLength(1);
    expect(result.value.stats.balanced.attempts).toBe(1);
    expect(result.value.debugMode).toBe(true);
  });

  it('import drops history belonging to profiles the import removed', () => {
    let current = cloneConnectionProfile(doc(), 'fast', { id: 'temp', name: 'Temp', now: NOW });
    current = recordConnectionAttempt(current, attempt({ profileId: 'temp' }));
    expect(current.attemptHistory).toHaveLength(1);

    const result = importConnectionProfiles(current, exportConnectionProfiles(doc()), NOW);
    expect(result.value.profiles.some((profile) => profile.id === 'temp')).toBe(false);
    expect(result.value.attemptHistory).toEqual([]);
    expect(result.value.stats.temp).toBeUndefined();
  });

  it('refuses a document from a newer app version', () => {
    expect(() => importConnectionProfiles(doc(), { version: CONNECTION_PROFILES_VERSION + 1 }, NOW))
      .toThrow(/newer app version/i);
  });
});

describe('connection profiles — purity', () => {
  it('never mutates the document it was given', () => {
    const before = doc();
    const snapshot = JSON.stringify(before);
    recordConnectionAttempt(before, attempt());
    patchConnectionProfile(before, 'fast', { network: { retryAttempts: 3 } }, { now: NOW, versionId: 'v1' });
    enqueueConnectionJob(before, { id: 'j', profileId: 'fast', site: 'a.example' }, NOW);
    appendConnectionLog(setConnectionDebugMode(before, true), log());
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('produces the same document for the same inputs', () => {
    expect(createDefaultConnectionProfilesDocument(NOW)).toEqual(createDefaultConnectionProfilesDocument(NOW));
  });
});
