// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  consumePendingReadingWorkspaceRoute,
  isReadingWorkspaceOpenDetail,
  publishReadingWorkspaceRoute,
  resolveReadingWorkspaceOpenRequest,
  subscribeReadingWorkspaceRoutes,
} from '../readingWorkspaceNavigation';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../shared/readingWorkspace';

describe('Reading workspace desktop handoffs', () => {
  it('keeps the former Finder names as live Discover aliases', () => {
    for (const alias of ['reading-finder', 'readingfinder']) {
      expect(resolveReadingWorkspaceOpenRequest(alias)).toMatchObject({
        host: 'reading',
        route: { section: 'discover', intent: 'browse' },
      });
    }
  });

  it('does not steal ordinary desktop compatibility ids', () => {
    for (const appId of ['reading', 'novels', 'library', 'dictionary']) {
      expect(resolveReadingWorkspaceOpenRequest(appId)).toBeNull();
    }
  });

  it('keeps section, intent, and identity from a versioned deep link', () => {
    expect(resolveReadingWorkspaceOpenRequest(
      'reading://workspace/library?v=1&intent=open&workId=work-1&editionId=ed-1&itemId=item-1',
    )).toEqual({
      host: 'reading',
      route: {
        version: READING_WORKSPACE_SCHEMA_VERSION,
        section: 'library',
        intent: 'open',
        workId: 'work-1',
        editionId: 'ed-1',
        itemId: 'item-1',
      },
    });
  });

  it('recognizes malformed Reading handoffs so the shell can refuse them safely', () => {
    const future = { version: 99, section: 'library' };
    expect(isReadingWorkspaceOpenDetail(future)).toBe(true);
    expect(isReadingWorkspaceOpenDetail('reading://workspace/library?v=99')).toBe(true);
    expect(resolveReadingWorkspaceOpenRequest(future)).toBeNull();
    expect(resolveReadingWorkspaceOpenRequest('reading://workspace/library?v=99')).toBeNull();
  });

  it('routes planning destinations to the retained Novels host', () => {
    expect(resolveReadingWorkspaceOpenRequest({
      version: READING_WORKSPACE_SCHEMA_VERSION,
      section: 'imports',
      intent: 'import',
      workId: 'work-2',
    })).toMatchObject({ host: 'novels', route: { section: 'imports', workId: 'work-2' } });
  });

  it('retains a route until a lazy host can consume it', () => {
    const request = resolveReadingWorkspaceOpenRequest('reading-finder');
    if (!request) throw new Error('fixture should resolve');
    publishReadingWorkspaceRoute(request.route);
    expect(consumePendingReadingWorkspaceRoute('reading')).toEqual(request.route);
    expect(consumePendingReadingWorkspaceRoute('reading')).toBeNull();
  });

  it('delivers directly to an already-mounted host without leaving stale work', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeReadingWorkspaceRoutes('novels', listener);
    const request = resolveReadingWorkspaceOpenRequest({ section: 'sources', intent: 'browse' });
    if (!request) throw new Error('fixture should resolve');
    publishReadingWorkspaceRoute(request.route);
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(request.route);
    expect(consumePendingReadingWorkspaceRoute('novels')).toBeNull();
  });
});
