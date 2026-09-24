/**
 * Gate 10's achievable half: an unreachable WebUI produces a sentence, not a Node errno.
 *
 * The gate was driven 2026-08-30 and split. "Fast, named, not a timeout" passed — 4 ms and
 * a named errno. "Distinct from *not running*" FAILED, and is not fixable from this side: a
 * control against port 8099, where nothing has ever listened, returned the identical
 * `unreachable` and the identical message, because with the WebUI off nothing is bound to
 * the port and the two causes are the SAME socket event. The signal the gate named is a line
 * in qBittorrent's own log file; reading it is a recorded non-goal (see
 * `MAIN_V1_COMPLETION_PLAN.md` Phase 9.2).
 *
 * So what shipped instead is honesty about the limit. The old message was the raw
 * `connect ECONNREFUSED 127.0.0.1:8080` — not a sentence, not actionable, and it quietly
 * implies one cause. These cases pin the replacement, and the last two pin what it must NOT
 * become: a message that picks one of the two causes and asserts it.
 */
import { describe, expect, it } from 'vitest';
import { qbitTransportMessage } from '../scraper/qbittorrent';

const AT = { host: '127.0.0.1', port: 8080 };

/** Shaped like what `fetch`/undici actually throws, code and all. */
function sysError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('qbitTransportMessage', () => {
  it('names the address and BOTH live possibilities on a refused connection', () => {
    const text = qbitTransportMessage(AT, sysError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:8080'));
    expect(text).toContain('127.0.0.1:8080');
    // The two causes the product cannot separate, asked about together. Naming only
    // one would be the false claim this whole decision exists to avoid.
    expect(text).toMatch(/isn't reachable/i);
    expect(text).toMatch(/running with Web UI enabled\?/i);
    // And it is prose, not a syscall trace.
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('connect ');
  });

  it('works off the message alone when the code is lost in the fetch wrapper', () => {
    // undici wraps the syscall error, and `code` does not always survive on the outer
    // error. The old raw-message path could not care; this one has to.
    const text = qbitTransportMessage(AT, new Error('connect ECONNREFUSED 127.0.0.1:8080'));
    expect(text).toMatch(/isn't reachable/i);
    expect(text).not.toContain('ECONNREFUSED');
  });

  it('separates a name that will not resolve from a port nothing answers', () => {
    const text = qbitTransportMessage(
      { host: 'seedbox.example', port: 8080 },
      sysError('ENOTFOUND', 'getaddrinfo ENOTFOUND seedbox.example'),
    );
    expect(text).toContain('seedbox.example');
    expect(text).toMatch(/could not be resolved/i);
    // A DNS failure is genuinely a different cause, so it must not borrow the
    // refused-connection wording.
    expect(text).not.toMatch(/isn't reachable/i);
  });

  it('calls a hang a hang', () => {
    const text = qbitTransportMessage(AT, sysError('ETIMEDOUT', 'connect ETIMEDOUT 127.0.0.1:8080'));
    expect(text).toContain('127.0.0.1:8080');
    expect(text).toMatch(/did not answer in time/i);
    expect(text).not.toMatch(/isn't reachable/i);
  });

  it('keeps an unrecognised failure verbatim rather than flattening it', () => {
    // The failure mode on the other side: swallowing an unknown error into a generic
    // string loses the only evidence anyone would have had.
    const text = qbitTransportMessage(AT, new Error('socket hang up in an unfamiliar way'));
    expect(text).toContain('socket hang up in an unfamiliar way');
    expect(text).toContain('127.0.0.1:8080');
  });

  it('does not claim to know which of the two it is', () => {
    const refused = qbitTransportMessage(AT, sysError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:8080'));
    // The whole content of the gate's failing half. A message asserting either one is a
    // false honest state, because the socket result is identical for both.
    expect(refused).not.toMatch(/qBittorrent is not running\b/i);
    expect(refused).not.toMatch(/the Web ?UI is (?:turned )?off\b/i);
    // It asks rather than tells.
    expect(refused.trim().endsWith('?')).toBe(true);
  });

  it('is the same message for a dead port as for a live daemon with the WebUI off', () => {
    // The 2026-08-30 control, kept as a case: port 8099 has never had a listener. The two
    // ARE indistinguishable, and the fix does not pretend otherwise — it makes the one
    // message honest for both. If a later change makes these differ, it is claiming a
    // signal the product does not have, and this fails.
    const webuiOff = qbitTransportMessage(AT, sysError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:8080'));
    const nothingThere = qbitTransportMessage(
      { host: '127.0.0.1', port: 8080 },
      sysError('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:8080'),
    );
    expect(webuiOff).toBe(nothingThere);
  });
});
