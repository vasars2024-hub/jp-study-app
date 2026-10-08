import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../../shared/i18n/catalogs';
import { youtubeErrorMessage } from '../../shared/youtubeErrors';

const SRC = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('native dialog strings go through mt()', () => {
  it('visual novel dialogs have no literal English titles or filter names', () => {
    const src = read('main', 'immersion', 'visualNovels.ts');
    const dialogs = src.split(/dialog\.show(?:Open|Save)Dialog\(/).slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('});')));
    expect(dialogs.length).toBeGreaterThan(5);
    for (const body of dialogs) {
      // LEProc.exe is a file name, not prose.
      const literals = [...body.matchAll(/(?:title|name):\s*'([^']+)'/g)].map((m) => m[1]).filter((s) => s !== 'LEProc.exe' && s !== 'JSON');
      expect(literals).toEqual([]);
    }
    for (const key of [...src.matchAll(/mt\('(polish2\.[^']+)'\)/g)].map((m) => m[1])) {
      expect(en[key], key).toBeTruthy();
    }
  });
});

describe('Settings window chrome (D98)', () => {
  it('status bar shows translated page and group names', () => {
    const src = read('renderer', 'components', 'settings', 'SettingsApp.tsx');
    expect(src).not.toMatch(/\?\? 'Settings'/);
    expect(src).toContain('<StatusBarField>{pageLabelText}</StatusBarField>');
    expect(src).toContain('<StatusBarField>{pageGroupText}</StatusBarField>');
  });
});

describe('youtubeErrorMessage (D173)', () => {
  it('maps yt-dlp failures to catalog keys that exist', () => {
    const samples = [
      'ERROR: [youtube] x: Private video',
      'ERROR: [youtube] x: Sign in to confirm you’re not a bot',
      'HTTP Error 429: Too Many Requests',
      'ERROR: [youtube] x: Video unavailable',
      'ERROR: [youtube:tab] x: The playlist does not exist.',
      'ERROR: Unable to download webpage: getaddrinfo failed',
      'Could not parse yt-dlp JSON.',
      'yt-dlp was not found on your PATH.',
    ];
    for (const raw of samples) {
      const message = youtubeErrorMessage(raw);
      expect(message, raw).not.toBeNull();
      const key = message?.key ?? '';
      expect(en[key], key).toBeTruthy();
    }
  });

  it('leaves unrecognised output (and app messages) alone', () => {
    expect(youtubeErrorMessage('Something else entirely')).toBeNull();
    expect(youtubeErrorMessage('')).toBeNull();
    expect(youtubeErrorMessage('yt-dlp exited with code 2')).toBeNull();
  });
});
