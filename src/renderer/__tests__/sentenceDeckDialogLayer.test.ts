/**
 * The sentence-deck dialog opens from inside the player. The player host is an opaque
 * full-screen view (`--z-shell-view`); at the ui/* tier's `--z-modal` the dialog mounted
 * behind the video — present in the DOM, invisible, and a click on "Make" hit the player.
 * Measured on the packaged build before this fix.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const TOKENS = read('theme/tokens.css');
const CSS = read('components/sentenceDeck/sentenceDeck.css');

function token(name: string): number {
  const match = new RegExp(`--${name}:\\s*(\\d+)`).exec(TOKENS);
  if (!match) throw new Error(`token --${name} not found`);
  return Number(match[1]);
}

describe('sentence-deck dialog layering', () => {
  it('its overlay uses the view-overlay tier', () => {
    expect(CSS).toMatch(/\.sd-host \.ui-overlay\s*\{\s*z-index:\s*var\(--z-view-overlay/);
  });

  it('that tier is above the full-screen player and below shell overlays', () => {
    expect(token('z-view-overlay')).toBeGreaterThan(token('z-shell-view'));
    expect(token('z-view-overlay')).toBeLessThan(token('z-shell-overlay'));
  });
});

describe('"Listen now" from the player', () => {
  it('closes the full-screen player before focusing Flashcards', () => {
    const TSX = read('components/sentenceDeck/SentenceDeckDialog.tsx');
    const fn = TSX.slice(TSX.indexOf('function listenNow('));
    const body = fn.slice(0, fn.indexOf('\n  }\n'));
    expect(body.indexOf('MEDIA_WORKSPACE_CLOSE_EVENT')).toBeGreaterThan(-1);
    expect(body.indexOf('MEDIA_WORKSPACE_CLOSE_EVENT')).toBeLessThan(body.indexOf('requestFlashcardsFocus'));
  });
});
