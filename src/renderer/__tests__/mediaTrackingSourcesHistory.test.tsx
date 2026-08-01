// @vitest-environment jsdom
/**
 * **This file never ran until slice 40** — `vitest.config.ts` collects
 * `src/renderer/__tests__/**\/*.test.ts`, and this is a `.tsx`. Its first execution failed
 * twice, both times in the test rather than in the product: an assertion that read
 * `querySelector('button')` when the panel had gained an assign control above the audit
 * block, and the value-tracker trap below.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTrackingSourceAudit, exportTrackingSourceAudit, loadTrackingSourceAudit, saveTrackingSourceAuditRetention } from '../mediaTrackingSourcesStore';
import { MediaTrackingSources } from '../components/media/MediaTrackingSources';

vi.mock('../verifiedSitesStore', () => ({ loadVerifiedSitesDocument: () => ({ sites: [] }) }));
vi.mock('../mediaProviderStore', () => ({ loadMediaProvidersDocument: () => ({ providers: [] }) }));

/**
 * Type into a CONTROLLED input the way React can see.
 *
 * `input.value = x` writes straight past React's value tracker, so the synthetic `change`
 * never fires and `onChange` never runs — the element shows the new text and the component
 * knows nothing about it. That is what made this test's retention assertion read `null`: the
 * store was never written because the handler was never called. The product is a controlled
 * `<input type="number" value={auditRetention} onChange={…}>` and is fine.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('media tracking source history', () => {
  it('sorts audit entries newest-first and exports deterministic JSON', async () => {
    const store = await import('../mediaTrackingSourcesStore');
    localStorage.setItem(store.MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY, JSON.stringify([
      { sequence: 2, identityId: 'anime-2', sourceId: 'site-b', sourceName: 'B', changedAt: '2026-07-23T10:00:00.000Z', patch: {}, before: {}, after: {} },
      { sequence: 1, identityId: 'anime-1', sourceId: 'site-a', sourceName: 'A', changedAt: '2026-07-23T09:00:00.000Z', patch: {}, before: {}, after: {} },
    ]));
    expect(loadTrackingSourceAudit().map((entry) => entry.sequence)).toEqual([2, 1]);
    const exported = JSON.parse(exportTrackingSourceAudit()) as { entries: Array<{ sequence: number }> };
    expect(exported.entries.map((entry) => entry.sequence)).toEqual([2, 1]);
  });

  it('clamps retention and clears stored audit history', async () => {
    const store = await import('../mediaTrackingSourcesStore');
    expect(saveTrackingSourceAuditRetention(999)).toBe(200);
    localStorage.setItem(store.MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY, JSON.stringify([{ sequence: 1, identityId: 'anime-1', sourceId: 'site-a', sourceName: 'A', changedAt: '2026-07-23T09:00:00.000Z', patch: {}, before: {}, after: {} }]));
    clearTrackingSourceAudit();
    expect(loadTrackingSourceAudit()).toEqual([]);
  });

  it('renders audit management controls in the source monitoring panel', async () => {
    const store = await import('../mediaTrackingSourcesStore');
    store.saveMediaTrackingSourcesDocument({
      version: 1,
      sourceOrder: ['site-a'],
      disabledSourceIds: [],
      rows: [{ identityId: 'anime-1', sourceId: 'site-a', sourceName: 'Site A', enabled: true, lastCheckedAt: null, status: 'working', reliabilityScore: 91, newEpisodeDetected: true, nextEpisodeNumber: 4 }],
    });
    localStorage.setItem(store.MEDIA_TRACKING_SOURCES_AUDIT_STORAGE_KEY, JSON.stringify([{ sequence: 1, identityId: 'anime-1', sourceId: 'site-a', sourceName: 'Site A', changedAt: '2026-07-23T09:00:00.000Z', patch: { status: 'working' }, before: { status: 'unknown' }, after: { status: 'working' } }]));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<MediaTrackingSources identityId="anime-1" titleFor={() => 'Anime 1'} />); });
    expect(host.querySelector('.media-tracking-source-audit')?.textContent).toContain('Health edit history');
    // Scoped to the audit block, not `querySelector('button')`. This file never ran until
    // slice 40, and its first execution failed here reading "Assign" — the panel's own
    // assign control, which now renders above the audit section. The panel is fine; the
    // assertion was describing a layout that had moved. Name the button, not its position.
    const auditButtons = [...host.querySelectorAll('.media-tracking-source-audit button')]
      .map((button) => button.textContent);
    expect(auditButtons).toContain('Export JSON');
    const retention = host.querySelector('.media-tracking-source-audit input[type="number"]') as HTMLInputElement;
    await act(async () => { typeInto(retention, '5'); });
    expect(localStorage.getItem(store.MEDIA_TRACKING_SOURCES_AUDIT_RETENTION_STORAGE_KEY)).toBe('5');
    root.unmount();
  });
});
