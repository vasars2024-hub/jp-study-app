import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const content = readFileSync(
  resolve(__dirname, '..', 'components', 'visualizer', 'VisualizerContent.tsx'),
  'utf8',
);
const section = readFileSync(resolve(__dirname, '..', 'components', 'AppSection.tsx'), 'utf8');
const settingsApp = readFileSync(
  resolve(__dirname, '..', 'components', 'settings', 'SettingsApp.tsx'),
  'utf8',
);

describe('Visualizer idle recovery action', () => {
  it('uses the shared localized Music command and a real Study OS navigation action', () => {
    expect(content).toContain("t('commands.nav.open.music')");
    expect(content).not.toContain('play a song in Music');
    expect(content).toContain('data-viz-action="music"');
    expect(content).toContain('onClick={onOpenMusic}');
    expect(content).toContain('<span className={classes.hint}>{hint}</span>');
    // Was `new CustomEvent('os:open', …)` until L9's Music-widget slice. That
    // dispatch is real on the desktop and a DEAD BUTTON inside
    // `?popout=visualizer`/`?popout=musicwidget`, which mount no DesktopShell.
    // `openSectionSurface` keeps the desktop route and adds the pop-out
    // fallback, so the assertion moved rather than being dropped.
    expect(section).toContain("openSectionSurface('music')");
  });

  it('keeps navigation in one labelled contextual edge dock', () => {
    expect(content).toContain('className="viz-widget-dock"');
    expect(content).toContain('role="toolbar"');
    expect(content).toContain('data-viz-action="settings"');
    expect(section).toContain("detail: { page: 'visualizer', settingId: 'visualizer' }");
    // Visualizer is an advanced Settings page. A direct event that calls ordinary navigate
    // is bounced straight back Home when Advanced mode is off, so the route must carry the
    // same temporary guided exemption as the Agent's explicit settings handoff.
    expect(settingsApp).toContain("navigate(d.page, d.settingId, { guided: true })");
    expect(settingsApp).toContain('setGuidedPage(options?.guided ? next : null)');
  });

  it('keeps the reused label complete in every shared locale', () => {
    const key = 'commands.nav.open.music' as const;
    for (const catalog of [en, ja, zh, ru]) expect(catalog[key]).toBeTruthy();
  });
});
