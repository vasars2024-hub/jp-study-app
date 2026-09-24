import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_OWNED_TOKENS,
  BUILT_IN_UI_THEMES,
  PROTECTED_UI_SELECTORS,
  UI_CUSTOMIZATION_VERSION,
  UI_CUSTOM_CSS_LIMIT,
  UI_LOOK_DEFAULTS,
  UI_SUBTITLE_FONT_SIZE,
  UI_TOKENS,
  activeUiProfile,
  addUiProfile,
  applyUiPlan,
  createDefaultUiCustomizationDocument,
  createUiThemeProfile,
  deleteUiProfile,
  discardUiPreview,
  exportUiTheme,
  findUiProfile,
  importUiTheme,
  interpretUiRequest,
  normalizeTokenValue,
  normalizeUiCustomizationDocument,
  patchUiTokens,
  profileToCss,
  restoreUiDefaults,
  reviewCustomCss,
  sanitizeTokenPatch,
  setActiveUiProfile,
  stageUiPlan,
  undoUiChange,
  type UiCustomizationDocument,
  type UiThemeProfile,
} from '../uiCustomization';
import { normalizeVideoCoreStudyPreferences } from '../videoCoreStudy';

const NOW = '2026-07-25T12:00:00.000Z';
const opts = { now: NOW, versionId: 'v1' };

function doc(): UiCustomizationDocument {
  return createDefaultUiCustomizationDocument(NOW);
}

/** Asserting lookup: a missing profile is a test failure, not a non-null assertion. */
function profileOf(document: UiCustomizationDocument, id: string): UiThemeProfile {
  const found = findUiProfile(document, id);
  if (!found) throw new Error(`no profile "${id}"`);
  return found;
}

describe('ui customization — the token allow-list', () => {
  it('ships §20’s five named themes plus the user’s own', () => {
    const document = doc();
    expect(document.profiles.map((profile) => profile.id)).toEqual([
      'default', 'macos-inspired', 'minimal', 'japanese-study', 'dark-oled',
    ]);
    expect(document.profiles.every((profile) => profile.builtIn)).toBe(true);
    expect(activeUiProfile(document).id).toBe('default');
    // "Default" overrides no token; it only puts Appearance's layout values back.
    expect(document.profiles[0].tokens).toEqual({});
    expect(document.profiles[0].look).toEqual(UI_LOOK_DEFAULTS);
  });

  it('accepts a value only for a token on the list', () => {
    expect(normalizeTokenValue('bg', '#ff2e4d')).toBe('#ff2e4d');
    expect(normalizeTokenValue('not-a-token', '#fff')).toBeNull();
    const { tokens, issues } = sanitizeTokenPatch({ bg: '#112233', 'z-max': '9999' });
    expect(tokens).toEqual({ bg: '#112233' });
    expect(issues).toEqual([{ token: 'z-max', message: 'Not a customizable token.' }]);
  });

  it('clamps numeric tokens to their declared bounds', () => {
    expect(normalizeTokenValue('control-radius', '999px')).toBe('32px');
    expect(normalizeTokenValue('control-radius', '-40px')).toBe('0px');
    expect(normalizeTokenValue('font-size-md', '18px')).toBe('18px');
    expect(normalizeTokenValue('line-height-normal', '1.75')).toBe('1.75');
  });

  it('folds seconds into a millisecond token but rejects a mismatched unit', () => {
    expect(normalizeTokenValue('motion-duration', '0.2s')).toBe('200ms');
    expect(normalizeTokenValue('motion-duration', '200ms')).toBe('200ms');
    expect(normalizeTokenValue('control-radius', '2rem')).toBeNull();
  });

  it('refuses a value that would escape its declaration', () => {
    // Every one of these is a way to turn "set a colour" into "write arbitrary CSS".
    expect(normalizeTokenValue('bg', 'red; position: fixed')).toBeNull();
    expect(normalizeTokenValue('bg', 'red} .os-taskbar{display:none')).toBeNull();
    expect(normalizeTokenValue('font-display', 'x/*')).toBeNull();
    expect(normalizeTokenValue('glass-tint', 'url(https://evil.example/x.png)')).toBeNull();
    expect(normalizeTokenValue('glass-tint', 'expression(alert(1))')).toBeNull();
  });

  it('every listed token declares bounds when it is numeric', () => {
    for (const spec of UI_TOKENS) {
      if (spec.kind === 'length' || spec.kind === 'number' || spec.kind === 'duration') {
        expect(spec.min, `${spec.token} missing min`).toBeTypeOf('number');
        expect(spec.max, `${spec.token} missing max`).toBeTypeOf('number');
        expect(spec.unit, `${spec.token} missing unit`).toBeDefined();
      }
    }
  });
});

