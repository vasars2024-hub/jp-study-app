/*
 * extension/background.js — `apiFetch`'s error taxonomy.
 *
 * Every request the extension makes to the desktop app goes through this one
 * 35-line function, and every user-visible failure string in the companion is
 * produced by it. It classifies four situations:
 *
 *   fetch rejects          → "Gum is not running", offline = true, status 0
 *   404 on an app-update   → "Gum is outdated…",  offline = false
 *     path (/v1/sentence-analysis*)
 *   any other !res.ok      → the app's own `error`, or `HTTP <status>`
 *   res.ok                 → the parsed body, or null if it did not parse
 *
 * The classification is only half of it. The other half is what each of the
 * ~30 message handlers *does* with the resulting error — whether it forwards
 * `offline`, whether it queues the request, and what string reaches the toast.
 * Those handlers disagree with each other, and the table in the second block
 * below is the first place that disagreement is written down.
 *
 * Tests named AUDIT pin behaviour this file believes is wrong; they assert what
 * ships today so it cannot change unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { bootBackground, readExtensionFile, type BackgroundHarness, type Responder } from './extensionHarness';

const OFFLINE_MSG = 'Gum is not running — open the app, then retry.';
const OUTDATED_MSG =
  'Gum is outdated or not fully started — restart the app, then reload this extension.';
/** What a 401/403 reads as, whatever the app's own wording was. */
const AUTH_MSG = "Gum rejected this extension — re-pair it from the app's Companions settings.";

const APP_DOWN: Responder = () => 'network-error';

interface ApiResult {
  ok?: boolean;
  error?: string;
  offline?: boolean;
  payload?: unknown;
}

/** Reach apiFetch directly: the `api` message is a raw path passthrough. */
function api(h: BackgroundHarness, path: string, method = 'GET'): Promise<ApiResult> {
  return h.send({ type: 'api', path, method }) as Promise<ApiResult>;
}

/* =================== the four classifications apiFetch makes ================ */

describe('apiFetch — the message the user ends up reading', () => {
  it('says the app is closed when nothing answers the port', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    expect((await api(h, '/v1/lookup')).error).toBe(OFFLINE_MSG);
  });

  it('repeats the app own error text verbatim when it has one', async () => {
    const h = bootBackground({ responder: () => ({ status: 500, json: { error: 'Deck "Mining" is missing' } }) });
    expect((await api(h, '/v1/mine', 'POST')).error).toBe('Deck "Mining" is missing');
  });

  it('falls back to the bare status when the app sends no error text', async () => {
    const h = bootBackground({ responder: () => ({ status: 503, json: {} }) });
    expect((await api(h, '/v1/mine', 'POST')).error).toBe('HTTP 503');
  });

  it('falls back to the bare status when the body is not JSON at all', async () => {
    // A proxy or a half-started server answers text/html; `res.json()` throws
    // and is swallowed, leaving `json` null.
    const h = bootBackground({ responder: () => ({ status: 502 }) });
    expect((await api(h, '/v1/mine', 'POST')).error).toBe('HTTP 502');
  });

  it('tells the user to update when an analysis route is missing', async () => {
    const h = bootBackground({ responder: () => ({ status: 404, json: {} }) });
    expect((await api(h, '/v1/sentence-analysis', 'POST')).error).toBe(OUTDATED_MSG);
  });

  it('AUDIT: a 404 anywhere else reads as "HTTP 404", with no hint at all', async () => {
    const h = bootBackground({ responder: () => ({ status: 404, json: {} }) });
    // The same cause — running an app build older than this extension — is
    // only explained for one route family. Everywhere else the user gets a
    // bare status code they cannot act on.
    expect((await api(h, '/v1/lookup', 'POST')).error).toBe('HTTP 404');
    expect((await api(h, '/v1/mine-info')).error).toBe('HTTP 404');
    expect((await api(h, '/v1/grammar-match', 'POST')).error).toBe('HTTP 404');
  });

  it('AUDIT: the outdated hint overwrites a real 404 from that route', async () => {
    const h = bootBackground({
      responder: () => ({ status: 404, json: { error: 'No cached analysis for that sentence' } }),
    });
    // The app's own explanation is discarded whenever the status is 404 and
    // the path is in the family, so a legitimately-not-found analysis is
    // reported as an out-of-date install.
    expect((await api(h, '/v1/sentence-analysis/snapshot', 'POST')).error).toBe(OUTDATED_MSG);
  });

  it('applies the outdated hint only to 404, not to other failures on that route', async () => {
    const h = bootBackground({ responder: () => ({ status: 500, json: { error: 'Model timed out' } }) });
    expect((await api(h, '/v1/sentence-analysis', 'POST')).error).toBe('Model timed out');
  });
});

