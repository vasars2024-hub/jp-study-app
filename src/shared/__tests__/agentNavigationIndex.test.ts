import { describe, expect, it } from 'vitest';
import {
  AGENT_NAVIGATION_INDEX,
  resolveAgentNavigationQuery,
  type AgentNavigationIndexEntry,
  type AgentNavigationTranslatedTitles,
} from '../agentNavigationIndex';
// Tests may reach the all-languages aggregate; `i18nSplit.test.ts` scans app
// code only, and asserting against invented translations would prove nothing.
import { en, ja, ru, zh } from '../i18n/catalogs/all';
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

describe('agent navigation index — the controls the settings registry had missed', () => {
  const control = (page: string, controlId: string) => ({
    section: 'settings',
    page,
    controlId,
    highlight: true,
  });

  it.each([
    ['where do I change the app borders', 'appearance', 'app-border'],
    ['pillarbox style', 'appearance', 'pillarbox'],
    ['pick an environment', 'atmosphere', 'environment-preset'],
    ['turn off the weather', 'atmosphere', 'weather'],
    ['where is the ambient audio setting', 'atmosphere', 'ambient-audio'],
    ['how do I leave the secret os', 'companions', 'companions-leave-secret'],
    ['where are my trinkets', 'companions', 'trinkets'],
    ['set up the startup helper', 'shortcuts', 'os-hotkey'],
    ['turn on app wide lookup', 'shortcuts', 'global-lookup'],
    ['where is mini view', 'mini', 'mini-enable'],
    ['change my pinned apps', 'mini', 'mini-apps'],
    ['mini routines', 'mini', 'mini-routines'],
    ['mini look', 'mini', 'mini-look'],
    ['where do I set my level', 'study', 'level'],
    ['why are the special modules locked', 'special', 'special-locked'],
    ['open the wired games', 'special', 'wired-arcade'],
    ['aero games', 'special', 'aero-arcade'],
    // v1.0 audit 5.2 — these four cards moved to the Display page with the
    // Monitors/Display merge. The PHRASES are unchanged on purpose: a user
    // still asks for "my second monitor", and it still has to land on the
    // card, not merely on a page.
    ['set up my second monitor', 'display', 'monitors-list'],
    ['remap the layout', 'display', 'monitors-layout-remap'],
    ['add a simulated display', 'display', 'monitors-simulated'],
    ['reset display setup', 'display', 'monitors-reset'],
    ['turn off automatic routing', 'file-drops', 'filedrop-auto'],
    ['pin a destination for a file type', 'file-drops', 'filedrop-overrides'],
    ['how long is the undo history', 'file-drops', 'filedrop-undo'],
    ['reset drop settings', 'file-drops', 'filedrop-reset'],
    ['what is in the agent memory', 'memory', 'agent-memory'],
  ])('routes %j to %s/%s', (query, page, controlId) => {
    expect(destinationFor(query)).toEqual(control(page, controlId));
  });
});

/**
 * The 26 additions above are the whole reason this block exists.
 *
 * Every term one of them could plausibly have claimed is already a word some
 * older entry answers to, and a second claimant does not merely lose — it *ties*,
 * and a tie refuses. So each case below is a word this slice deliberately left
 * out of a new entry's terms, asserted to still resolve exactly where it did.
 */
describe('agent navigation index — words a new entry deliberately did not claim', () => {
  it.each([
    // `weather` mentions rain and snow; Particles keeps them.
    ['rain', { section: 'settings', page: 'atmosphere', controlId: 'particles', highlight: true }],
    // `environment-preset` is a preset, but the desktop icon preset owns the word.
    ['preset', { section: 'settings', page: 'desktop-layout', controlId: 'icon-recommended', highlight: true }],
    // `mini-routines` pins buddy routines; the buddy programmer defines them.
    ['routine', { section: 'settings', page: 'companions', controlId: 'buddy-programmer', highlight: true }],
    // `level` is computed from JLPT decks; the study profile owns "jlpt".
    ['jlpt', { section: 'settings', page: 'study', controlId: 'profile', highlight: true }],
    // `mini-enable` is the craft window's switch; the Mini wallpaper names it.
    ['craft window', { section: 'settings', page: 'wallpaper', controlId: 'mini-wallpaper', highlight: true }],
    // Both Aero cards mention multi-monitor; the OS pets card claims the phrase.
    ['multi monitor', { section: 'settings', page: 'companions', controlId: 'os-pets', highlight: true }],
    // Two new Aero-only appearance cards, and neither takes "aero" off the page.
    ['aero', { section: 'settings', page: 'special' }],
    // `agent-memory` is a settings card; the bare word still opens the Agent.
    ['agent', { section: 'agent' }],
  ])('still resolves %j unchanged', (query, expected) => {
    expect(destinationFor(query)).toEqual(expected);
  });

  it('leaves an already-refused word refused rather than breaking the tie by accident', () => {
    // Particles and Snow accumulation have tied on "snow" since the index
    // shipped. Weather mentions snow too — adding it as a term would have looked
    // like a fix and changed nothing, so it was left out and this stays null.
    expect(resolveAgentNavigationQuery('snow')).toBeNull();
    // Three controls answer to "hotkey"; the new OS hotkey card is reached by
    // "os hotkey" instead of making that four.
    expect(resolveAgentNavigationQuery('hotkey')).toBeNull();
  });
});