describe('ui customization — a theme writes Appearance values, it does not override them', () => {
  it('none of the tokens Settings > Appearance owns is customizable here', () => {
    for (const token of APPEARANCE_OWNED_TOKENS) {
      expect(UI_TOKENS.some((spec) => spec.token === token), token).toBe(false);
    }
    const { tokens, issues } = sanitizeTokenPatch({ accent: '#123456', 'space-md': '20px', 'radius-md': '4px' });
    expect(tokens).toEqual({});
    expect(issues.map((issue) => issue.token).sort()).toEqual(['accent', 'radius-md', 'space-md']);
  });

  it('no built-in theme emits an Appearance-owned token, so it can never mask those controls', () => {
    for (const profile of doc().profiles) {
      const css = profileToCss(profile);
      for (const token of APPEARANCE_OWNED_TOKENS) {
        expect(css, `${profile.id} emits --${token}`).not.toMatch(new RegExp(`--${token}:`));
      }
    }
    expect(profileOf(doc(), 'macos-inspired').look).toEqual({ radius: 'round', density: 'spacious', shadow: 'soft' });
  });

  it('a stored theme from before keeps its look: its old tokens become Appearance values', () => {
    const document = normalizeUiCustomizationDocument({
      profiles: [{
        id: 'mine',
        name: 'Mine',
        tokens: { accent: '#00DDAA', 'space-md': '16px', 'radius-md': '4px', 'shadow-card': 'none', bg: '#101010' },
      }],
    }, NOW);
    const mine = profileOf(document, 'mine');
    expect(mine.look).toEqual({ accent: '#00ddaa', density: 'spacious', radius: 'sharp', shadow: 'none' });
    expect(mine.tokens).toEqual({ bg: '#101010' });
  });

  it('the subtitle size bounds are the player\'s own', () => {
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontSize: 1 }).subtitleFontSize).toBe(UI_SUBTITLE_FONT_SIZE.min);
    expect(normalizeVideoCoreStudyPreferences({ subtitleFontSize: 999 }).subtitleFontSize).toBe(UI_SUBTITLE_FONT_SIZE.max);
    expect(normalizeVideoCoreStudyPreferences({}).subtitleFontSize).toBe(UI_SUBTITLE_FONT_SIZE.fallback);
  });
});