describe('apiFetch — which paths count as "the app is outdated"', () => {
  const outdated = async (path: string): Promise<boolean> => {
    const h = bootBackground({ responder: () => ({ status: 404, json: {} }) });
    return (await api(h, path)).error === OUTDATED_MSG;
  };

  it('covers the whole /v1/sentence-analysis family, including query strings', async () => {
    expect(await outdated('/v1/sentence-analysis')).toBe(true);
    expect(await outdated('/v1/sentence-analysis/snapshot')).toBe(true);
    expect(await outdated('/v1/sentence-analysis/mine')).toBe(true);
    expect(await outdated('/v1/sentence-analysis?text=x')).toBe(true);
  });

  it('is anchored at the start, so a path that merely contains it does not match', async () => {
    expect(await outdated('/v1/proxy/v1/sentence-analysis')).toBe(false);
  });

  it('stops at a segment boundary, so a sibling route does not inherit the hint', async () => {
    // Fixed 2026-08-02. Unanchored at the end, a future /v1/sentence-analysis-batch
    // 404 would have told the user their app was out of date when the truth is
    // the route simply does not exist. A 404 from a sibling is now reported raw.
    expect(await outdated('/v1/sentence-analysis-batch')).toBe(false);
    expect(await outdated('/v1/sentence-analysis-v2')).toBe(false);
    expect(readExtensionFile('background.js')).toContain(
      'const APP_UPDATE_PATHS = /^\\/v1\\/sentence-analysis(?:[/?]|$)/;',
    );
  });
});

/* ======================= the flags that ride along ======================== */

