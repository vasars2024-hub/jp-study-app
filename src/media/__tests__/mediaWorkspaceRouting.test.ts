/**
 * The Media workspace's IN-HOST location, and the link decision that feeds it.
 *
 * WHY THIS EXISTS. Until 2026-09-05 `SeaLink` rendered a bare `<a href="/entry?id=…">` and
 * let the browser have the click. Measured live on port 39352 with a real trusted input
 * event, one click on a library card took `location.href` to
 * `http://localhost:5174/entry?id=102883`, unmounted `#media-workspace`, and left
 * `document.querySelectorAll('.fwin').length` at **0** — every window on the desk destroyed,
 * with first-run consent and the tour replayed on the way back up.
 *
 * So the property under test is not "routing works". It is that a plain primary click on an
 * internal href is NEVER handed back to the browser.
 *
 * Node env by this tree's rule (`vitest.config.ts`): the store is imported directly and the
 * React hooks around it are not exercised here — `useHostLocation` is three lines of
 * `useSyncExternalStore` over exactly the `subscribe`/`getSnapshot` pair driven below.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  decideLinkActivation,
  getHostLocation,
  goBackHost,
  hostCanGoBack,
  isInternalHref,
  navigateHost,
  resetHostLocation,
  type LinkActivation,
} from '../../../vendor/seanime-web/lib/navigation';

function activation(overrides: Partial<LinkActivation> = {}): LinkActivation {
  return {
    href: '/entry?id=102883',
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...overrides,
  };
}

describe('the media workspace link decision', () => {
  it('never returns the default action to the browser for a plain click on an internal href', () => {
    // The regression itself. `ignore` is what the browser follows, and following
    // `/entry?id=…` navigates the whole Electron renderer out of the desktop shell.
    for (const href of ['/entry?id=102883', '/entry', '/onlinestream?id=1&episode=2', '/']) {
      expect(decideLinkActivation(activation({ href }))).not.toBe('ignore');
    }
  });

  it('routes a plain primary click into the host', () => {
    expect(decideLinkActivation(activation())).toBe('navigate');
  });

  it('cancels rather than follows a modifier or non-primary click', () => {
    // There is no second window to open in this shell, so these must not navigate — but
    // they must not fall through to the browser either, which would leave the surface.
    expect(decideLinkActivation(activation({ ctrlKey: true }))).toBe('suppress');
    expect(decideLinkActivation(activation({ metaKey: true }))).toBe('suppress');
    expect(decideLinkActivation(activation({ shiftKey: true }))).toBe('suppress');
    expect(decideLinkActivation(activation({ altKey: true }))).toBe('suppress');
    expect(decideLinkActivation(activation({ button: 1 }))).toBe('suppress');
  });

  it('leaves an external or absent href alone', () => {
    expect(decideLinkActivation(activation({ href: 'https://anilist.co/anime/1' }))).toBe('ignore');
    expect(decideLinkActivation(activation({ href: '//cdn.example/x' }))).toBe('ignore');
    expect(decideLinkActivation(activation({ href: undefined }))).toBe('ignore');
  });

  it('yields to a call site that already handled the click', () => {
    // Several adopted cards pass `onClick` INSTEAD of an href so they can open a modal.
    expect(decideLinkActivation(activation({ defaultPrevented: true }))).toBe('ignore');
  });

  it('classifies hrefs the way the decision depends on', () => {
    expect(isInternalHref('/entry?id=1')).toBe(true);
    expect(isInternalHref('//host/path')).toBe(false);
    expect(isInternalHref('https://x/y')).toBe(false);
    expect(isInternalHref(undefined)).toBe(false);
  });
});

describe('the in-host location store', () => {
  beforeEach(() => {
    resetHostLocation();
  });

  it('starts at the root with nowhere to go back to', () => {
    expect(getHostLocation()).toEqual({ pathname: '/', search: '' });
    expect(hostCanGoBack()).toBe(false);
  });

  it('splits an href into pathname and search, and never reads window.location', () => {
    // `window` is absent in this env, so a version that fell back to the shell's location
    // could not even run — which is the point: the surface's route is its own.
    navigateHost('/entry?id=102883');
    expect(getHostLocation()).toEqual({ pathname: '/entry', search: '?id=102883' });
    expect(getHostLocation().pathname.startsWith('/entry')).toBe(true);
    expect(new URLSearchParams(getHostLocation().search).get('id')).toBe('102883');
  });

  it('changes snapshot IDENTITY on navigation, because that is the subscription contract', () => {
    const before = getHostLocation();
    navigateHost('/entry?id=7');
    expect(getHostLocation()).not.toBe(before);
  });

  it('does not push a duplicate of the current location', () => {
    navigateHost('/entry?id=1');
    expect(hostCanGoBack()).toBe(true);
    navigateHost('/entry?id=1');
    goBackHost();
    // One push, one step back: the duplicate added no history, so this lands at the root.
    expect(getHostLocation()).toEqual({ pathname: '/', search: '' });
  });

  it('goes back through the trail it actually built', () => {
    navigateHost('/entry?id=1');
    navigateHost('/entry?id=2');
    goBackHost();
    expect(getHostLocation().search).toBe('?id=1');
    goBackHost();
    expect(getHostLocation().pathname).toBe('/');
    // Past the root it stops rather than reaching for the shell's own history.
    goBackHost();
    expect(getHostLocation().pathname).toBe('/');
  });

  it('reset clears both the location and the trail', () => {
    navigateHost('/entry?id=1');
    navigateHost('/entry?id=2');
    expect(hostCanGoBack()).toBe(true);
    resetHostLocation();
    expect(getHostLocation()).toEqual({ pathname: '/', search: '' });
    expect(hostCanGoBack()).toBe(false);
  });

  it('replace does not deepen the trail', () => {
    navigateHost('/entry?id=1', 'replace');
    expect(getHostLocation().search).toBe('?id=1');
    expect(hostCanGoBack()).toBe(false);
  });
});
