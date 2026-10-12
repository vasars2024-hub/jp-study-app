/**
 * Blanc conversation panel.
 *
 * Study OS's Conversation app (`ConversationView`) is a one-line wrapper around
 * the shared `ConversationPartner` content component; Blanc composes that same
 * component in its own chrome (never the `*View`), compact and lazy, with its
 * own small stylesheet only, so a chat started in either window continues in the
 * other (the history is the same per profile and study language).
 */
import ConversationPartner from '../speak/ConversationPartner';

export function BlancConversationPanel() {
  return (
    <div className="blanc-tool-detail blanc-conversation">
      <ConversationPartner compact />
    </div>
  );
}
