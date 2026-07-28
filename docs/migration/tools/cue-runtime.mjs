// Runtime proof for patches/seanime/0001-video-core-cuechange.patch.
//
// Drives the PRODUCTION path: real seanime.exe -> directstream/play/localfile ->
// mkvparser -> websocket "subtitle-event" -> the exact MKVParser_SubtitleEvent
// objects VideoCoreSubtitleManager.onSubtitleEvents() receives.
//
// Answers, with live data:
//   Q1  are startTime/duration milliseconds or seconds?
//   Q3  does `text` carry raw ASS override tags?
// (Q2, timeupdate cadence, is measured separately in a real renderer.)

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const EXE = 'C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe';
const MKV = process.argv[2];
if (!MKV || !fs.existsSync(MKV)) throw new Error(`missing mkv: ${MKV}`);

// Expected cue starts (ms) authored into cue-probe.ass.
const EXPECTED_MS = [2000, 6500, 11000, 16000, 21000, 24000];

const reservePort = () =>
  new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => (p ? res(p) : rej(new Error('no port'))));
    });
  });

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seanime-cueprobe-'));
const password = crypto.randomBytes(24).toString('hex');
const token = crypto.createHash('sha256').update(password).digest('hex');
const port = await reservePort();
const base = `http://127.0.0.1:${port}`;
const clientId = crypto.randomUUID();

