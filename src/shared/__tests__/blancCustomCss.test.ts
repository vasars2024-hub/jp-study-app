import { describe, it, expect } from 'vitest';
import {
  MAX_CUSTOM_CSS_LENGTH,
  BLANC_LOCKOUT_GUARD_CSS,
  sanitizeCustomCss,
  scopeCustomCss,
  buildBlancCustomCss,
} from '../blancCustomCss';

describe('sanitizeCustomCss', () => {
  it('passes through a normal string unchanged', () => {
    const css = '.blanc-nav-btn { color: red; }';
    expect(sanitizeCustomCss(css)).toBe(css);
  });

  it('coerces non-strings to empty', () => {
    expect(sanitizeCustomCss(undefined)).toBe('');
    expect(sanitizeCustomCss(null)).toBe('');
    expect(sanitizeCustomCss(42)).toBe('');
    expect(sanitizeCustomCss({})).toBe('');
  });

  it('caps at the maximum length', () => {
    const long = 'a'.repeat(MAX_CUSTOM_CSS_LENGTH + 500);
    expect(sanitizeCustomCss(long)).toHaveLength(MAX_CUSTOM_CSS_LENGTH);
  });

  it('leaves a string exactly at the cap intact', () => {
    const exact = 'b'.repeat(MAX_CUSTOM_CSS_LENGTH);
    expect(sanitizeCustomCss(exact)).toHaveLength(MAX_CUSTOM_CSS_LENGTH);
  });
});

describe('scopeCustomCss', () => {
  it('wraps user CSS in an @scope block rooted at .blanc-root', () => {
    const out = scopeCustomCss('button { color: red; }');
    expect(out.startsWith('@scope (.blanc-root) {')).toBe(true);
    expect(out).toContain('button { color: red; }');
    expect(out.trimEnd().endsWith('}')).toBe(true);
  });

  it('returns empty for empty or whitespace-only input', () => {
    expect(scopeCustomCss('')).toBe('');
    expect(scopeCustomCss('   \n\t ')).toBe('');
  });

  it('nests a leading @import so it is ignored rather than fetched', () => {
    // @import is only valid as the first rule of a stylesheet; nested inside
    // @scope it is inert — no remote stylesheet fetch.
    const out = scopeCustomCss('@import url(https://evil.example/x.css);');
    expect(out.indexOf('@scope')).toBeLessThan(out.indexOf('@import'));
  });
});

describe('buildBlancCustomCss', () => {
  it('emits both the scoped user sheet and the guard when there is CSS', () => {
    const { user, guard } = buildBlancCustomCss('.x { color: red; }');
    expect(user).toContain('@scope (.blanc-root)');
    expect(guard).toBe(BLANC_LOCKOUT_GUARD_CSS);
  });

  it('emits nothing when there is no CSS', () => {
    expect(buildBlancCustomCss('')).toEqual({ user: '', guard: '' });
    expect(buildBlancCustomCss('   ')).toEqual({ user: '', guard: '' });
    expect(buildBlancCustomCss(null)).toEqual({ user: '', guard: '' });
  });

  it('caps oversized input before scoping', () => {
    const { user } = buildBlancCustomCss('c'.repeat(MAX_CUSTOM_CSS_LENGTH + 1000));
    // wrapper + newlines aside, the user payload cannot exceed the cap by more
    // than the fixed @scope wrapper.
    expect(user.length).toBeLessThan(MAX_CUSTOM_CSS_LENGTH + 40);
  });
});

describe('lockout guard', () => {
  it('re-asserts every control on the way out of Blanc', () => {
    for (const selector of [
      '.blanc-taskbar',
      '.blanc-nav',
      '.blanc-nav-btn',
      '.blanc-exit',
      '.blanc-taskbar-reveal',
      '.blanc-fullscreen-exit',
    ]) {
      expect(BLANC_LOCKOUT_GUARD_CSS).toContain(selector);
    }
  });

  it('defeats every common hiding vector with !important', () => {
    for (const decl of [
      'visibility: visible !important',
      'opacity: 1 !important',
      'pointer-events: auto !important',
      'display: flex !important',
    ]) {
      expect(BLANC_LOCKOUT_GUARD_CSS).toContain(decl);
    }
  });

  it('respects the ephemeral hidden states so the taskbar toggle still works', () => {
    // The taskbar rule opts out when the shell itself hid it; those states reset
    // on reload, so they are not persistent lockout vectors.
    expect(BLANC_LOCKOUT_GUARD_CSS).toContain(
      '.blanc-root:not(.is-workspace-full):not(.is-taskbar-hidden) .blanc-taskbar',
    );
  });

  it('pins the taskbar into normal flow to defeat off-screen positioning', () => {
    expect(BLANC_LOCKOUT_GUARD_CSS).toContain('position: static !important');
    expect(BLANC_LOCKOUT_GUARD_CSS).toContain('left: auto !important');
  });
});
