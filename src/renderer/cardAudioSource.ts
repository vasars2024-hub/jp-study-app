/**
 * A card's own audio as something an `<audio>` element can play.
 *
 * Inline data URLs play as they are; a managed path is read through the
 * flashcard media store first and, failing that, the visual-novel capture
 * store (where VN voice clips live). Null when the card has no audio or
 * neither store can produce it.
 */
export interface CardAudioFields {
  audioDataUrl?: string;
  audioPath?: string;
}

export async function cardAudioSource(card: CardAudioFields): Promise<string | null> {
  if (card.audioDataUrl) return card.audioDataUrl;
  if (!card.audioPath) return null;
  try {
    const managed = await window.api.flashcardReadAudio(card.audioPath);
    if (managed.ok && managed.dataUrl) return managed.dataUrl;
    const captured = await window.api.visualNovelReadCaptureAudio?.(card.audioPath);
    return captured?.ok && captured.dataUrl ? captured.dataUrl : null;
  } catch {
    return null;
  }
}