describe('ui customization — custom CSS safety', () => {
  it('accepts an ordinary stylesheet', () => {
    const review = reviewCustomCss('.novel-page { letter-spacing: 0.02em; }');
    expect(review.safe).toBe(true);
    expect(review.violations).toEqual([]);
  });

  it('refuses to let anything hide the way out of the UI', () => {
    for (const selector of ['.os-taskbar', '.win-close', '.settings-nav', 'body']) {
      const review = reviewCustomCss(`${selector} { display: none; }`);
      expect(review.safe, `${selector} should be protected`).toBe(false);
      expect(review.violations[0].kind).toBe('hides-protected');
    }
  });

  it('catches every way of making a protected element unreachable', () => {
    for (const declaration of [
      'visibility: hidden',
      'opacity: 0',
      'pointer-events: none',
      'display: none !important',
    ]) {
      const review = reviewCustomCss(`.os-taskbar { ${declaration}; }`);
      expect(review.safe, declaration).toBe(false);
    }
    // A descendant of a protected root counts too.
    expect(reviewCustomCss('.os-taskbar .start { display: none; }').safe).toBe(false);
  });

  it('still allows styling a protected element without hiding it', () => {
    expect(reviewCustomCss('.os-taskbar { background: #101015; }').safe).toBe(true);
  });

  it('blocks network access, script urls and @import but allows data: urls', () => {
    expect(reviewCustomCss('@import url("https://evil.example/x.css");').violations.map((v) => v.kind))
      .toContain('at-import');
    expect(reviewCustomCss('.a { background: url(https://evil.example/x.png); }').violations.map((v) => v.kind))
      .toContain('remote-url');
    expect(reviewCustomCss('.a { background: url("data:image/gif;base64,R0lGOD"); }').safe).toBe(true);
    expect(reviewCustomCss('.a { background: url(javascript:alert(1)); }').safe).toBe(false);
    expect(reviewCustomCss('.a { width: expression(alert(1)); }').violations.map((v) => v.kind))
      .toContain('expression');
  });

  it('sees through comments used to smuggle a rule past the reader', () => {
    const review = reviewCustomCss('.a { color: red; } /* harmless */ .os/**/-taskbar { color: blue }');
    // The comment is stripped before parsing, so the real selector is what gets checked.
    expect(review.violations.every((violation) => violation.kind !== 'unbalanced')).toBe(true);
    expect(reviewCustomCss('/* @import "x" */').violations).toEqual([]);
  });

  it('reports unbalanced braces and oversized input instead of parsing on', () => {
    expect(reviewCustomCss('.a { color: red;').violations.map((v) => v.kind)).toContain('unbalanced');
    const review = reviewCustomCss('a'.repeat(UI_CUSTOM_CSS_LIMIT + 1));
    expect(review.violations.map((v) => v.kind)).toEqual(['too-long']);
    expect(review.css).toBe('');
  });

  it('lists a protected selector for every escape route the shell needs', () => {
    // A regression guard: someone removing one of these from the list is removing a
    // lockout protection, and should have to change this test to do it.
    expect(PROTECTED_UI_SELECTORS).toEqual(expect.arrayContaining([
      '.os-taskbar', '.win-close', '.os-settings', '.settings-nav', 'body', 'html', ':root',
    ]));
  });
});

describe('ui customization — CSS generation', () => {
  it('emits only allow-listed tokens, sorted, on :root', () => {
    const { document } = patchUiTokens(doc(), 'default', { bg: '#000000', 'control-radius': '12px' }, opts);
    const css = profileToCss(profileOf(document, 'default'));
    expect(css).toContain('--bg: #000000 !important;');
    expect(css).toContain('--control-radius: 12px !important;');
    expect(css.indexOf('--bg')).toBeLessThan(css.indexOf('--control-radius'));
  });

  it('drops an Appearance-owned token even when one reaches a profile by another route', () => {
    const smuggled = { ...profileOf(doc(), 'default'), tokens: { accent: '#ff0000', 'space-md': '30px', bg: '#000000' } };
    const css = profileToCss(smuggled);
    expect(css).not.toContain('--accent');
    expect(css).not.toContain('--space-md');
    expect(css).toContain('--bg: #000000 !important;');
  });

  it('keeps a pinned font size riding the display base font, and scales nothing else', () => {
    // These declarations are `!important`, so they replace `theme/tokens.css`'s
    // `calc(<step> * var(--display-font-scale, 1))` outright. Without re-applying the scale, a
    // profile that pins one step of the ladder would make Settings > Display > base font stop
    // working for exactly that step — the two text-size affordances would cancel rather than
    // compose.
    const { document } = patchUiTokens(doc(), 'default', {
      'font-size-sm': '15px',
      'control-radius': '10px',
      'line-height-normal': '1.8',
    }, opts);
    const css = profileToCss(profileOf(document, 'default'));
    expect(css).toContain('--font-size-sm: calc(15px * var(--display-font-scale, 1)) !important;');
    expect(css).toContain('--control-radius: 10px !important;');
    expect(css).toContain('--line-height-normal: 1.8 !important;');
  });

  it('a theme with no overrides produces no stylesheet at all', () => {
    expect(profileToCss(profileOf(doc(), 'default'))).toBe('');
  });

  it('never renders a profile stylesheet — Appearance has the one custom-CSS editor', () => {
    const withCss = { ...profileOf(doc(), 'default'), customCss: '.novel-page { color: #eee; }', customCssEnabled: true };
    expect(profileToCss(withCss)).not.toContain('.novel-page');
    // And no component variable nothing reads.
    expect(profileToCss(profileOf(doc(), 'japanese-study'))).not.toContain('--ui-');
  });
});