describe('agent navigation index — a question asked in another language', () => {
  // The real catalogs. A test fixture of invented translations would pass while
  // the shipped ones failed, which is the only way this could matter.
  const titles = { ja, zh, ru } as unknown as AgentNavigationTranslatedTitles;

  it('resolved nothing at all before the titles were supplied', () => {
    // Not a missing-terms problem: `tokenize` strips every non-ASCII character,
    // so these produced an empty token set and could never match anything. This
    // is the defect, pinned so the fix cannot silently regress into it.
    expect(resolveAgentNavigationQuery('где словарь')).toBeNull();
    expect(resolveAgentNavigationQuery('辞書はどこですか')).toBeNull();
    expect(resolveAgentNavigationQuery('词典在哪里')).toBeNull();
  });

  it('answers a Russian question from the translated title', () => {
    expect(resolveAgentNavigationQuery('где словарь', undefined, titles))
      .toEqual({ section: 'dictionary' });
    expect(resolveAgentNavigationQuery('где тема', undefined, titles))
      .toEqual({ section: 'settings', page: 'appearance', controlId: 'theme', highlight: true });
  });

  it('answers a Japanese question, which has no spaces to tokenize on', () => {
    expect(resolveAgentNavigationQuery('辞書はどこですか', undefined, titles))
      .toEqual({ section: 'dictionary' });
    expect(resolveAgentNavigationQuery('テーマを変えたい', undefined, titles))
      .toEqual({ section: 'settings', page: 'appearance', controlId: 'theme', highlight: true });
  });

  it('answers a Chinese question', () => {
    expect(resolveAgentNavigationQuery('词典在哪里', undefined, titles))
      .toEqual({ section: 'dictionary' });
    expect(resolveAgentNavigationQuery('主题在哪里', undefined, titles))
      .toEqual({ section: 'settings', page: 'appearance', controlId: 'theme', highlight: true });
  });

  it('sends a translated question to the same place its English twin goes', () => {
    // The property worth having, and the one that keeps the precedence ladder
    // honest: "где обои" lands on the Wallpaper *control* rather than the page
    // holding it, because a control outranks its page — exactly as "wallpaper"
    // has always done in English.
    for (const [asked, english] of [
      ['где обои', 'wallpaper'],
      ['壁紙を変えたい', 'wallpaper'],
      ['壁纸在哪里', 'wallpaper'],
      ['где словарь', 'dictionary'],
      ['辞書はどこですか', 'dictionary'],
    ] as const) {
      expect(
        resolveAgentNavigationQuery(asked, undefined, titles),
        `"${asked}" and "${english}" disagree`,
      ).toEqual(resolveAgentNavigationQuery(english));
    }
  });

  it('leaves every English answer exactly where it was', () => {
    // The property that makes this slice safe. English is scored only through
    // the hand-tuned terms, so supplying catalogs must move nothing — including
    // the words a previous slice deliberately left ambiguous.
    for (const query of [
      'dictionary', 'rain', 'snow', 'preset', 'routine', 'jlpt',
      'craft window', 'multi monitor', 'ambient', 'aero', 'hotkey',
      'mini view', 'environment', 'theme', 'wallpaper', 'weather',
    ]) {
      expect(
        resolveAgentNavigationQuery(query, undefined, titles),
        `"${query}" moved when the catalogs were supplied`,
      ).toEqual(resolveAgentNavigationQuery(query));
    }
  });

  it('still refuses an ambiguous question rather than guessing', () => {
    const ambiguous: AgentNavigationIndexEntry[] = [
      { section: 'music', titleKey: 'x.one', terms: ['music'] },
      { section: 'video', titleKey: 'x.two', terms: ['video'] },
    ];
    const shared = { ru: { 'x.one': 'Звук', 'x.two': 'Звук' } } as unknown as
      AgentNavigationTranslatedTitles;
    expect(resolveAgentNavigationQuery('где звук', ambiguous, shared)).toBeNull();
  });

  it('does not let a one-character CJK title match everything', () => {
    const tiny: AgentNavigationIndexEntry[] = [
      { section: 'music', titleKey: 'x.tiny', terms: ['music'] },
    ];
    const short = { ja: { 'x.tiny': '音' } } as unknown as AgentNavigationTranslatedTitles;
    expect(resolveAgentNavigationQuery('音楽はどこ', tiny, short)).toBeNull();
  });

  // FILES_APP_PLAN gate 13: the assistant reaches the Files app through this
  // index, not a bespoke path. Registration is only half of it — the terms have
  // to actually win against the surfaces that already own those words.
  it('resolves a natural-language file request to the Files app', () => {
    expect(destinationFor('files').section).toBe('files');
    expect(destinationFor('open my files').section).toBe('files');
    expect(destinationFor('show me my files').section).toBe('files');
  });

  it('does not steal a query that belongs to an established surface', () => {
    // "library" is the book library's own word, and the Files app listing books
    // must not take it. Same for the music app.
    expect(destinationFor('library').section).toBe('library');
    expect(destinationFor('music').section).toBe('music');
  });

  it('ignores an English catalog handed in among the translations', () => {
    // `ensureCatalog` falls back to English when a language fails to load, and
    // English text scored through this lane would move answers pinned above.
    const withEn = { en } as unknown as AgentNavigationTranslatedTitles;
    expect(resolveAgentNavigationQuery('theme', undefined, withEn))
      .toEqual(resolveAgentNavigationQuery('theme'));
  });
});
