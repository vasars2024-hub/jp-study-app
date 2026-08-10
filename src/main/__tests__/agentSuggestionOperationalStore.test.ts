// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyAgentOperationalState } from '../../shared/agentOperationalState';
import { createAgentOperationalStore } from '../agentOperationalStore';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Agent suggestion operational persistence', () => {
  it('round-trips preference edits beside an active execution marker in both directions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-suggestions-'));
    roots.push(root);
    const store = createAgentOperationalStore(root, () => 100);
    const base = emptyAgentOperationalState();
    const claimed = store.write({
      ...base,
      queue: {
        version: 1,
        items: [{
          id: 'task',
          task: {
            id: 'task', objective: 'test', status: 'running', createdAt: 1, updatedAt: 2, steps: [],
          },
          status: 'paused',
          priority: 0,
          createdAt: 1,
          updatedAt: 2,
          execution: {
            version: 1,
            stepId: 'step',
            callId: 'call',
            action: 'run-next',
            previousStatus: 'queued',
            startedAt: 2,
            expiresAt: 200,
          },
        }],
      },
    });

    const preferenceEdit = store.write({
      ...claimed,
      suggestions: {
        ...claimed.suggestions,
        enabled: false,
        sources: { ...claimed.suggestions?.sources, dictionary: false },
      },
    });
    expect(preferenceEdit.queue.items[0].execution?.callId).toBe('call');

    const queueEdit = store.write({
      ...preferenceEdit,
      queue: {
        ...preferenceEdit.queue,
        items: preferenceEdit.queue.items.map((item) => ({ ...item, priority: 9 })),
      },
    });
    const reread = createAgentOperationalStore(root, () => 100).read();
    expect(queueEdit.suggestions?.enabled).toBe(false);
    expect(reread.suggestions?.sources.dictionary).toBe(false);
    expect(reread.queue.items[0]).toMatchObject({ priority: 9 });
    expect(reread.queue.items[0].execution).toMatchObject({ callId: 'call' });
  });
});