describe('ui customization — the request interpreter', () => {
  it('handles every example §20 spells out', () => {
    expect(interpretUiRequest('Make the sidebar smaller').intents.map((i) => i.id)).toEqual(['sidebar-narrower']);
    expect(interpretUiRequest('Use a darker glass style').intents.map((i) => i.id)).toEqual(['darker-glass']);
    expect(interpretUiRequest('Make the app look more like macOS').intents.map((i) => i.id)).toEqual(['macos-look']);
    expect(interpretUiRequest('Increase subtitle size').intents.map((i) => i.id)).toEqual(['subtitle-larger']);
    expect(interpretUiRequest('Change card spacing — less spacing please').intents.map((i) => i.id))
      .toEqual(['card-spacing-tighter']);
  });

  it('does not let a generic rule swallow a specific one', () => {
    // "sidebar smaller" also contains "smaller"; the specific rule must win alone.
    const plan = interpretUiRequest('make the sidebar smaller');
    expect(plan.intents.map((intent) => intent.id)).toEqual(['sidebar-narrower']);
    expect(plan.tokens['font-size-md']).toBeUndefined();
  });

  it('resolves relative nudges against the current values, not a fixed table', () => {
    const fromBaseline = interpretUiRequest('rounder');
    expect(fromBaseline.look.radius).toBe('round');
    expect(fromBaseline.tokens['control-radius']).toBe('13px');
    // The CURRENT Appearance value is the base, so "rounder" from Sharp is one step.
    const fromCurrent = interpretUiRequest('rounder', { 'control-radius': '4px' }, { look: { radius: 'sharp' } });
    expect(fromCurrent.look.radius).toBe('soft');
    expect(fromCurrent.tokens['control-radius']).toBe('6px');
    expect(interpretUiRequest('make the sidebar smaller', {}, { look: { density: 'compact' } }).look.density)
      .toBe('compact');
  });

  it('routes a subtitle request to the player\'s real subtitle size', () => {
    const plan = interpretUiRequest('Increase subtitle size', {}, { subtitleFontSize: 26 });
    expect(plan.subtitleFontSize).toBe(33);
    expect(plan.tokens).toEqual({});
    expect(plan.look).toEqual({});
    expect(interpretUiRequest('bigger subtitles', {}, { subtitleFontSize: 46 }).subtitleFontSize).toBe(48);
    expect(interpretUiRequest('smaller subtitles', {}, { subtitleFontSize: 20 }).subtitleFontSize).toBe(17);
  });

  it('clamps a nudge that would leave the token’s safe range', () => {
    const plan = interpretUiRequest('bigger text', { 'font-size-md': '100px' });
    expect(plan.tokens['font-size-md']).toBe('28px');
  });

  it('combines independent intents in one request', () => {
    const plan = interpretUiRequest('make it flatter and use pure black');
    expect(plan.intents.map((intent) => intent.id).sort()).toEqual(['flatter', 'oled-black']);
    expect(plan.look.shadow).toBe('none');
    expect(plan.tokens.bg).toBe('#000000');
  });

  it('reports what it could not understand instead of guessing', () => {
    const plan = interpretUiRequest('make the app look like Blender with neon wireframes');
    expect(plan.intents).toEqual([]);
    expect(plan.unmatched).toEqual(expect.arrayContaining(['blender', 'neon', 'wireframes']));
    expect(plan.tokens).toEqual({});
    expect(plan.look).toEqual({});
  });

  it('does not report a matched phrase back as unmatched', () => {
    const plan = interpretUiRequest('use a darker glass style');
    expect(plan.unmatched).toEqual([]);
  });

  it('returns an empty plan for empty input', () => {
    expect(interpretUiRequest('   ')).toMatchObject({ intents: [], tokens: {}, look: {}, unmatched: [] });
  });

  it('a plan can only ever contain allow-listed tokens', () => {
    for (const request of [
      'make the sidebar smaller', 'darker glass', 'like macos', 'oled', 'flatter',
      'rounder', 'sharper corners', 'less motion', 'more contrast', 'bigger text',
      'smaller text', 'more compact', 'more spacious', 'looser spacing',
    ]) {
      const plan = interpretUiRequest(request);
      for (const token of Object.keys(plan.tokens)) {
        expect(UI_TOKENS.some((spec) => spec.token === token), `${request} → ${token}`).toBe(true);
      }
    }
  });
});

