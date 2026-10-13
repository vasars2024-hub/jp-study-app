/**
 * The conversation partner's history (docs/AI_AUDIT.md N20), kept on this
 * computer per study profile and study language, capped at
 * `CONVERSATION_HISTORY_CAP` turns (oldest dropped first). Written through the
 * guarded writer, so a full store is reported rather than silently refused.
 *
 * Also the partner's memory across sessions: the words the learner met and did
 * not yet know (and mined) in earlier conversations, which a new conversation
 * brings back. Same scope, same writer.
 */
import {
  capConversationTurns,
  emptyConversationMemory,
  normalizeConversationMemory,
  normalizeStoredConversation,
  type ConversationMemory,
  type StoredConversation,
} from '../shared/aiConversation';
import type { StudyLang } from '../shared/studyLang';
import { writeLocalStorageJson } from './localStorageWrite';
import { getActiveProfileId } from './profileState';

const PREFIX = 'jp-study.conversation.v1';

export function conversationStorageKey(lang: StudyLang, profileId: string = getActiveProfileId()): string {
  return `${PREFIX}.${profileId}.${lang}`;
}

export function loadConversation(lang: StudyLang): StoredConversation {
  try {
    const raw = localStorage.getItem(conversationStorageKey(lang));
    return normalizeStoredConversation(raw ? JSON.parse(raw) : null, lang);
  } catch {
    return normalizeStoredConversation(null, lang);
  }
}

export function saveConversation(lang: StudyLang, conversation: StoredConversation): boolean {
  return writeLocalStorageJson(conversationStorageKey(lang), { ...conversation, turns: capConversationTurns(conversation.turns) });
}

// ---- memory across sessions ----------------------------------------------------------

const MEMORY_PREFIX = 'jp-study.conversation.memory.v1';

export function conversationMemoryKey(lang: StudyLang, profileId: string = getActiveProfileId()): string {
  return `${MEMORY_PREFIX}.${profileId}.${lang}`;
}

/** The words met in earlier conversations (per profile and study language). */
export function loadConversationMemory(lang: StudyLang): ConversationMemory {
  try {
    const raw = localStorage.getItem(conversationMemoryKey(lang));
    return normalizeConversationMemory(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyConversationMemory();
  }
}

export function saveConversationMemory(lang: StudyLang, memory: ConversationMemory): boolean {
  return writeLocalStorageJson(conversationMemoryKey(lang), memory);
}
