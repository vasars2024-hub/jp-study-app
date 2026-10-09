/**
 * Help topics: short "how do I…" answers, each with the one place in the app
 * that does the thing. Settings > Help searches them (together with the
 * settings registry and the tour chapters), and the "?" affordances scattered
 * through the app (`HelpLink`) open Help at one of them.
 *
 * Kept dependency-light: `HelpLink` sits in shell chrome that is part of the
 * Study OS boot graph, so this module must not import a page or a store.
 */
import { openSettingsAt } from './settingsDeepLink';
import { openSectionSurface } from './sectionSurface';

export type HelpTopicAction =
  | { kind: 'settings'; page: string; settingId?: string }
  | { kind: 'section'; section: string }
  | { kind: 'tour'; chapter: string }
  | { kind: 'setup' }
  | { kind: 'event'; event: string };

export interface HelpTopic {
  id: string;
  titleKey: string;
  bodyKey: string;
  actionKey: string;
  /** English search terms; the localized title and body are searched too. */
  keywords: string[];
  action: HelpTopicAction;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'getting-started',
    titleKey: 'onb2.topic.gettingStarted.title',
    bodyKey: 'onb2.topic.gettingStarted.body',
    actionKey: 'onb2.topic.gettingStarted.action',
    keywords: ['setup', 'first run', 'start', 'begin', 'onboarding', 'wizard', 'checklist'],
    action: { kind: 'setup' },
  },
  {
    id: 'lookup',
    titleKey: 'onb2.topic.lookup.title',
    bodyKey: 'onb2.topic.lookup.body',
    actionKey: 'onb2.topic.lookup.action',
    keywords: ['dictionary', 'lookup', 'look up', 'word', 'popup', 'meaning', 'definition'],
    action: { kind: 'section', section: 'dictionary' },
  },
  {
    id: 'downloads',
    titleKey: 'onb2.topic.downloads.title',
    bodyKey: 'onb2.topic.downloads.body',
    actionKey: 'onb2.topic.downloads.action',
    keywords: ['download', 'dictionary', 'model', 'ocr', 'storage', 'offline', 'disk'],
    action: { kind: 'settings', page: 'storage', settingId: 'storage-models' },
  },
  {
    id: 'transcription',
    titleKey: 'onb2.topic.transcription.title',
    bodyKey: 'onb2.topic.transcription.body',
    actionKey: 'onb2.topic.transcription.action',
    keywords: ['whisper', 'transcribe', 'transcription', 'subtitles', 'audio', 'speech'],
    action: { kind: 'settings', page: 'transcription', settingId: 'whisper-models' },
  },
  {
    id: 'anki',
    titleKey: 'onb2.topic.anki.title',
    bodyKey: 'onb2.topic.anki.body',
    actionKey: 'onb2.topic.anki.action',
    keywords: ['anki', 'ankiconnect', 'deck', 'sync', 'cards', 'export'],
    action: { kind: 'section', section: 'anki' },
  },
  {
    id: 'mining',
    titleKey: 'onb2.topic.mining.title',
    bodyKey: 'onb2.topic.mining.body',
    actionKey: 'onb2.topic.mining.action',
    keywords: ['mine', 'mining', 'sentence', 'card', 'video', 'subtitle', 'clip'],
    action: { kind: 'tour', chapter: 'watch' },
  },
  {
    id: 'music',
    titleKey: 'onb2.topic.music.title',
    bodyKey: 'onb2.topic.music.body',
    actionKey: 'onb2.topic.music.action',
    keywords: ['music', 'lyrics', 'song', 'lrc', 'karaoke', 'loop', 'listen'],
    action: { kind: 'section', section: 'music' },
  },
  {
    id: 'files',
    titleKey: 'onb2.topic.files.title',
    bodyKey: 'onb2.topic.files.body',
    actionKey: 'onb2.topic.files.action',
    keywords: ['files', 'import', 'folder', 'scan', 'library', 'watch folder', 'duplicates'],
    action: { kind: 'tour', chapter: 'files' },
  },
  {
    id: 'windows',
    titleKey: 'onb2.topic.windows.title',
    bodyKey: 'onb2.topic.windows.body',
    actionKey: 'onb2.topic.windows.action',
    keywords: ['window', 'snap', 'desktop', 'virtual desktop', 'tile', 'keyboard', 'taskbar'],
    action: { kind: 'settings', page: 'shortcuts' },
  },
  {
    id: 'notifications',
    titleKey: 'onb2.topic.notifications.title',
    bodyKey: 'onb2.topic.notifications.body',
    actionKey: 'onb2.topic.notifications.action',
    keywords: ['notifications', 'do not disturb', 'quiet', 'toast', 'alerts', 'mute'],
    action: { kind: 'event', event: 'shell:toggleNotifications' },
  },
  {
    id: 'shortcuts',
    titleKey: 'onb2.topic.shortcuts.title',
    bodyKey: 'onb2.topic.shortcuts.body',
    actionKey: 'onb2.topic.shortcuts.action',
    keywords: ['shortcuts', 'hotkeys', 'keys', 'keyboard', 'cheat sheet'],
    action: { kind: 'settings', page: 'help', settingId: 'help-shortcuts' },
  },
  {
    id: 'study-language',
    titleKey: 'onb2.topic.language.title',
    bodyKey: 'onb2.topic.language.body',
    actionKey: 'onb2.topic.language.action',
    keywords: ['language', 'chinese', 'russian', 'japanese', 'study language', 'switch'],
    action: { kind: 'settings', page: 'study', settingId: 'study-language' },
  },
];