describe('ui customization — preview, confirm, undo', () => {
  it('staging a plan changes no profile', () => {
    const before = doc();
    const plan = interpretUiRequest('rounder');
    const staged = stageUiPlan(before, plan);
    expect(staged.preview).toBe(plan);
    expect(staged.profiles).toEqual(before.profiles);
    expect(discardUiPreview(staged).preview).toBeNull();
  });

  it('applying a plan writes it and clears the preview', () => {
    const plan = interpretUiRequest('rounder and bigger text');
    const document = applyUiPlan(stageUiPlan(doc(), plan), plan, opts);
    expect(document.preview).toBeNull();
    expect(findUiProfile(document, 'default')?.look.radius).toBe('round');
    expect(findUiProfile(document, 'default')?.tokens['font-size-md']).toBe('16px');
  });

  it('undo brings back the previous Appearance values too', () => {
    const plan = interpretUiRequest('more compact');
    let document = applyUiPlan(doc(), plan, opts);
    expect(profileOf(document, 'default').look.density).toBe('compact');
    document = undoUiChange(document, 'default', { now: NOW, versionId: 'v2' });
    expect(profileOf(document, 'default').look.density).toBe('comfortable');
  });

  it('undo restores the previous state and is itself reversible', () => {
    let document = patchUiTokens(doc(), 'default', { bg: '#111111' }, opts).document;
    document = patchUiTokens(document, 'default', { bg: '#222222' }, { now: NOW, versionId: 'v2' }).document;
    expect(findUiProfile(document, 'default')?.tokens.bg).toBe('#222222');

    document = undoUiChange(document, 'default', { now: NOW, versionId: 'v3' });
    expect(findUiProfile(document, 'default')?.tokens.bg).toBe('#111111');

    document = undoUiChange(document, 'default', { now: NOW, versionId: 'v4' });
    expect(findUiProfile(document, 'default')?.tokens.bg).toBe('#222222');
  });

  it('undo on a untouched profile says so rather than silently doing nothing', () => {
    expect(() => undoUiChange(doc(), 'default', opts)).toThrow(/nothing to undo/i);
  });

  it('restore defaults returns a built-in theme to its own baseline, not to empty', () => {
    let document = patchUiTokens(doc(), 'macos-inspired', { bg: '#00ff00' }, opts).document;
    document = applyUiPlan(document, interpretUiRequest('more compact'), { profileId: 'macos-inspired', now: NOW, versionId: 'v2' });
    document = restoreUiDefaults(document, 'macos-inspired', { now: NOW, versionId: 'v3' });

    const profile = profileOf(document, 'macos-inspired');
    expect(profile.tokens.bg).toBeUndefined();
    expect(profile.tokens['control-radius']).toBe('8px');
    expect(profile.look).toEqual({ radius: 'round', density: 'spacious', shadow: 'soft' });
    expect(profile.customCss).toBe('');
    expect(profile.customCssEnabled).toBe(false);
    // The state it replaced is still recoverable.
    expect(profile.history[0].tokens.bg).toBe('#00ff00');
    expect(profile.history[0].look.density).toBe('compact');
  });

  it('caps history rather than growing without bound', () => {
    let document = doc();
    for (let index = 0; index < 30; index += 1) {
      document = patchUiTokens(document, 'default', { bg: '#111111' }, {
        now: NOW,
        versionId: `v${index}`,
      }).document;
    }
    expect(findUiProfile(document, 'default')?.history).toHaveLength(20);
  });
});

