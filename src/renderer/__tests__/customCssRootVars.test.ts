/**
 * v1.0 audit §2.2 — the custom CSS sandbox's root variables must beat the inline
 * personalization styles.
 *
 * `osPersonalization.applyPersonalization` writes ~44 design tokens as inline styles on
 * `documentElement`, and an inline declaration beats any author selector. So
 * `:root { --accent: red }` typed into the sandbox parsed, passed the sanitizer, landed
 * in the DOM, and did nothing — the defect the audit item describes. `applyCustomCss`
 * now re-declares root-scoped custom properties as `!important` through the CSSOM.
 *
 * **Why a stub CSSOM and not jsdom.** jsdom's cssstyle drops custom-property
 * declarations outright: a parsed `:root { --accent: red }` rule has `style.length === 0`
 * there, so every assertion about promoting them passes or fails for reasons that have
 * nothing to do with this code (measured 2026-08-07 — the first draft of this file ran
 * under `@vitest-environment jsdom` and reported `promoted: 0` for every case, while
 * three further cases passed *vacuously*). The stubs below model exactly the CSSOM
 * surface the walker touches, so the traversal, the selector rule and the priority
 * handling are tested for real.
 *
 * That `!important` then actually outranks an inline declaration is a browser guarantee,
 * not this module's logic, and is verified on the live app instead.
 */
import { describe, expect, it } from 'vitest';
import { promoteRootVariables } from '../customCss';

interface StubDecl {
  props: Map<string, { value: string; priority: string }>;
}

/** A `CSSStyleDeclaration` reduced to the members the walker uses. */
function decl(entries: Record<string, [string, string?]>): CSSStyleDeclaration {
  const props = new Map(
    Object.entries(entries).map(([name, [value, priority]]) => [name, { value, priority: priority ?? '' }]),
  );
  const stub = {
    props,
    getPropertyValue: (name: string) => props.get(name)?.value ?? '',
    getPropertyPriority: (name: string) => props.get(name)?.priority ?? '',
    setProperty: (name: string, value: string, priority?: string) => {
      props.set(name, { value, priority: priority ?? '' });
    },
    [Symbol.iterator]: () => props.keys(),
  };
  return stub as unknown as CSSStyleDeclaration & StubDecl;
}

/**
 * Modelled on the **Chromium** shape, where CSS nesting makes every `CSSStyleRule` a
 * grouping rule too: `rule.cssRules` exists and is empty on an ordinary rule. The first
 * version of the walker tested `cssRules` first and treated any rule that had it as a
 * group, which silently skipped every top-level rule in the sheet — caught only on the
 * live app, because the earlier stubs left `cssRules` off style rules entirely.
 */
function styleRule(selectorText: string, style: CSSStyleDeclaration, nested: CSSRule[] = []): CSSRule {
  return { selectorText, style, cssRules: list(nested) } as unknown as CSSRule;
}

function groupRule(children: CSSRule[]): CSSRule {
  return { cssRules: list(children) } as unknown as CSSRule;
}

function list(rules: CSSRule[]): CSSRuleList {
  return rules as unknown as CSSRuleList;
}

function priorities(style: CSSStyleDeclaration): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of style as unknown as Iterable<string>) {
    out[name] = style.getPropertyPriority(name);
  }
  return out;
}

describe('custom CSS sandbox — promoting root variables above inline personalization', () => {
  it('promotes every custom property on a :root rule and counts them', () => {
    const style = decl({ '--accent': ['#ff0000'], '--radius-md': ['30px'] });
    expect(promoteRootVariables(list([styleRule(':root', style)]))).toBe(2);
    expect(priorities(style)).toEqual({ '--accent': 'important', '--radius-md': 'important' });
    expect(style.getPropertyValue('--accent')).toBe('#ff0000');
  });

  it('treats html the same, including a qualified selector', () => {
    const bare = decl({ '--accent': ['red'] });
    const qualified = decl({ '--accent': ['red'] });
    expect(promoteRootVariables(list([styleRule('html', bare)]))).toBe(1);
    expect(promoteRootVariables(list([styleRule(':root.dark, html[data-theme]', qualified)]))).toBe(1);
  });

  it('leaves non-variable declarations at their author priority', () => {
    const style = decl({ '--accent': ['red'], 'border-radius': ['18px'] });
    expect(promoteRootVariables(list([styleRule(':root', style)]))).toBe(1);
    expect(priorities(style)).toEqual({ '--accent': 'important', 'border-radius': '' });
  });

  it('does not touch body-scoped variables, which already win', () => {
    // The inline declaration is on <html>, so it only decides <html>'s own computed
    // value — a body rule already beats it for everything body contains.
    const style = decl({ '--accent': ['red'] });
    expect(promoteRootVariables(list([styleRule('body', style)]))).toBe(0);
    expect(priorities(style)).toEqual({ '--accent': '' });
  });

  it('does not match selectors that merely start with the same letters', () => {
    for (const selector of ['.html-panel', 'html-ish', ':root-note', '.os-taskbar']) {
      const style = decl({ '--accent': ['red'] });
      expect(promoteRootVariables(list([styleRule(selector, style)])), selector).toBe(0);
    }
  });

  it('respects a priority the user wrote themselves', () => {
    const style = decl({ '--accent': ['red', 'important'] });
    expect(promoteRootVariables(list([styleRule(':root', style)]))).toBe(0);
  });

  it('reaches inside grouping rules such as @media', () => {
    const style = decl({ '--accent': ['red'] });
    const rules = list([groupRule([styleRule(':root', style)])]);
    expect(promoteRootVariables(rules)).toBe(1);
    expect(priorities(style)).toEqual({ '--accent': 'important' });
  });

  it('reaches a nested rule without skipping its parent', () => {
    const outer = decl({ '--accent': ['red'] });
    const inner = decl({ '--panel': ['blue'] });
    const rules = list([styleRule(':root', outer, [styleRule(':root', inner)])]);
    expect(promoteRootVariables(rules)).toBe(2);
    expect(priorities(outer)).toEqual({ '--accent': 'important' });
    expect(priorities(inner)).toEqual({ '--panel': 'important' });
  });

  it('is a no-op on an absent sheet rather than a throw', () => {
    expect(promoteRootVariables(undefined)).toBe(0);
  });
});
