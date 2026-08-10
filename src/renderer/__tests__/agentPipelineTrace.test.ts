// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  pipelineCommandLabel,
  pipelineHasDiscrepancy,
  pipelineVerdict,
  summarizeArguments,
  type AgentPipelineLine,
} from '../../shared/agentPipelineTrace';
import {
  buildAgentPipelineLines,
  resolveAgentEntities,
  resolvableEntityTypes,
} from '../agentPipelineVerify';
import {
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
  type AgentOperationDraft,
  type AgentOperationLog,
} from '../../shared/agentOperationLog';
import { addDeckCardsTracked, createDeckFolder } from '../flashcardDeck';

function line(overrides: Partial<AgentPipelineLine>): AgentPipelineLine {
  return {
    seq: 1,
    operation: 'flashcard.add-cards',
    status: 'ok',
    argumentSummary: '',
    claimedIds: [],
    foundIds: [],
    verdict: 'unverifiable',
    ...overrides,
  };
}

describe('pipelineVerdict', () => {
  it('verifies only when every claimed id is present', () => {
    expect(pipelineVerdict(['a', 'b'], ['a', 'b'], true)).toBe('verified');
    expect(pipelineVerdict(['a', 'b'], ['b', 'a', 'c'], true)).toBe('verified');
  });

  it('reports a false success as missing, not as ok', () => {
    // The adapter returned ids and the step "succeeded", but nothing is in the
    // store. This is the exact failure the terminal exists to surface.
    expect(pipelineVerdict(['a', 'b'], [], true)).toBe('missing');
  });

  it('reports a partial write rather than rounding it either way', () => {
    expect(pipelineVerdict(['a', 'b', 'c'], ['a'], true)).toBe('partial');
  });

  it('verifies a deletion by absence, not by presence', () => {
    // Scoring a delete like a create inverts every verdict: the perfect delete
    // finds nothing, and the delete that silently did nothing finds everything.
    expect(pipelineVerdict(['a', 'b'], [], true, 'deleted')).toBe('verified');
    expect(pipelineVerdict(['a', 'b'], ['a', 'b'], true, 'deleted')).toBe('missing');
    expect(pipelineVerdict(['a', 'b'], ['a'], true, 'deleted')).toBe('partial');
    // And the created path is unchanged by the new argument.
    expect(pipelineVerdict(['a'], ['a'], true, 'created')).toBe('verified');
  });

  it('never turns an absent check into a pass', () => {
    // No contract at all...
    expect(pipelineVerdict(['a'], ['a'], false)).toBe('unverifiable');
    // ...and a contract that produced no ids to look for.
    expect(pipelineVerdict([], [], true)).toBe('unverifiable');
  });
});

describe('pipelineHasDiscrepancy', () => {
  it('flags failures and unsupported claims, and stays quiet otherwise', () => {
    expect(pipelineHasDiscrepancy([line({ verdict: 'verified' })])).toBe(false);
    expect(pipelineHasDiscrepancy([line({ verdict: 'unverifiable' })])).toBe(false);
    expect(pipelineHasDiscrepancy([line({ verdict: 'missing' })])).toBe(true);
    expect(pipelineHasDiscrepancy([line({ verdict: 'partial' })])).toBe(true);
    expect(pipelineHasDiscrepancy([line({ status: 'failed', verdict: 'verified' })])).toBe(true);
  });
});

describe('summarizeArguments', () => {
  it('shows the values, so the user can check what was targeted', () => {
    expect(summarizeArguments({ presetId: 'idiom-slang', cardCount: 3, reverse: false }))
      .toBe('presetId="idiom-slang" cardCount=3 reverse=false');
  });

  it('keeps the key visible when a value is long', () => {
    const summary = summarizeArguments({ sentence: 'あ'.repeat(200) });
    expect(summary.startsWith('sentence="')).toBe(true);
    expect(summary.length).toBeLessThan(80);
  });

  it('collapses containers instead of dumping them', () => {
    expect(summarizeArguments({ terms: [1, 2, 3], patch: { a: 1 } })).toBe('terms=[3] patch={…}');
  });

  it('drops undefined but keeps null, which is a real argument', () => {
    expect(summarizeArguments({ a: undefined, b: null })).toBe('b=null');
  });
});

describe('pipelineCommandLabel', () => {
  it('reads as a command', () => {
    expect(pipelineCommandLabel('flashcard.add-cards')).toBe('flashcard:add-cards');
    expect(pipelineCommandLabel('flashcard.generate-cards')).toBe('flashcard:generate-cards');
  });
});

