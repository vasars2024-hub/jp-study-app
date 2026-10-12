import ConversationPartner from '../components/speak/ConversationPartner';

/**
 * The conversation partner app (desktop section `conversation`, docs/AI_AUDIT.md
 * N20): chat in the study language at your level, with corrections, mining,
 * read-aloud and voice input. Lazy-loaded like every app, so a session that
 * never opens it pays nothing for it.
 */
export default function ConversationView() {
  return <ConversationPartner />;
}
