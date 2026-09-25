// @vitest-environment jsdom
/**
 * K5: the player's control buttons have translated names and a visible focus ring.
 * A screen reader read eight unnamed buttons in a row; the focus style was
 * `outline-none` plus a 50% fade, which on a moving picture is no focus at all.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LuCaptions, LuHeadphones } from 'react-icons/lu';
import {
  MediaCoreControlButtonIcon,
  MediaCorePlayButton,
  mediaCoreControlLabelKey,
} from '../../../vendor/seanime-web/app/(main)/_features/media-core/media-core-control-bar';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

describe('player control buttons (K5)', () => {
  it('the play button says what it will do, and has a real focus ring', async () => {
    const host = await render(<MediaCorePlayButton paused onTogglePlay={() => undefined} isMobile={false} isMiniPlayer={false} />);
    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Play');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.className).toMatch(/focus-visible:outline-2/);
    expect(button?.className).not.toMatch(/focus-visible:outline-none/);
  });

  it('an icon-only menu trigger is named from its icon', async () => {
    expect(mediaCoreControlLabelKey([['default', LuHeadphones]], 'default')).toBe('playerUi.control.audio');
    const host = await render(
      <MediaCoreControlButtonIcon icons={[['default', LuCaptions]]} state="default" onClick={() => undefined} isMobile={false} isMiniPlayer={false} />,
    );
    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Subtitles');
  });
});