describe('apiFetch — the flags it hangs on the error', () => {
  it('marks only a refused connection as offline', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const down = (await h.send({ type: 'lookup', query: '猫' })) as ApiResult;
    expect(down).toMatchObject({ ok: false, offline: true, error: OFFLINE_MSG });

    // A reachable app that answers 401/404/500 is emphatically not offline —
    // the whole point of the flag is deciding whether to queue for retry.
    for (const status of [401, 404, 500]) {
      const h2 = bootBackground({ responder: () => ({ status, json: { error: 'nope' } }) });
      const res = (await h2.send({ type: 'lookup', query: '猫' })) as ApiResult;
      expect(res.offline).toBe(false);
    }
  });

  it('hands the parsed body back on the error, for callers that need the detail', async () => {
    const h = bootBackground({ responder: () => ({ status: 422, json: { error: 'Bad note', field: 'Back' } }) });
    const res = await api(h, '/v1/mine', 'POST');
    expect(res.payload).toEqual({ error: 'Bad note', field: 'Back' });
  });

  it('sends the pairing token as a bearer header on every request', async () => {
    const h = bootBackground({ seed: { jpStudyToken: 'secret-token', jpStudyPort: 19999 } });
    await api(h, '/v1/mine-info');
    expect(h.fetches[0].url).toBe('http://127.0.0.1:19999/v1/mine-info');
    expect(h.fetches[0].headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-token',
    });
  });

  it('omits the header entirely when the extension is not paired yet', async () => {
    const h = bootBackground({ seed: { jpStudyToken: '' } });
    await api(h, '/v1/mine-info');
    // An empty `Authorization: Bearer ` would read as a malformed token rather
    // than as an unpaired client, so the header is dropped instead.
    expect(h.fetches[0].headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('AUDIT: a 200 with an unreadable body succeeds as null', async () => {
    const h = bootBackground({ responder: () => ({ status: 200 }) });
    // `json` stays null and is returned as a success. Callers that read a
    // field off it (`out.action`, `out.anki.ok`) get a TypeError, which the
    // save paths then catch and treat as "app unreachable" — so a malformed
    // 200 is indistinguishable from being offline, and the save is queued.
    await expect(api(h, '/v1/mine-info')).resolves.toBe(null);
  });
});

/* ================= what each handler does with the error ================== */

/**
 * One row per message handler that can fail: the string it reports and whether
 * it passes `offline` through. Handlers were chosen for reaching apiFetch with
 * no page, no selection and no tab state.
 *
 * The point of the table is the inconsistency down the `offline` column. Three
 * handlers forward it, two hardcode it, and four drop it — so a content script
 * cannot ask "should I offer a retry?" without knowing which message it sent.
 */
describe('the error taxonomy as each message handler reports it', () => {
  const send = async (responder: Responder, msg: Record<string, unknown>): Promise<ApiResult> => {
    const h = bootBackground({
      responder,
      tab: {
        id: 7,
        windowId: 1,
        url: 'https://www.youtube.com/playlist?list=PLabcdefghijklmnop',
        title: 'A playlist',
        active: true,
      },
    });
    return (await h.send(msg)) as ApiResult;
  };

  const cases: Array<{ label: string; msg: Record<string, unknown> }> = [
    { label: 'lookup', msg: { type: 'lookup', query: '猫' } },
    { label: 'sentence-analysis', msg: { type: 'sentence-analysis', text: '猫が好き' } },
    { label: 'examples', msg: { type: 'examples', query: '猫' } },
    { label: 'api', msg: { type: 'api', path: '/v1/anything' } },
    { label: 'ocr-status', msg: { type: 'ocr-status' } },
    { label: 'playlist-status', msg: { type: 'playlist-status' } },
    { label: 'immersion-visit', msg: { type: 'immersion-visit', url: 'https://x.test/', seconds: 5, chars: 10 } },
  ];

  it('reports the app being closed like this', async () => {
    const rows: Record<string, { error?: string; offline?: unknown }> = {};
    for (const c of cases) {
      const res = await send(APP_DOWN, c.msg);
      rows[c.label] = { error: res.error, offline: res.offline };
    }
    expect(rows).toEqual({
      lookup: { error: OFFLINE_MSG, offline: true },
      'sentence-analysis': { error: OFFLINE_MSG, offline: true },
      // AUDIT: drops the flag, so the popup cannot offer "retry when it opens".
      examples: { error: OFFLINE_MSG, offline: undefined },
      // AUDIT: the generic passthrough — the one the reader popup uses most —
      // is also the one that loses the flag.
      api: { error: OFFLINE_MSG, offline: undefined },
      // Was `undefined` here too; ocr-status now forwards the flag alongside
      // the `available` fix below.
      'ocr-status': { error: OFFLINE_MSG, offline: true },
      'playlist-status': { error: OFFLINE_MSG, offline: true },
      // Queued instead of reported; the only handler that acts on the flag.
      'immersion-visit': { error: undefined, offline: undefined },
    });
  });

  it('reports a stale pairing token with one actionable message, and never as offline', async () => {
    const unauthorized: Responder = () => ({ status: 401, json: { error: 'Invalid token' } });
    const rows: Record<string, { error?: string; offline?: unknown }> = {};
    for (const c of cases) {
      const res = await send(unauthorized, c.msg);
      rows[c.label] = { error: res.error, offline: res.offline };
    }
    // Fixed 2026-08-02. "Invalid token" is accurate and unactionable; every
    // handler now surfaces the instruction instead, and no handler claims a
    // reachable-but-refusing app is offline.
    expect(rows).toEqual({
      lookup: { error: AUTH_MSG, offline: false },
      'sentence-analysis': { error: AUTH_MSG, offline: false },
      examples: { error: AUTH_MSG, offline: undefined },
      api: { error: AUTH_MSG, offline: undefined },
      'ocr-status': { error: AUTH_MSG, offline: false },
      'playlist-status': { error: AUTH_MSG, offline: false },
      'immersion-visit': { error: AUTH_MSG, offline: undefined },
    });
  });

  it('keeps what the app actually said, so the detail is not lost to the substitution', async () => {
    const h = bootBackground({
      responder: () => ({ status: 403, json: { error: 'This extension is blocked' } }),
    });
    // The `api` passthrough is one of the two paths that forward `err.payload`
    // (the other is the listener's outer catch), so it is where the substitution
    // is observable end to end: the user reads the instruction, the caller can
    // still see the app's own words.
    const res = (await h.send({ type: 'api', path: '/v1/anything' })) as ApiResult & {
      payload?: { error?: string };
    };
    expect(res.error).toBe(AUTH_MSG);
    expect(res.payload?.error).toBe('This extension is blocked');
  });

  it('AUDIT: err.serverError records the original text but nothing ever reads it', () => {
    const source = readExtensionFile('background.js');
    // apiFetch stashes the app's own message before overwriting `message` with
    // the re-pair instruction. That is the right instinct, but `serverError` is
    // written in one place and read in none — the same write-only pattern the
    // queue's `at` field sat in for a year. The detail that DOES survive to a
    // caller is `err.payload` (asserted above), which carries the same string
    // for any JSON error body; serverError only adds something when the body was
    // not JSON, and no handler asks for it. Wire it into the `api` response or
    // drop the field.
    expect(source).toContain('err.serverError = raw;');
    expect(source.match(/\berr\.serverError\b|\bserverError\b/g)).toHaveLength(1);
  });

  it('playlist-status distinguishes a server error from a closed app', async () => {
    const res = await send(() => ({ status: 500, json: { error: 'Playlist table is locked' } }), {
      type: 'playlist-status',
    });
    // Was hardcoded `offline: true` for every cause.
    expect(res).toMatchObject({ ok: false, offline: false, error: 'Playlist table is locked' });

    const down = await send(APP_DOWN, { type: 'playlist-status' });
    expect(down).toMatchObject({ ok: false, offline: true });
  });

  it('ocr-status only claims the models are missing when the app said so', async () => {
    // A closed app and a stale token say nothing about whether models are
    // installed, so `available` stays undetermined rather than sending the user
    // to re-download models they may already have.
    const down = (await send(APP_DOWN, { type: 'ocr-status' })) as ApiResult & { available?: boolean };
    expect(down).toMatchObject({ ok: false, offline: true, error: OFFLINE_MSG });
    expect(down.available).toBeUndefined();

    const unauthorized = (await send(() => ({ status: 401, json: { error: 'Invalid token' } }), {
      type: 'ocr-status',
    })) as ApiResult & { available?: boolean };
    expect(unauthorized).toMatchObject({ ok: false, error: AUTH_MSG });
    expect(unauthorized.available).toBeUndefined();

    // A reachable app that answered about its models is the one case that can.
    const answered = (await send(() => ({ status: 500, json: { error: 'Model dir unreadable' } }), {
      type: 'ocr-status',
    })) as ApiResult & { available?: boolean };
    expect(answered).toMatchObject({ ok: false, available: false, error: 'Model dir unreadable' });
  });
});

/* ===================== the two "app is running" probes ==================== */

describe('the health probe does not use apiFetch, and says so differently', () => {
  it('AUDIT: reports a second, shorter offline string for the same condition', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const health = (await h.send({ type: 'health' })) as ApiResult & { running?: boolean };
    // Still two strings for one situation: the popup header shows this one, the
    // toasts show apiFetch's. Neither is wrong; they are just not the same, and
    // this remains unfixed. What is new is `running`, which lets a caller tell
    // this apart from the reachable-but-refusing case below without parsing the
    // sentence — so the duplication no longer costs anyone a diagnosis.
    expect(health).toEqual({ ok: false, running: false, error: 'Gum is not running.' });
    expect(health.error).not.toBe(OFFLINE_MSG);
  });

  it('reports a 401 from a running app as running-but-unpaired', async () => {
    const h = bootBackground({ responder: () => ({ status: 401, json: { error: 'Invalid token' } }) });
    // Fixed 2026-08-02. The probe only looked at `res.ok`, so a paired-but-
    // rejected extension was told the app was closed — sending the user to
    // relaunch an app already in front of them instead of to the pairing screen.
    // status-summary (below) always got this right; now both agree.
    expect(await h.send({ type: 'health' })).toEqual({
      ok: false,
      running: true,
      paired: false,
      status: 401,
      error: AUTH_MSG,
    });
  });

  it('separates "answered badly" from both of the above', async () => {
    const h = bootBackground({ responder: () => ({ status: 500, json: {} }) });
    // A 500 is neither closed nor unpaired, so `paired` stays undetermined
    // rather than accusing a working pairing.
    const res = (await h.send({ type: 'health' })) as ApiResult & { running?: boolean; paired?: boolean };
    expect(res).toMatchObject({ ok: false, running: true, status: 500, error: 'Gum answered HTTP 500.' });
    expect(res.paired).toBeUndefined();
  });

  it('reports the app up and paired on a 200, for the same three fields', async () => {
    const h = bootBackground({ responder: () => ({ status: 200, json: { version: '1.2.3' } }) });
    expect(await h.send({ type: 'health' })).toEqual({
      ok: true,
      running: true,
      paired: true,
      data: { version: '1.2.3' },
    });
  });

  it('sends no bearer token on the health probe, since it bypasses apiFetch', async () => {
    const h = bootBackground({ responder: () => ({ status: 200, json: { version: '1.2.3' } }) });
    await h.send({ type: 'health' });
    expect(h.fetches[0].url).toBe('http://127.0.0.1:18765/v1/health');
    expect(h.fetches[0].headers).toBeUndefined();
  });
});