const child = spawn(
  EXE,
  [`--datadir=${dataDir}`, '--host=127.0.0.1', `--port=${port}`, `--password=${password}`],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const serverLog = [];
child.stdout.on('data', (d) => serverLog.push(String(d)));
child.stderr.on('data', (d) => serverLog.push(String(d)));

const api = (p, init = {}) =>
  fetch(`${base}${p}`, {
    ...init,
    headers: { 'X-Seanime-Token': token, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

const cleanup = () => {
  try {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {}
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
};

try {
  // --- wait ready ---
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    try {
      const r = await api('/api/v1/status');
      if (r.ok) {
        const b = await r.json();
        console.log(`server ready: v${b.data?.version} (simulated=${b.data?.user?.isSimulated})`);
        ready = true;
      }
    } catch {}
    if (!ready) await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error(`server never became healthy\n${serverLog.join('')}`);

  // --- websocket identity handshake ---
  // The server ISSUES {clientId, proof} in a `client-identity` message and expects the
  // client to RECONNECT with ?id=&proof=. Only then is the connection registered for
  // targeted (SendEventTo) delivery — which is how every nativeplayer event is sent.
  const identity = await new Promise((resolve, reject) => {
    const probe = new WebSocket(`ws://127.0.0.1:${port}/events?token=${token}`);
    const timer = setTimeout(() => reject(new Error('no client-identity within 15s')), 15_000);
    probe.addEventListener('message', (m) => {
      let env;
      try {
        env = JSON.parse(m.data);
      } catch {
        return;
      }
      if (env?.type === 'client-identity' && env.payload?.clientId) {
        clearTimeout(timer);
        const id = { clientId: env.payload.clientId, proof: env.payload.proof ?? '' };
        probe.close();
        resolve(id);
      }
    });
    probe.addEventListener('error', (e) => reject(new Error('identity probe ws error')));
  });
  console.log('identity issued:', identity.clientId, '| proof', identity.proof ? 'yes' : 'no');
  await new Promise((r) => setTimeout(r, 400));

  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/events?id=${identity.clientId}&proof=${encodeURIComponent(identity.proof)}&token=${token}`,
  );
  const events = [];
  const seenTypes = new Map();
  let streamUrl = null;
  let serverClientId = null;
  let wsOpen = false;
  ws.addEventListener('open', () => {
    wsOpen = true;
    console.log('websocket open');
  });
  let rawSeen = 0;
  ws.addEventListener('message', (m) => {
    if (rawSeen < 10) {
      rawSeen++;
      console.log(`RAW[${rawSeen}] ${String(m.data).slice(0, 160)}`);
    }
    let env;
    try {
      env = JSON.parse(m.data);
    } catch {
      return;
    }
    // The server ISSUES the client id; the ?id= query param does not win.
    // Player events are addressed to this one, so it must be used in the POST.
    if (env?.type === 'client-identity' && env.payload?.clientId) {
      serverClientId = env.payload.clientId;
    }
    const inner = env?.payload;
    const label = inner?.type ? `${env.type}/${inner.type}` : String(env?.type);
    seenTypes.set(label, (seenTypes.get(label) ?? 0) + 1);
    if (inner?.type === 'watch') {
      const u = inner.payload?.streamUrl;
      if (typeof u === 'string') streamUrl = u.replace('{{SERVER_URL}}', base);
    }
    if (!inner || inner.type !== 'subtitle-event') return;
    const p = inner.payload;
    const list = Array.isArray(p) ? p : Array.isArray(p?.events) ? p.events : [p];
    for (const e of list) if (e && typeof e.startTime === 'number') events.push(e);
  });
  const t0 = Date.now();
  while ((!wsOpen || !serverClientId) && Date.now() - t0 < 15_000)
    await new Promise((r) => setTimeout(r, 100));
  if (!wsOpen) throw new Error('websocket never opened');
  console.log('server-issued clientId:', serverClientId);

  // --- register the file as a LocalFile (directstream resolves by DB record, not by path) ---
  const LIB = path.dirname(MKV);
  const cur = (await (await api('/api/v1/settings')).json()).data ?? {};
  const patch = await api('/api/v1/settings', {
    method: 'PATCH',
    body: JSON.stringify({
      library: { ...(cur.library ?? {}), libraryPath: LIB },
      mediaPlayer: cur.mediaPlayer ?? {},
      torrent: cur.torrent ?? {},
      anilist: cur.anilist ?? {},
      discord: cur.discord ?? {},
      manga: cur.manga ?? {},
      notifications: cur.notifications ?? {},
      nakama: cur.nakama ?? {},
    }),
  });
  console.log('settings PATCH:', patch.status);

  const scan = await api('/api/v1/library/scan', {
    method: 'POST',
    body: JSON.stringify({
      enhanced: true,
      enhanceWithOfflineDatabase: false,
      skipLockedFiles: false,
      skipIgnoredFiles: false,
    }),
  });
  const scanBody = await scan.json();
  const lfs = scanBody.data ?? [];
  console.log(`scan: HTTP ${scan.status}, ${Array.isArray(lfs) ? lfs.length : '?'} local files registered`);
  if (Array.isArray(lfs)) {
    for (const lf of lfs.slice(0, 3)) console.log('   ', lf.path, '| mediaId', lf.mediaId);
  }
  if (scanBody.error) console.log('scan error:', scanBody.error);

  // The simulated collection is empty, so a matched mediaId is still "not in the
  // collection" until it is seeded (Phase-2 finding). directstream requires it.
  const mediaIds = [...new Set(lfs.map((lf) => lf.mediaId).filter((n) => n > 0))];
  if (mediaIds.length) {
    const seed = await api('/api/v1/library/unknown-media', {
      method: 'POST',
      body: JSON.stringify({ mediaIds }),
    });
    console.log(`seed collection ${JSON.stringify(mediaIds)}: HTTP ${seed.status}`);
    await new Promise((r) => setTimeout(r, 2500));
  }

  // --- start the stream ---
  const play = await api('/api/v1/directstream/play/localfile', {
    method: 'POST',
    // The ws is REGISTERED under the ?id= value we supplied ("Client connected id=…").
    // The `client-identity` message is the server PROPOSING an id for the next
    // connection — addressing events to it delivers them to nobody.
    body: JSON.stringify({ path: MKV, clientId: identity.clientId }),
  });
  const playText = await play.text();
  const playBody = playText ? JSON.parse(playText) : {};
  console.log(`play/localfile: HTTP ${play.status}, body ${playText.length} bytes`);
  if (!play.ok || playBody.error) {
    console.log('SERVER LOG TAIL:\n' + serverLog.join('').split('\n').slice(-45).join('\n'));
    throw new Error(`play/localfile failed: HTTP ${play.status} ${JSON.stringify(playBody).slice(0, 400)}`);
  }
  console.log('play/localfile accepted');
  const mc = playBody.data ?? playBody;
  const tracks = mc?.mediaInfo?.subtitles ?? mc?.streamUrl ? mc : mc;
  console.log('streamUrl:', typeof mc?.streamUrl === 'string' ? mc.streamUrl.slice(0, 90) : '(none)');

  // --- drive the demux ---
  // The parser only advances as a client consumes the stream, exactly as the
  // <video> element's range requests do. Without this, zero cues are emitted.
  for (let i = 0; i < 40 && !streamUrl; i++) await new Promise((r) => setTimeout(r, 250));
  console.log('streamUrl:', streamUrl ? streamUrl.slice(0, 110) : '(never arrived)');
  if (streamUrl) {
    const sres = await fetch(streamUrl, { headers: { 'X-Seanime-Token': token } });
    console.log(`stream GET: HTTP ${sres.status} ${sres.headers.get('content-type')}`);
    let got = 0;
    for await (const chunk of sres.body) {
      got += chunk.length;
      if (got > 12 * 1024 * 1024) break; // whole 11 MB clip
    }
    console.log(`consumed ${(got / 1024 / 1024).toFixed(1)} MB of the stream`);
  }

  // --- collect ---
  console.log('collecting subtitle events …');
  const until = Date.now() + 20_000;
  while (Date.now() < until && events.length < 200) await new Promise((r) => setTimeout(r, 250));
  console.log('ws message types seen:', JSON.stringify([...seenTypes.entries()]));

  console.log(`\n=== ${events.length} subtitle events received ===`);
  if (!events.length) {
    console.log('SERVER LOG TAIL:\n' + serverLog.join('').split('\n').slice(-40).join('\n'));
    throw new Error('no subtitle events arrived');
  }

  const uniq = new Map();
  for (const e of events) uniq.set(`${e.trackNumber}|${e.startTime}|${e.text}`, e);
  const sorted = [...uniq.values()].sort((a, b) => a.startTime - b.startTime);

  console.log('\nstartTime  duration   endTime   codecID       text');
  for (const e of sorted.slice(0, 12)) {
    console.log(
      `${String(e.startTime).padStart(9)} ${String(e.duration).padStart(9)} ` +
        `${String(e.startTime + e.duration).padStart(9)}   ${String(e.codecID).padEnd(12)} ${JSON.stringify(e.text)}`,
    );
  }

  // ---------- Q1: units ----------
  const starts = sorted.map((e) => e.startTime);
  console.log('\n--- Q1: are startTime/duration milliseconds? ---');
  console.log('observed starts:', JSON.stringify(starts.slice(0, 8)));
  console.log('authored  (ms) :', JSON.stringify(EXPECTED_MS));
  const msHits = EXPECTED_MS.filter((ms) => starts.some((s) => Math.abs(s - ms) <= 40)).length;
  const secHits = EXPECTED_MS.filter((ms) => starts.some((s) => Math.abs(s - ms / 1000) <= 0.05)).length;
  console.log(`matches as MILLISECONDS: ${msHits}/${EXPECTED_MS.length}`);
  console.log(`matches as SECONDS     : ${secHits}/${EXPECTED_MS.length}`);
  console.log(
    msHits > secHits
      ? '>>> VERDICT: MILLISECONDS. Patch assumption CORRECT (upstream doc comment "in seconds" is WRONG).'
      : '>>> VERDICT: SECONDS. Patch is WRONG and must divide by 1000.',
  );

  // ---------- Q3: override tags ----------
  console.log('\n--- Q3: does `text` carry raw ASS override tags? ---');
  const tagged = sorted.filter((e) => /\{\\/.test(e.text));
  console.log(`cues containing "{\\...}": ${tagged.length}/${sorted.length}`);
  for (const e of tagged.slice(0, 4)) console.log('   ', JSON.stringify(e.text));
  const commas = sorted.filter((e) => /^(?:[^,]*,){8}/.test(e.text));
  console.log(`cues that look like a full ASS Dialogue line (>=9 comma fields): ${commas.length}`);
} finally {
  cleanup();
  console.log('\nsidecar killed, temp datadir removed');
}
