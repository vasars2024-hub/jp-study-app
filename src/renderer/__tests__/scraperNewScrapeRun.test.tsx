// @vitest-environment jsdom
/**
 * New Scrape's run: pending cancel, rehydration, the profile it runs under.
 *
 * - A cancel clicked before `startScrape` resolved had no id to cancel and was
 *   dropped, so the job ran to the end behind a page that said "Cancelled".
 * - The page is remounted on every navigation and kept the run in component
 *   state, so coming back mid-scrape showed an idle form over a live job.
 * - Every run was sent `profileId: 'balanced'`, whichever profile was selected.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import NewScrapePage from '../components/scraper/pages/NewScrapePage';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider, type ScraperPort } from '../components/scraper/data/scraperPort';
import { scrapeRunTrackerFor } from '../components/scraper/data/scrapeRunTracker';
import { localizeScraperJobNote, scraperErrorText } from '../components/scraper/localize';
import { SCRAPER_SETTINGS_STORAGE_KEY } from '../scraperSettingsStore';
import { createDefaultScraperSettingsDocument } from '../../shared/scraperSettings';
import type { ScraperController } from '../components/scraper/types';
import type { ScrapeJobEvent, ScrapeJobSummary, ScrapeRequest } from '../../shared/scraperResults';

interface FakePort {
  port: ScraperPort;
  requests: ScrapeRequest[];
  cancelled: string[];
  emit: (jobId: string, event: ScrapeJobEvent) => void;
  resolveStart: (jobId: string) => void;
  jobs: ScrapeJobSummary[];
}

/** A port whose `startScrape` resolves only when the test says so. */
function fakePort(): FakePort {
  const requests: ScrapeRequest[] = [];
  const cancelled: string[] = [];
  const listeners = new Map<string, Set<(event: ScrapeJobEvent) => void>>();
  const starts: Array<(id: string) => void> = [];
  const jobs: ScrapeJobSummary[] = [];
  const port = {
    startScrape: (request: ScrapeRequest) => {
      requests.push(request);
      return new Promise<string>((resolve) => starts.push(resolve));
    },
    cancelScrape: async (jobId: string) => {
      cancelled.push(jobId);
    },
    subscribeJob: (jobId: string, listener: (event: ScrapeJobEvent) => void) => {
      const set = listeners.get(jobId) ?? new Set();
      set.add(listener);
      listeners.set(jobId, set);
      return () => set.delete(listener);
    },
    listJobs: async () => jobs,
    getResult: async () => {
      throw new Error('no result');
    },
    freeSpace: async () => ({ bytes: null }),
  } as unknown as ScraperPort;
  return {
    port,
    requests,
    cancelled,
    jobs,
    emit: (jobId, event) => {
      for (const listener of listeners.get(jobId) ?? []) listener(event);
    },
    resolveStart: (jobId) => starts.shift()?.(jobId),
  };
}

function controller(targetUrl = 'https://example.test/anime/1'): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    navigate: vi.fn(),
    compact: false,
    openDrawer: vi.fn(),
    resultTab: 'episodes',
    setResultTab: vi.fn(),
    visibleColumns: [],
    setVisibleColumns: vi.fn(),
    sortColumn: 'episode',
    sortDir: 'asc',
    setSort: vi.fn(),
    groupBy: 'none',
    setGroupBy: vi.fn(),
    pageSize: 50,
    setPageSize: vi.fn(),
    density: 'comfortable',
    targetUrl,
    setTargetUrl: vi.fn(),
  } as unknown as ScraperController;
}

let host: HTMLDivElement;
let root: Root | null = null;

async function mount(port: ScraperPort): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      createElement(
        ScraperPortProvider,
        { value: port },
        createElement(ScraperProvider, { value: controller() }, createElement(NewScrapePage)),
      ),
    );
  });
}

async function unmount(): Promise<void> {
  await act(async () => root?.unmount());
  root = null;
}

const startButton = () =>
  Array.from(host.querySelectorAll('button')).find((b) => /Start|Cancel/.test(b.textContent ?? '')) ?? null;
const stageText = () => host.querySelector('.scr-run-stage')?.textContent ?? '';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  localStorage.clear();
  const noop = (): void => undefined;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
});

afterEach(async () => {
  await unmount();
  host.remove();
  localStorage.clear();
});

