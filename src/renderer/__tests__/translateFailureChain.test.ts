// @vitest-environment jsdom
/**
 * A translation that no engine could produce names every engine tried and why
 * — "DeepL: quota used up · Offline: not installed" — instead of only the last
 * failure, which used to hide the cloud reason behind the offline model's.
 */
import { describe, expect, it } from 'vitest';
import { translateFailureMessage } from '../translator';

describe('translateFailureMessage', () => {
  it('names both engines and both reasons for a chain', () => {
    const message = translateFailureMessage({
      provider: 'deepl',
      code: 'quota',
      attempts: [{ provider: 'deepl', code: 'quota' }, { provider: 'local', code: 'not-installed' }],
    });
    expect(message).toContain('DeepL API');
    expect(message).toContain("the account's quota is used up");
    expect(message).toContain('Offline (small model)');
    expect(message).toContain('the model is not installed');
    expect(message.startsWith('No engine could translate this.')).toBe(true);
  });

  it('keeps the single-engine wording for a single failure, and says "offline" honestly', () => {
    expect(translateFailureMessage({ provider: 'deepl', code: 'offline' }))
      .toBe('DeepL API could not translate this: this computer is offline, so nothing was sent.');
  });

  it('never puts anything key-like into the message', () => {
    const message = translateFailureMessage({ provider: 'deepl', code: 'auth' });
    expect(message).not.toMatch(/[A-Za-z0-9]{8}-[A-Za-z0-9]{4}|:fx/);
  });
});