describe('ui customization — profiles and portability', () => {
  it('creates, activates and deletes a user theme but protects built-ins', () => {
    let document = addUiProfile(doc(), createUiThemeProfile('mine', 'Mine', NOW, { look: { accent: '#abcdef' } }));
    document = setActiveUiProfile(document, 'mine');
    expect(activeUiProfile(document).id).toBe('mine');
    expect(() => deleteUiProfile(document, 'default')).toThrow(/built-in/i);

    document = deleteUiProfile(document, 'mine');
    // Deleting the active theme falls back rather than leaving a dangling id.
    expect(document.activeProfileId).toBe('default');
  });

  it('rejects a duplicate profile id and an unknown active id', () => {
    const document = doc();
    expect(() => addUiProfile(document, createUiThemeProfile('default', 'Dup', NOW))).toThrow(/already exists/i);
    expect(() => setActiveUiProfile(document, 'ghost')).toThrow(/unknown/i);
  });

  it('round-trips a theme through export and import as a new, non-built-in profile', () => {
    const source = patchUiTokens(doc(), 'default', { bg: '#123456' }, opts).document;
    const exported = exportUiTheme(source, 'default');
    expect(exported.version).toBe(UI_CUSTOMIZATION_VERSION);

    const { document } = importUiTheme(doc(), exported, { id: 'imported', now: NOW });
    const profile = profileOf(document, 'imported');
    expect(profile.tokens.bg).toBe('#123456');
    expect(profile.look).toEqual(UI_LOOK_DEFAULTS);
    expect(profile.builtIn).toBe(false);
    expect(profile.history).toEqual([]);
  });

  it('strips unsafe CSS out of an imported theme and reports why', () => {
    const { document, review } = importUiTheme(doc(), {
      version: UI_CUSTOMIZATION_VERSION,
      profile: {
        id: 'evil',
        name: 'Evil',
        tokens: {},
        componentSettings: {},
        customCss: '.os-taskbar { display: none; }',
        customCssEnabled: true,
      },
    }, { id: 'evil', now: NOW });

    expect(review.safe).toBe(false);
    const profile = profileOf(document, 'evil');
    expect(profile.customCss).toBe('');
    expect(profile.customCssEnabled).toBe(false);
  });

  it('refuses a theme from a newer app version', () => {
    expect(() => importUiTheme(doc(), { version: UI_CUSTOMIZATION_VERSION + 1 }, { id: 'x', now: NOW }))
      .toThrow(/newer app version/i);
  });

  it('normalization drops unknown tokens, restores missing built-ins and never restores a preview', () => {
    const document = normalizeUiCustomizationDocument({
      activeProfileId: 'ghost',
      preview: { request: 'stale', intents: [], tokens: {}, componentSettings: {}, unmatched: [] },
      profiles: [{
        id: 'mine',
        name: 'Mine',
        tokens: { accent: '#fff', 'z-max': '9999', 'space-md': '999px' },
        componentSettings: { mediaCard: { size: 'huge' } },
        customCss: 'body { display: none }',
        customCssEnabled: true,
      }],
    }, NOW);

    expect(document.activeProfileId).toBe('default');
    expect(document.preview).toBeNull();
    expect(document.profiles.map((profile) => profile.id))
      .toEqual(['mine', ...BUILT_IN_UI_THEMES.map((theme) => theme.id)]);
    const mine = profileOf(document, 'mine');
    // `#fff` is not a six-digit accent, so only the spacing survives, as Density.
    expect(mine.tokens).toEqual({});
    expect(mine.look).toEqual({ density: 'spacious' });
    expect(mine.customCss).toBe('');
    expect(mine.customCssEnabled).toBe(false);
    expect(mine.builtIn).toBe(false);
  });

  it('normalization is idempotent', () => {
    const once = normalizeUiCustomizationDocument(doc(), NOW);
    expect(normalizeUiCustomizationDocument(once, NOW)).toEqual(once);
  });
});

describe('ui customization — purity', () => {
  it('never mutates the document it was given', () => {
    const before = doc();
    const snapshot = JSON.stringify(before);
    patchUiTokens(before, 'default', { bg: '#123123' }, opts);
    applyUiPlan(before, interpretUiRequest('rounder'), opts);
    restoreUiDefaults(before, 'default', opts);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
