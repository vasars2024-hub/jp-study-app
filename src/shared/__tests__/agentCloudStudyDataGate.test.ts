import { describe, expect, it } from 'vitest';
import {
  AGENT_STUDY_DATA_REDACTION_NOTE,
  cloudMayReceiveStudyData,
  normalizeAgentCloudShareStudyData,
  operationsForPlanner,
  shouldAskCloudStudyDataConsent,
  toolOutputForPlanner,
} from '../agentCloudStudyDataGate';
import { normalizeLocalAgentSettings } from '../localAgentSettings';

const OPS = ['dictionary.lookup', 'study.stats-summary', 'study.known-words', 'dictionary.search-knowledge', 'calendar.list'];

describe('agentCloudStudyDataGate', () => {
  it('normalizes anything unknown to unset', () => {
    expect(normalizeAgentCloudShareStudyData(undefined)).toBe('unset');
    expect(normalizeAgentCloudShareStudyData('yes')).toBe('unset');
    expect(normalizeAgentCloudShareStudyData('allow')).toBe('allow');
    expect(normalizeAgentCloudShareStudyData('local-only')).toBe('local-only');
    expect(normalizeLocalAgentSettings({}).agentCloudShareStudyData).toBe('unset');
    expect(normalizeLocalAgentSettings({ agentCloudShareStudyData: 'allow' }).agentCloudShareStudyData).toBe('allow');
  });

  it('only allow lets study data reach the cloud', () => {
    expect(cloudMayReceiveStudyData('unset')).toBe(false);
    expect(cloudMayReceiveStudyData('local-only')).toBe(false);
    expect(cloudMayReceiveStudyData('allow')).toBe(true);
  });

  it('withholds study-data tools from the cloud planner while unset or local-only', () => {
    for (const share of ['unset', 'local-only', undefined]) {
      expect(operationsForPlanner(OPS, 'cloud', share)).toEqual(['dictionary.lookup', 'calendar.list']);
    }
    expect(operationsForPlanner(OPS, 'cloud', 'allow')).toEqual(OPS);
  });

  it('leaves the local planner unchanged', () => {
    expect(operationsForPlanner(OPS, 'local', 'unset')).toEqual(OPS);
    expect(operationsForPlanner(OPS, 'local', 'local-only')).toEqual(OPS);
    expect(operationsForPlanner(undefined, 'cloud', 'unset')).toBeUndefined();
  });

  it('redacts study-data tool output bound for the cloud', () => {
    const stats = { streak: 3, recentBooks: [{ title: 'Secret' }] };
    expect(toolOutputForPlanner('study.stats-summary', stats, 'cloud', 'unset')).toBe(AGENT_STUDY_DATA_REDACTION_NOTE);
    expect(toolOutputForPlanner('study.known-words', stats, 'cloud', 'local-only')).toBe(AGENT_STUDY_DATA_REDACTION_NOTE);
    expect(toolOutputForPlanner('study.stats-summary', stats, 'cloud', 'allow')).toBe(stats);
    expect(toolOutputForPlanner('study.stats-summary', stats, 'local', 'unset')).toBe(stats);
    expect(toolOutputForPlanner('dictionary.lookup', stats, 'cloud', 'unset')).toBe(stats);
  });

  it('asks once, only with a cloud key configured', () => {
    expect(shouldAskCloudStudyDataConsent('unset', true)).toBe(true);
    expect(shouldAskCloudStudyDataConsent('unset', false)).toBe(false);
    expect(shouldAskCloudStudyDataConsent('allow', true)).toBe(false);
    expect(shouldAskCloudStudyDataConsent('local-only', true)).toBe(false);
  });
});
