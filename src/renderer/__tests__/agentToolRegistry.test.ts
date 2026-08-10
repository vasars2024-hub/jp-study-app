// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  t: (key: string): string => key,
}));
import { AGENT_TOOL_OPERATIONS } from '../../shared/localAgent';
import {
  agentToolCapabilityMatrix,
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
  type AgentToolCapability,
} from '../agentToolRegistry';

const t = (key: string): string => key;
const unavailableCapability = (
  entry: AgentToolCapability,
): entry is Extract<AgentToolCapability, { available: false }> => !entry.available;

describe('central Agent tool registry', () => {
  it('classifies every declared operation as installed or explicitly unavailable', () => {
    const handlers = createCentralAgentToolRegistry(t);
    const matrix = agentToolCapabilityMatrix(handlers);

    expect(matrix).toHaveLength(AGENT_TOOL_OPERATIONS.length);
    expect(new Set(matrix.map((entry) => entry.definition.id)).size)
      .toBe(AGENT_TOOL_OPERATIONS.length);
    expect(matrix.filter((entry) => entry.available).map((entry) => entry.definition.id).sort())
      .toEqual(Object.keys(handlers).sort());
    expect(availableAgentToolOperationIds(handlers))
      .toHaveLength(AGENT_TOOL_OPERATIONS.length - 12);
  });

  it('does not advertise lookup and queue stubs as grammar, analysis or scheduling', () => {
    const handlers = createCentralAgentToolRegistry(t);
    const matrix = agentToolCapabilityMatrix(handlers);
    const unavailable = Object.fromEntries(matrix
      .filter(unavailableCapability)
      .map((entry) => [entry.definition.id, entry.reason]));

    expect(unavailable).toMatchObject({
      'dictionary.explain-grammar': 'dedicated-analysis-required',
      'dictionary.analyze-sentence': 'dedicated-analysis-required',
      'flashcard.schedule-reviews': 'false-success-stub-removed',
    });
    expect(handlers['dictionary.explain-grammar']).toBeUndefined();
    expect(handlers['dictionary.analyze-sentence']).toBeUndefined();
    expect(handlers['flashcard.schedule-reviews']).toBeUndefined();
  });

  it('records the complete current unavailable surface instead of silently growing it', () => {
    const unavailable = agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
      .filter(unavailableCapability)
      .map((entry) => entry.definition.id)
      .sort();

    expect(unavailable).toEqual([
      'anime.analyze-difficulty',
      'anime.check-releases',
      'anime.fetch-external-metadata',
      'anime.search',
      'anime.track',
      'anime.update-metadata',
      'dictionary.analyze-sentence',
      'dictionary.explain-grammar',
      'flashcard.schedule-reviews',
      'media.analyze-subtitles',
      'media.generate-profile',
      'media.organize-files',
    ]);
  });
});