describe('scrape run tracker', () => {
  it('sends a cancel clicked while the job id is pending, once the id arrives', async () => {
    const fake = fakePort();
    const tracker = scrapeRunTrackerFor(fake.port);
    const started = tracker.start({ targetUrl: 'x', profileId: 'p' });
    expect(tracker.getSnapshot().run.jobId).toBe('pending');

    await tracker.cancel();
    expect(fake.cancelled).toEqual([]);
    expect(tracker.getSnapshot().run.stage).toBe('cancelled');

    fake.resolveStart('job-7');
    await started;
    expect(fake.cancelled).toEqual(['job-7']);
    expect(tracker.isRunning()).toBe(false);
  });

  it('keeps following a job with no page attached, so "done" is not missed', async () => {
    const fake = fakePort();
    const tracker = scrapeRunTrackerFor(fake.port);
    const started = tracker.start({ targetUrl: 'x', profileId: 'p' });
    fake.resolveStart('job-8');
    await started;
    fake.emit('job-8', { kind: 'stage', stage: 'fetching' });
    expect(tracker.getSnapshot().run.stage).toBe('fetching');
    expect(scrapeRunTrackerFor(fake.port)).toBe(tracker);
  });

  it('adopts a job main reports as running', () => {
    const fake = fakePort();
    const tracker = scrapeRunTrackerFor(fake.port);
    tracker.adopt({ id: 'job-9', stage: 'searching' });
    expect(tracker.isRunning()).toBe(true);
    fake.emit('job-9', { kind: 'done', summary: { failed: 0, provider: 'p', found: 1 } as ScrapeJobSummary });
    expect(tracker.getSnapshot().run.stage).toBe('done');
  });
});

describe('New Scrape page', () => {
  it('runs under the selected profile, not a hard-coded one', async () => {
    const doc = createDefaultScraperSettingsDocument('2026-10-08T00:00:00.000Z');
    const other = doc.profiles.find((p) => p.id !== doc.activeProfileId);
    if (!other) throw new Error('default document has a single profile');
    doc.activeProfileId = other.id;
    localStorage.setItem(SCRAPER_SETTINGS_STORAGE_KEY, JSON.stringify(doc));

    const fake = fakePort();
    await mount(fake.port);
    await act(async () => {
      startButton()?.click();
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].profileId).toBe(other.id);
  });

  it('shows the running job again after navigating away and back', async () => {
    const fake = fakePort();
    await mount(fake.port);
    await act(async () => {
      startButton()?.click();
    });
    await act(async () => {
      fake.resolveStart('job-11');
    });
    await act(async () => {
      fake.emit('job-11', { kind: 'stage', stage: 'fetching' });
    });
    expect(stageText()).toBe('Fetching');

    await unmount();
    // The job moves on while no page is mounted.
    fake.emit('job-11', { kind: 'stage', stage: 'subtitles' });
    await mount(fake.port);
    expect(stageText()).toBe('Collecting subtitles');
    expect(startButton()?.textContent).toContain('Cancel');
  });

  it('picks up a job main already has running', async () => {
    const fake = fakePort();
    fake.jobs.push({ id: 'job-12', stage: 'parsing' } as ScrapeJobSummary);
    await mount(fake.port);
    await act(async () => {
      await Promise.resolve();
    });
    expect(stageText()).toBe('Extracting');
  });

  it('cancels a pending start once the id arrives', async () => {
    const fake = fakePort();
    await mount(fake.port);
    await act(async () => {
      startButton()?.click();
    });
    await act(async () => {
      startButton()?.click();
    });
    expect(fake.cancelled).toEqual([]);
    await act(async () => {
      fake.resolveStart('job-13');
    });
    expect(fake.cancelled).toEqual(['job-13']);
  });
});

describe('scraperErrorText', () => {
  it('strips Electron\'s IPC wrapper and translates known engine sentences', () => {
    const raw = new Error("Error invoking remote method 'scraper:startScrape': Error: There is nothing to search for.");
    const text = scraperErrorText(raw);
    expect(text).not.toContain('Error invoking remote method');
    expect(text).toContain('nothing to search for');
  });

  it('passes an unknown message through without the wrapper', () => {
    const raw = new Error("Error invoking remote method 'scraper:x': Error: boom");
    expect(scraperErrorText(raw)).toBe('boom');
  });

  it('localises the fixed sentences a job note is built from', () => {
    const note = 'Some rule checks did not pass. Missing episode numbers: 1, 2, 3, 4, 5, 6, 7, 8, +2 more.';
    const text = localizeScraperJobNote(note);
    expect(text).toContain('1, 2, 3, 4, 5, 6, 7, 8');
    expect(text).toContain('2 more');
    expect(localizeScraperJobNote('free text')).toBe('free text');
  });
});
