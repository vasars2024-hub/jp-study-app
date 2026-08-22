// @vitest-environment jsdom
/**
 * The app's three animation levels must reach the Agent through the same motion
 * tokens as every other surface. Reduced is Performance — purposeful state
 * transitions run at half speed — while Disabled and the OS preference snap.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bootDisplayPrefs, saveDisplayPrefs } from '../displayPrefs';
import { bootMotionPrefs } from '../motion/motionPrefs';

const SRC = resolve(__dirname, '../..');
const a11yCss = readFileSync(resolve(SRC, 'renderer/theme/a11y.css'), 'utf8');
const utilityCss = readFileSync(resolve(SRC, 'renderer/theme/motion.css'), 'utf8');
const agentCss = readFileSync(resolve(SRC, 'renderer/components/agent/agent.css'), 'utf8');

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-display-anim');
  document.documentElement.removeAttribute('data-motion-mode');
  document.documentElement.style.cssText = '';
  bootDisplayPrefs();
  bootMotionPrefs();
});

describe('Agent animation-level propagation', () => {
  it('makes Reduced live immediately as half-speed Performance', () => {
    saveDisplayPrefs({ animationLevel: 'reduced' });

    const root = document.documentElement;
    expect(root.dataset.displayAnim).toBe('reduced');
    expect(root.dataset.motionMode).toBe('performance');
    expect(root.style.getPropertyValue('--dur-fast')).toBe('70ms');
    expect(root.classList.contains('reduce-motion')).toBe(true);

    // The class still lets ambience opt out, but must not globally erase the
    // Agent's three purposeful, token-timed transitions.
    expect(a11yCss).not.toMatch(/html\.reduce-motion\s+\*/);
    expect(utilityCss).not.toMatch(/html\.reduce-motion\s+\[class\*='(?:anim|trans)-'\]/);
    expect(agentCss.match(/transition:/g)?.length).toBe(5);
    expect(agentCss).toMatch(/transition:\s*transform\s+var\(--dur-fast,\s*140ms\)/);
  });

  it('keeps Disabled distinct and reversible', () => {
    saveDisplayPrefs({ animationLevel: 'none' });
    expect(document.documentElement.dataset.motionMode).toBe('disabled');
    expect(document.documentElement.dataset.motionSnap).toBe('1');
    expect(document.documentElement.style.getPropertyValue('--dur-fast')).toBe('0ms');

    saveDisplayPrefs({ animationLevel: 'full' });
    expect(document.documentElement.dataset.motionMode).toBe('normal');
    expect(document.documentElement.dataset.motionSnap).toBe('0');
    expect(document.documentElement.style.getPropertyValue('--dur-fast')).toBe('140ms');
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });
});