describe('status-summary — the one place a 401 is diagnosed correctly', () => {
  const summary = (responder: Responder): Promise<Record<string, unknown>> =>
    bootBackground({ responder }).send({ type: 'status-summary' }) as Promise<Record<string, unknown>>;

  it('reports the app up and the extension paired', async () => {
    const res = await summary((url) =>
      url.endsWith('/v1/health')
        ? { status: 200, json: { version: '1.2.3' } }
        : { status: 200, json: { profileName: 'Default', deckName: 'Mining' } },
    );
    expect(res).toMatchObject({
      ok: true,
      app: true,
      paired: true,
      version: '1.2.3',
      profileName: 'Default',
      deckName: 'Mining',
      pending: 0,
    });
  });

  it('reports app-up-but-unpaired on a 401, which is the actionable case', async () => {
    const res = await summary((url) =>
      url.endsWith('/v1/health') ? { status: 200, json: { version: '1.2.3' } } : { status: 401, json: {} },
    );
    expect(res).toMatchObject({ app: true, paired: false });
  });

  it('leaves paired unknown — not false — when the app errors for another reason', async () => {
    const res = await summary((url) =>
      url.endsWith('/v1/health')
        ? { status: 200, json: { version: '1.2.3' } }
        : { status: 500, json: { error: 'boom' } },
    );
    // `paired: undefined` is deliberately different from `false`: the popup
    // must not tell the user to re-pair over a transient server error.
    expect(res.app).toBe(true);
    expect(res.paired).toBeUndefined();
    expect('paired' in res).toBe(true);
  });

  it('never asks about pairing when the app is closed', async () => {
    const h = bootBackground({ responder: APP_DOWN });
    const res = (await h.send({ type: 'status-summary' })) as Record<string, unknown>;
    expect(res).toMatchObject({ ok: true, app: false, version: null, profileName: '', deckName: '' });
    expect(res.paired).toBeUndefined();
    expect(h.fetches.map((f) => new URL(f.url).pathname)).toEqual(['/v1/health']);
  });

  it('survives a health endpoint that answers 200 with an unreadable body', async () => {
    const res = await summary((url) =>
      url.endsWith('/v1/health') ? { status: 200 } : { status: 200, json: { profileName: 'P' } },
    );
    expect(res).toMatchObject({ app: true, version: null, profileName: 'P' });
  });
});