describe('resolveAgentEntities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('finds cards that really landed, and says where', () => {
    const created = addDeckCardsTracked([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import', bookTitle: 'Novel — Ch. 5' },
    ]);
    const resolution = resolveAgentEntities('flashcard', created.map((card) => card.id));

    expect(resolution.resolvable).toBe(true);
    expect(resolution.foundIds).toEqual(created.map((card) => card.id));
    expect(resolution.destination).toBe('Novel — Ch. 5');
  });

  it('finds nothing for ids that were claimed but never written', () => {
    const resolution = resolveAgentEntities('flashcard', ['ghost-1', 'ghost-2']);
    expect(resolution.resolvable).toBe(true);
    expect(resolution.foundIds).toEqual([]);
    // Which is what turns into a `missing` verdict rather than a silent pass.
    expect(pipelineVerdict(['ghost-1', 'ghost-2'], resolution.foundIds, true)).toBe('missing');
  });

  it('surfaces cards split across two places, which a card count would hide', () => {
    const created = addDeckCardsTracked([
      { word: '本', reading: 'ほん', meaning: 'book', source: 'import', bookTitle: 'A' },
      { word: '空', reading: 'そら', meaning: 'sky', source: 'import', bookTitle: 'B' },
    ]);
    const resolution = resolveAgentEntities('flashcard', created.map((card) => card.id));
    expect(resolution.destination?.split(', ').sort()).toEqual(['A', 'B']);
  });

  it('resolves a created deck folder by name', () => {
    createDeckFolder('Chapter 5 mining');
    const resolution = resolveAgentEntities('flashcard-deck', ['Chapter 5 mining', 'Nope']);
    expect(resolution.foundIds).toEqual(['Chapter 5 mining']);
  });

  it('refuses to guess for an entity type it cannot read', () => {
    // study-workspace lives behind IPC; reporting it as verified would be a lie.
    const resolution = resolveAgentEntities('study-workspace', ['workspace-1']);
    expect(resolution.resolvable).toBe(false);
    expect(resolution.foundIds).toEqual([]);
    expect(pipelineVerdict(['workspace-1'], [], false)).toBe('unverifiable');
  });

  it('is unresolvable when there is nothing to check', () => {
    expect(resolveAgentEntities('flashcard', []).resolvable).toBe(false);
    expect(resolveAgentEntities(undefined, ['a']).resolvable).toBe(false);
  });

  it('declares exactly which entity types it can prove', () => {
    expect(resolvableEntityTypes()).toEqual(['calendar-event', 'flashcard', 'flashcard-deck']);
  });
});

describe('buildAgentPipelineLines', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const logOf = (...drafts: AgentOperationDraft[]): AgentOperationLog => drafts.reduce(
    (log, entry, index) => agentOperationLogAppend(log, entry, 1_700_000_000_000 + index),
    AGENT_OPERATION_LOG_EMPTY,
  );

  it('shows what each step targeted, not just what it produced', () => {
    // The question the terminal exists to answer is "did it aim at the right
    // book and chapters", and the destination alone cannot answer it: two runs
    // over different chapters land in the same deck group.
    const created = addDeckCardsTracked([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import', bookTitle: 'Novel — Ch. 1-5' },
    ]);
    const lines = buildAgentPipelineLines(logOf({
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'flashcard',
      entityIds: created.map((card) => card.id),
      arguments: { bookId: 'novel-7', from: 1, to: 5 },
      callId: 'call-1',
    }));

    expect(lines).toHaveLength(1);
    expect(lines[0].argumentSummary).toBe('bookId="novel-7" from=1 to=5');
    expect(lines[0].verdict).toBe('verified');
    expect(lines[0].destination).toBe('Novel — Ch. 1-5');
  });

  it('distinguishes two steps that differ only in what they targeted', () => {
    const lines = buildAgentPipelineLines(logOf(
      {
        operation: 'flashcard.add-cards',
        claim: 'created',
        entityType: 'flashcard',
        entityIds: ['ghost-1'],
        arguments: { bookId: 'novel-7', from: 1, to: 5 },
        callId: 'call-1',
      },
      {
        operation: 'flashcard.add-cards',
        claim: 'created',
        entityType: 'flashcard',
        entityIds: ['ghost-2'],
        arguments: { bookId: 'novel-7', from: 6, to: 9 },
        callId: 'call-2',
      },
    ));

    // Oldest first: the log is newest-first for Undo, a terminal reads downward.
    expect(lines.map((entry) => entry.seq)).toEqual([0, 1]);
    expect(lines.map((entry) => entry.argumentSummary)).toEqual([
      'bookId="novel-7" from=1 to=5',
      'bookId="novel-7" from=6 to=9',
    ]);
    // Neither was actually written, so both must read as false successes.
    expect(lines.every((entry) => entry.verdict === 'missing')).toBe(true);
  });

  it('renders an empty summary for an operation that took no arguments', () => {
    const lines = buildAgentPipelineLines(logOf({
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'flashcard',
      entityIds: ['ghost-1'],
      callId: 'call-1',
    }));
    expect(lines[0].argumentSummary).toBe('');
  });
});