export function helpTopic(id: string): HelpTopic | undefined {
  return HELP_TOPICS.find((topic) => topic.id === id);
}

/** Localized, keyword-aware ranking. Empty query → no results. */
export function searchHelpTopics(query: string, t: (key: string) => string): HelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ topic: HelpTopic; score: number }> = [];
  for (const topic of HELP_TOPICS) {
    const title = t(topic.titleKey).toLowerCase();
    const hay = [title, t(topic.bodyKey).toLowerCase(), ...topic.keywords].join(' ');
    let score = 0;
    if (title.includes(q)) score += 40;
    if (hay.includes(q)) score += 20;
    for (const word of words) {
      if (title.includes(word)) score += 12;
      else if (hay.includes(word)) score += 6;
    }
    if (score > 0) scored.push({ topic, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.topic);
}

/** Fired at Settings > Help when a "?" asks for one topic. */
export const HELP_TOPIC_EVENT = 'help:topic';

let pendingTopic: string | null = null;

/**
 * Open Settings > Help with one topic expanded. The topic waits here for a
 * Help page that is still mounting (Settings loads lazily), and is announced
 * by event for one that is already up.
 */
export function requestHelpTopic(id: string): void {
  pendingTopic = id;
  openSettingsAt('help', 'help-search');
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(HELP_TOPIC_EVENT, { detail: id }));
  }, 160);
}

/** Help, on mount or on the event: the topic to expand, consumed once. */
export function takePendingHelpTopic(): string | null {
  const id = pendingTopic;
  pendingTopic = null;
  return id;
}

/** Event names the HelpPage injects so this module needs no store imports. */
export interface HelpTopicRunners {
  replayTourChapter: (chapter: string) => void;
  restartSetup: () => void;
  /** Settings' own navigate, when running inside Settings. */
  openSettings?: (page: string, settingId?: string) => void;
}

export function runHelpTopic(topic: HelpTopic, runners: HelpTopicRunners): void {
  const action = topic.action;
  switch (action.kind) {
    case 'settings':
      if (runners.openSettings) {
        runners.openSettings(action.page, action.settingId);
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('settings:navigate', {
            detail: { page: action.page, ...(action.settingId ? { settingId: action.settingId } : {}) },
          }),
        );
      }
      return;
    case 'section':
      openSectionSurface(action.section);
      return;
    case 'tour':
      runners.replayTourChapter(action.chapter);
      return;
    case 'setup':
      runners.restartSetup();
      return;
    case 'event':
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(action.event));
      return;
    default:
      return;
  }
}
