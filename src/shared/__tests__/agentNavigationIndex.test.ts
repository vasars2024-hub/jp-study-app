import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_INDEX,
  resolveAgentNavigationQuery,
  type AgentNavigationIndexEntry,
} from '../agentNavigationIndex';
import {
  AGENT_NAVIGABLE_SECTIONS,
  isAgentNavigableSection,
  isAgentNavigationDestination,
  isAgentSettingsControl,
  isAgentSettingsPage,
} from '../agentNavigation';

function destinationFor(query: string) {
  const answer = resolveAgentNavigationQuery(query);
  if (!answer) throw new Error(`no destination for "${query}"`);
  return answer;
}

describe('agent navigation index — every entry is a place the allowlist permits', () => {
  it('names only navigable sections', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      expect(isAgentNavigableSection(entry.section), entry.section).toBe(true);
    }
  });

  it('produces a destination the resolver would accept', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      const destination = {
        section: entry.section,
        ...(entry.page ? { page: entry.page } : {}),
        ...(entry.controlId ? { controlId: entry.controlId, highlight: true } : {}),
      };
      expect(
        isAgentNavigationDestination(destination),
        `${entry.section}/${entry.page ?? '-'}/${entry.controlId ?? '-'}`,
      ).toBe(true);
    }
  });

  it('keeps every settings coordinate inside the guided-target registry', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      if (!entry.page) continue;
      expect(entry.section).toBe('settings');
      expect(isAgentSettingsPage(entry.page), entry.page).toBe(true);
      if (!entry.controlId) continue;
      expect(
        isAgentSettingsPage(entry.page) && isAgentSettingsControl(entry.page, entry.controlId),
        `${entry.page}/${entry.controlId}`,
      ).toBe(true);
    }
  });

  it('never lists the same destination twice', () => {
    const seen = new Set<string>();
    for (const entry of AGENT_NAVIGATION_INDEX) {
      const key = `${entry.section}|${entry.page ?? ''}|${entry.controlId ?? ''}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('covers every navigable section except the one that needs a page', () => {
    const sections = new Set(
      AGENT_NAVIGATION_INDEX.filter((entry) => !entry.page).map((entry) => entry.section),
    );
    for (const section of AGENT_NAVIGABLE_SECTIONS) {
      // `settings` is the exception by construction: `isAgentNavigationDestination`
      // refuses a bare settings destination, so it is indexed by page instead.
      if (section === 'settings') {
        expect(sections.has(section)).toBe(false);
        continue;
      }
      expect(sections.has(section), section).toBe(true);
    }
    expect(resolveAgentNavigationQuery('settings')).toEqual({
      section: 'settings',
      page: 'home',
    });
  });

  it('gives every entry at least one term', () => {
    for (const entry of AGENT_NAVIGATION_INDEX) {
      expect(entry.terms.length, `${entry.section}/${entry.controlId ?? entry.page ?? '-'}`)
        .toBeGreaterThan(0);
      for (const term of entry.terms) expect(term.trim()).not.toBe('');
    }
  });
});

describe('agent navigation index — resolving a fresh question', () => {
  it('routes a settings question to the exact highlighted control', () => {
    expect(destinationFor('where do I change the interface language?')).toEqual({
      section: 'settings',
      page: 'appearance',
      controlId: 'ui-language',
      highlight: true,
    });
  });

  it('separates the two language settings by the words the user used', () => {
    expect(destinationFor('change my study language')).toEqual({
      section: 'settings',
      page: 'study',
      controlId: 'study-language',
      highlight: true,
    });
  });

  it('prefers a longer exact phrase over two loose word hits', () => {
    expect(destinationFor('turn on the popup dictionary')).toEqual({
      section: 'settings',
      page: 'study',
      controlId: 'system-dictionary',
      highlight: true,
    });
  });

  it('routes a bare app name to the app, not to a setting that mentions it', () => {
    expect(destinationFor('open the dictionary')).toEqual({ section: 'dictionary' });
    expect(destinationFor('flashcards')).toEqual({ section: 'flashcards' });
  });

  it('routes a question about reducing motion to the accessibility control', () => {
    expect(destinationFor('how do I reduce motion')).toEqual({
      section: 'settings',
      page: 'display',
      controlId: 'reduce-motion',
      highlight: true,
    });
  });

  it('falls to the page when the question names the page and no control', () => {
    expect(destinationFor('open the api keys page')).toEqual({
      section: 'settings',
      page: 'api-keys',
    });
  });

  it('matches across a single trailing plural', () => {
    expect(destinationFor('factory resets')).toEqual({
      section: 'settings',
      page: 'memory',
      controlId: 'factory-reset',
      highlight: true,
    });
  });

  it('refuses a query it cannot place', () => {
    expect(resolveAgentNavigationQuery('what is the capital of France')).toBeNull();
    expect(resolveAgentNavigationQuery('')).toBeNull();
    expect(resolveAgentNavigationQuery('   ')).toBeNull();
    expect(resolveAgentNavigationQuery('where is it')).toBeNull();
  });

  it('refuses a tie between two destinations in the same band', () => {
    const tied: AgentNavigationIndexEntry[] = [
      { section: 'settings', page: 'display', controlId: 'zoom', terms: ['scale'] },
      { section: 'settings', page: 'atmosphere', controlId: 'particle-size', terms: ['scale'] },
    ];
    expect(resolveAgentNavigationQuery('scale', tied)).toBeNull();
  });

  it('breaks a tie between bands rather than refusing', () => {
    const tied: AgentNavigationIndexEntry[] = [
      { section: 'settings', page: 'appearance', terms: ['theme'] },
      { section: 'settings', page: 'appearance', controlId: 'theme', terms: ['theme'] },
    ];
    expect(resolveAgentNavigationQuery('theme', tied)).toEqual({
      section: 'settings',
      page: 'appearance',
      controlId: 'theme',
      highlight: true,
    });
  });

  it('never substring-matches a term inside an unrelated word', () => {
    // 'ai' is a real keyword on the AI analysis control; 'said' must not reach it.
    expect(resolveAgentNavigationQuery('he said nothing')).toBeNull();
    // 'cs' must not fold into 'css' — the plural fold has a length floor.
    expect(resolveAgentNavigationQuery('cs')).toBeNull();
  });

  it('is stable: the same question always resolves the same way', () => {
    const question = 'where do I change the interface language?';
    const first = resolveAgentNavigationQuery(question);
    for (let i = 0; i < 5; i += 1) {
      expect(resolveAgentNavigationQuery(question)).toEqual(first);
    }
  });

  it('ignores case, punctuation and surrounding sentence', () => {
    expect(resolveAgentNavigationQuery('FACTORY RESET!!!')).toEqual(
      resolveAgentNavigationQuery('factory reset'),
    );
  });

  it('rejects a non-string query without throwing', () => {
    expect(resolveAgentNavigationQuery(undefined as unknown as string)).toBeNull();
    expect(resolveAgentNavigationQuery(42 as unknown as string)).toBeNull();
  });
});
