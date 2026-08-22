import { describe, expect, it } from 'vitest';
import {
  AGENT_AUTOMATION_RUN_LIMIT,
  AGENT_AUTOMATION_RUN_RETENTION_MS,
  appendAgentAutomationRun,
  emptyAgentAutomationRunLog,
  failLatestDeliveredAgentAutomationRun,
  normalizeAgentAutomationRunLog,
  normalizeAgentAutomationRunFailureReport,
  pruneAgentAutomationRunLog,
  type AgentAutomationRun,
} from '../localAgentAutomationRuns';

const NOW = Date.UTC(2027, 0, 6, 9, 0, 0);

function run(overrides: Partial<AgentAutomationRun> = {}): AgentAutomationRun {
  return { automationId: 'a1', at: NOW, outcome: 'delivered', handlers: 1, ...overrides };
}

describe('normalizeAgentAutomationRunLog', () => {
  it('fails closed to empty on anything that is not a v1 log', () => {
    for (const input of [null, undefined, 'log', [], { version: 2, runs: [run()] }]) {
      expect(normalizeAgentAutomationRunLog(input)).toEqual(emptyAgentAutomationRunLog());
    }
  });

  it('drops a malformed row and keeps the rest', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [
        run({ automationId: 'keep' }),
        { automationId: '', at: NOW, outcome: 'missed' },
        { automationId: 'no-outcome', at: NOW, outcome: 'ran' },
        { automationId: 'no-time', outcome: 'missed' },
        run({ automationId: 'keep-too', outcome: 'missed', handlers: 0 }),
      ],
    });
    expect(log.runs.map((entry) => entry.automationId)).toEqual(['keep', 'keep-too']);
  });

  it('keeps the same automation twice — two runs are two runs', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [run({ at: NOW }), run({ at: NOW - 86_400_000 })],
    });
    expect(log.runs).toHaveLength(2);
  });

  it('sorts newest first and caps the log', () => {
    const rows = Array.from({ length: AGENT_AUTOMATION_RUN_LIMIT + 20 }, (_, index) => (
      run({ automationId: `a${index}`, at: NOW - index })
    ));
    const log = normalizeAgentAutomationRunLog({ version: 1, runs: [...rows].reverse() });
    expect(log.runs).toHaveLength(AGENT_AUTOMATION_RUN_LIMIT);
    expect(log.runs[0].at).toBe(NOW);
  });

  it('never invents free text — an unknown field does not survive', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [{ ...run(), name: 'Morning review', objective: 'summarize my day' }],
    });
    expect(Object.keys(log.runs[0]).sort()).toEqual(['at', 'automationId', 'handlers', 'outcome']);
  });

  it('keeps a bounded failure code and rejects a failed row without one', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [
        run({ outcome: 'failed', failureCode: 'planner-unavailable' }),
        { ...run({ automationId: 'drop', outcome: 'failed' }), failureCode: 'C:\\secret.gguf' },
      ],
    });
    expect(log.runs).toEqual([
      run({ outcome: 'failed', failureCode: 'planner-unavailable' }),
    ]);
  });
});

describe('failure reports', () => {
  it('normalizes only bounded ids and codes', () => {
    expect(normalizeAgentAutomationRunFailureReport({
      automationId: '  a1  ',
      failureCode: 'store-failed',
      message: 'C:\\models\\private.gguf',
    })).toEqual({ automationId: 'a1', failureCode: 'store-failed' });
    expect(normalizeAgentAutomationRunFailureReport({
      automationId: 'a1',
      failureCode: 'C:\\models\\private.gguf',
    })).toBeNull();
  });

  it('amends the newest delivered fire without inventing a second run', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [
        run({ at: NOW, outcome: 'delivered' }),
        run({ at: NOW - 86_400_000, outcome: 'delivered' }),
      ],
    });
    const failed = failLatestDeliveredAgentAutomationRun(log, {
      automationId: 'a1',
      failureCode: 'planner-unavailable',
    });
    expect(failed?.runs).toEqual([
      run({ at: NOW, outcome: 'failed', failureCode: 'planner-unavailable' }),
      run({ at: NOW - 86_400_000, outcome: 'delivered' }),
    ]);
  });

  it('refuses to fabricate or overwrite a run that was not delivered', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [run({ outcome: 'missed', handlers: 0 })],
    });
    expect(failLatestDeliveredAgentAutomationRun(log, {
      automationId: 'a1',
      failureCode: 'planner-unavailable',
    })).toBeNull();
  });
});

describe('appendAgentAutomationRun', () => {
  it('puts the new run first', () => {
    const log = appendAgentAutomationRun(
      normalizeAgentAutomationRunLog({ version: 1, runs: [run({ automationId: 'old', at: NOW - 10 })] }),
      run({ automationId: 'new' }),
    );
    expect(log.runs.map((entry) => entry.automationId)).toEqual(['new', 'old']);
  });
});

describe('pruneAgentAutomationRunLog', () => {
  it('drops runs past the retention window', () => {
    const log = normalizeAgentAutomationRunLog({
      version: 1,
      runs: [run({ automationId: 'fresh' }), run({
        automationId: 'stale',
        at: NOW - AGENT_AUTOMATION_RUN_RETENTION_MS - 1,
      })],
    });
    expect(pruneAgentAutomationRunLog(log, NOW).runs.map((entry) => entry.automationId))
      .toEqual(['fresh']);
  });

  it('returns the SAME object when nothing expires', () => {
    const log = normalizeAgentAutomationRunLog({ version: 1, runs: [run()] });
    expect(pruneAgentAutomationRunLog(log, NOW)).toBe(log);
  });
});
