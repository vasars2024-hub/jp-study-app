// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AGENT_TOOL_OPERATIONS,
} from '../../shared/localAgent';
import type { AgentProfile } from '../../shared/localAgentProfiles';
import { DEFAULT_LOCAL_AGENT_SETTINGS } from '../../shared/localAgentSettings';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import {
  agentCapabilityOperationLabelKey,
  buildAgentCapabilityDirectory,
} from '../agentCapabilityDirectory';
import {
  agentToolCapabilityMatrix,
  createCentralAgentToolRegistry,
} from '../agentToolRegistry';
import { AgentCapabilityDirectory } from '../components/agent/AgentCapabilityDirectory';

const allOperations = AGENT_TOOL_OPERATIONS.map((definition) => definition.id);

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: 'test-profile',
    name: 'Test profile',
    description: '',
    role: 'custom',
    preferredModelFileName: '',
    permission: 'full-automation',
    enabledOperations: allOperations,
    responseLength: 'balanced',
    explanationDepth: 'standard',
    language: 'english',
    teachingStyle: 'tutor',
    correctionStyle: 'gentle',
    enabled: true,
    ...overrides,
  };
}

const settings = {
  ...DEFAULT_LOCAL_AGENT_SETTINGS,
  enabled: true,
  permission: 'full-automation' as const,
};

const capabilities = () => agentToolCapabilityMatrix(createCentralAgentToolRegistry((key) => key));

describe('Agent capability directory authority projection', () => {
  it('never treats a declared operation as available without a real installed adapter', () => {
    const rows = buildAgentCapabilityDirectory(
      capabilities(),
      settings,
      profile(),
    );

    expect(rows).toHaveLength(AGENT_TOOL_OPERATIONS.length);
    expect(rows.find((row) => row.id === 'dictionary.lookup')).toMatchObject({
      available: true,
      reason: 'available',
    });
    // No declared operation reports `adapter-not-implemented` any more, so the
    // unavailable examples below are the ones held back by a decision instead.
    expect(rows.some((row) => row.reason === 'adapter-not-implemented')).toBe(false);
    // A confirmation survives becoming available — it is not something
    // availability quietly resolves.
    expect(rows.find((row) => row.id === 'media.organize-files')).toMatchObject({
      available: true,
      reason: 'available',
      confirmation: 'organize-files',
    });
    expect(rows.find((row) => row.id === 'anime.fetch-external-metadata')).toMatchObject({
      available: true,
      reason: 'available',
      confirmation: 'external-connection',
    });
    expect(rows.find((row) => row.id === 'dictionary.analyze-sentence')).toMatchObject({
      available: false,
      reason: 'dedicated-analysis-required',
    });
    expect(rows.find((row) => row.id === 'flashcard.schedule-reviews')).toMatchObject({
      available: false,
      reason: 'false-success-stub-removed',
    });
  });

  it('applies the active profile allow-list and effective permission after adapter availability', () => {
    const installedCapabilities = capabilities();
    const narrowed = profile({
      permission: 'limited-actions',
      enabledOperations: ['dictionary.lookup', 'settings.apply-theme'],
    });
    const rows = buildAgentCapabilityDirectory(installedCapabilities, settings, narrowed);

    expect(rows.find((row) => row.id === 'dictionary.lookup')?.reason).toBe('available');
    expect(rows.find((row) => row.id === 'flashcard.add-cards')?.reason)
      .toBe('profile-operation-disabled');
    expect(rows.find((row) => row.id === 'settings.apply-theme')?.reason)
      .toBe('permission-insufficient');
  });

  it('reports the global Agent switch without hiding adapter truth', () => {
    const rows = buildAgentCapabilityDirectory(
      capabilities(),
      { ...settings, enabled: false },
      profile(),
    );

    expect(rows.find((row) => row.id === 'dictionary.lookup')?.reason).toBe('agent-disabled');
    // Adapter truth still outranks the global switch. `anime.search` used to be
    // the example here and now has an adapter; these two do not, and their
    // reasons are decisions rather than missing code.
    expect(rows.find((row) => row.id === 'flashcard.schedule-reviews')?.reason)
      .toBe('false-success-stub-removed');
    expect(rows.find((row) => row.id === 'dictionary.explain-grammar')?.reason)
      .toBe('dedicated-analysis-required');
  });

  it('ships every operation label and directory string in all four UI catalogs', () => {
    const fixedKeys = [
      'agent.capabilities.title',
      'agent.capabilities.profile',
      'agent.capabilities.summary',
      'agent.capabilities.reason.available',
      'agent.capabilities.reason.profile-operation-disabled',
      'agent.capabilities.reason.permission-insufficient',
      'agent.capabilities.reason.adapter-not-implemented',
      'agent.capabilities.reason.dedicated-analysis-required',
      'agent.capabilities.reason.false-success-stub-removed',
      'agent.capabilities.confirmation.none',
      'agent.capabilities.confirmation.delete-data',
      'agent.capabilities.confirmation.external-connection',
      'agent.capabilities.confirmation.organize-files',
      'agent.capabilities.confirmation.major-change',
    ];
    const keys = [
      ...fixedKeys,
      ...AGENT_TOOL_OPERATIONS.map((definition) => agentCapabilityOperationLabelKey(definition.id)),
    ];

    for (const [lang, catalog] of Object.entries(CATALOGS)) {
      for (const key of keys) {
        expect(catalog[key], `${lang} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('renders an accessible localized status directory from supplied authority snapshots', () => {
    const selectedCapabilities = capabilities().filter(({ definition }) => (
      definition.id === 'dictionary.lookup' || definition.id === 'dictionary.analyze-sentence'
    ));
    const html = renderToStaticMarkup(createElement(AgentCapabilityDirectory, {
      capabilities: selectedCapabilities,
      settings,
      profile: profile(),
    }));

    expect(html).toContain('aria-labelledby="agent-capability-title"');
    expect(html).toContain('Capabilities');
    expect(html).toContain('Active profile: Test profile');
    expect(html).toContain('Look up a word');
    expect(html).toContain('Ready with current settings');
    expect(html).toContain('Requires the dedicated analysis workflow');
    expect(html).toContain('<code>dictionary.lookup</code>');
    expect(html).not.toContain('agent.capabilities.');
  });
});
