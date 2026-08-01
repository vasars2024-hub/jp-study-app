/**
 * Slice 17, proven live: mine a lyric line in a running app.
 *
 * The unit tests prove the DATA path — a music cue through video's own draft/request/history
 * functions, surviving the JSON round trip Review performs. They cannot prove that the
 * button exists where intended, that the lyrics pane's mouse-up-to-lookup handler does not
 * swallow the click, or that the entry actually reaches localStorage in a real renderer.
 * This does.
 *
 * Safe beside the developer's app: its own `--user-data-dir` (which also side-steps
 * `requestSingleInstanceLock()`) and its own `--remote-debugging-port`. Needs the dev server
 * up. It never touches the real library — the seeded song lives in the scratch userData.
 *
 * ## What is deterministic here, and how
 *
 * - **The song** is written straight into `<userData>/media.json`, the file `media:list`
 *   reads, so no import dialog is involved. Its audio is a generated 20 s 440 Hz tone — a
 *   real playing file is needed for `ps.current` to be set, and see `writeToneWav` for why
 *   it is neither shorter nor silent.
 * - **The lyrics** are seeded into `jp-lyrics-<mediaId>` in localStorage, the cache
 *   `useLiveLyrics` consults before any network call. Without this the run would depend on
 *   lrclib being reachable and having this (invented) song.
 *
 * ## What this run does NOT prove
 *
 * Anki accepting the note. Anki is not assumed to be running, and the harness does not fake
 * it: `ankiMineNote` is called for real and the mine is expected to FAIL when Anki is
 * absent. That still exercises cue construction, the draft, the request, the history entry
 * and the localStorage write — everything this slice added. The entry's provenance is then
 * asserted, which is the thing Review reads. If Anki IS running the entry is `exported`
 * instead and the run asserts that shape instead; both are recorded.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const CDP_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 20_000;

const stamp = process.env.RUN_STAMP ?? 'local';
/** The record goes in the repo. */
const workRoot = path.join(REPO, 'docs/migration/proof', `music-mining-live-${stamp}`);
fs.mkdirSync(workRoot, { recursive: true });

/**
 * The Electron profile and the audio fixture do NOT go in the repo, and this is not tidiness.
 *
 * A `--user-data-dir` inside the repo is a Chromium profile inside the repo, and Vite's file
 * watcher then tries to watch `<profile>/Network/Cookies`, which Chromium holds locked. The
 * watcher throws `EBUSY` and **the dev server process dies** — taking down the app the
 * harness is trying to drive, and any other app using that server. This cost a developer's
 * running dev server before it was diagnosed, twice, and it looks nothing like its cause:
 * the harness simply reports that the renderer never became usable.
 *
 * (`retirement-step3-harness.mjs` was recorded here as having the same trap. It does not, and
 * never did — its `workRoot` is already `os.tmpdir()`. Corrected 2026-08-01.)
 */
const scratchRoot = process.env.HARNESS_SCRATCH
  ?? path.join(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp', `jp-music-harness-${stamp}`);
fs.mkdirSync(scratchRoot, { recursive: true });

const logLines = [];
const log = (msg) => {
  const line = `[music-mining] ${msg}`;
  logLines.push(line);
  console.log(line);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function electronBinary() {
  const local = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(local)) return local;
  const which = spawnSync('where', ['electron'], { encoding: 'utf8' });
  const first = which.stdout?.split(/\r?\n/).find(Boolean);
  if (first) return first;
  throw new Error('electron binary not found');
}

/**
 * 20 s of a 440 Hz tone.
 *
 * Both properties matter. **Length**: the seeded cue runs 1.5 s–2.5 s, so a shorter file
 * would put the recorder past the end of the track and it would capture nothing — the first
 * version of this was 0.4 s of silence and produced a 275-byte opus container that still
 * satisfied a naive `bytes > 0` check. **Tone rather than silence**: opus compresses silence
 * to almost nothing, so silence cannot distinguish "recorded the cue" from "recorded an
 * empty stream". A tone makes the byte count evidence.
 *
 * **Was 4 s until slice 20.** The transport phases below have to park the playhead inside
 * the last cue (starts at 2.5 s), sample the position twice to establish whether playback
 * is advancing, pause, and only then measure — which takes several seconds of wall clock.
 * On a 4 s file the track simply ended in the middle of that, and a run-off-the-end reads
 * exactly like "the transport did not move the playhead". The cue timings are unchanged, so
 * phases G–J still assert the same numbers.
 */
function writeToneWav(target) {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * 20);
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
    buf.writeInt16LE(value, 44 + i * 2);
  }
  fs.writeFileSync(target, buf);
  return target;
}

async function findPageTarget(port, deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      // Scheme-agnostic on purpose: a packaged build serves app://, dev serves http://.
      // Match the shape that identifies the main window — a page with no query string.
      //
      // The scheme test is NOT cosmetic. Without it this matched an early `about:blank`
      // page target that Electron exposes before the window navigates, and every
      // `localStorage` read then failed with "Access is denied for this document" — a
      // confusing error that looks like a permissions problem and is really an
      // attached-to-the-wrong-document problem.
      const page = targets.find((t) => t.type === 'page'
        && /^(https?|app):\/\//.test(t.url)
        && !t.url.includes('?'));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Not listening yet.
    }
    await sleep(400);
  }
  throw new Error('no CDP page target appeared');
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }

  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(String(event.data)); } catch { return; }
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 30_000);
    });
  }

  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }

  mouse(type, x, y, extra = {}) {
    return this.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', clickCount: 1, ...extra,
    });
  }

  async click(x, y) {
    await this.mouse('mouseMoved', x, y, { button: 'none', clickCount: 0 });
    await this.mouse('mousePressed', x, y);
    await this.mouse('mouseReleased', x, y);
  }
}

async function waitFor(cdp, expression, label, timeoutMs = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await cdp.evaluate(expression);
    if (last) return last;
    await sleep(300);
  }
  throw new Error(`${label} (last value: ${JSON.stringify(last)})`);
}

const SONG_ID = 'harness-song-1';
const LRC = [
  '[00:00.50]春よ 遠き春よ',
  '[00:01.50]瞼閉じればそこに',
  '[00:02.50]君を待つ',
].join('\n');

const results = { phases: [], startedAt: new Date().toISOString() };
function record(name, ok, detail) {
  results.phases.push({ name, result: ok ? 'PASS' : 'FAIL', detail });
  log(`${ok ? 'PASS' : 'FAIL'} — ${name}: ${detail}`);
  if (!ok) throw new Error(`${name} FAILED: ${detail}`);
}

let electron = null;

async function main() {
  const userDataDir = path.join(scratchRoot, 'userdata');
  fs.mkdirSync(userDataDir, { recursive: true });
  const audioPath = writeToneWav(path.join(scratchRoot, 'harness-song.wav'));

  // Phase A — seed the library file `media:list` reads. No import dialog involved.
  fs.writeFileSync(path.join(userDataDir, 'media.json'), JSON.stringify({
    items: [{
      id: SONG_ID,
      title: 'Harness Song',
      path: audioPath,
      fileName: 'harness-song.wav',
      addedAt: Date.now(),
      kind: 'audio',
    }],
    relationships: [],
  }, null, 2));
  record('A seed library', true, `media.json written with ${SONG_ID}`);

  const cdpPort = await freePort();
  const env = { ...process.env };
  delete env.SEANIME_SIDECAR;
  delete env.SEANIME_EXE;
  delete env.SEANIME_DATADIR;
  electron = spawn(
    electronBinary(),
    ['.', `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  // Drain both pipes so a chatty child never blocks on a full buffer. `resume()` rather
  // than an empty listener, which the repo lint rejects.
  electron.stdout.resume();
  electron.stderr.resume();

  const target = await findPageTarget(cdpPort, Date.now() + CDP_TIMEOUT_MS);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  // Attaching is not the same as the app having booted. Wait for the React tree AND for
  // localStorage to be reachable, so a later phase's failure means what it says.
  await waitFor(
    cdp,
    "(() => { try { void localStorage.length; } catch { return 0; } "
    + "return document.querySelector('#root, .os-root, body > div') ? 1 : 0; })()",
    'phase B — the renderer never became usable',
    CDP_TIMEOUT_MS,
  );
  record('B attach', true, `electron pid ${electron.pid}, CDP attached to ${target.url}`);

  // Phase C — seed the lyrics cache useLiveLyrics reads before any network call.
  await cdp.evaluate(`(localStorage.setItem(${JSON.stringify(`jp-lyrics-${SONG_ID}`)}, ${
    JSON.stringify(JSON.stringify({ lrc: LRC }))
  }), localStorage.removeItem('jp-video-core-mining-history-v1'), 1)`);
  record('C seed lyrics', true, `${LRC.split('\n').length} synced cues cached, mining history cleared`);

  // Phase D0/D — open Music.
  //
  // Both halves are RETRIED together rather than done once, because a cold profile boots
  // slowly (the app seeds dictionaries on first run) and the two events race: the
  // anonymous-country consent dialog mounts some time after the first paint, and an
  // `os:open` dispatched before the desktop is listening is simply lost. A single-shot
  // version of this passed on a warm profile and failed on every cold one — which is the
  // worst kind of harness, since it works when you write it and not when you need it.
  let consentSeen = 'none';
  let musicOpen = false;
  const openDeadline = Date.now() + CDP_TIMEOUT_MS;
  while (Date.now() < openDeadline && !musicOpen) {
    const dismissed = await cdp.evaluate(
      `(() => {
         const no = [...document.querySelectorAll('button')]
           .find(b => /no thanks|not now|decline/i.test(b.textContent ?? ''));
         if (!no) return '';
         no.click();
         return no.textContent.trim();
       })()`,
    );
    if (dismissed) consentSeen = dismissed;
    await cdp.evaluate("(window.dispatchEvent(new CustomEvent('os:open',{detail:'music'})),1)");
    await sleep(1500);
    musicOpen = await cdp.evaluate("!!document.querySelector('.music-lyrics')");
  }
  record('D0 first-run consent', true, `consent dialog: ${consentSeen || 'never appeared'}`);
  if (!musicOpen) record('D open music', false, 'the music app never opened');
  // `.music-row.music-song` is the real row class; the title rendered is derived from the
  // FILE NAME by guessSongMeta, not from MediaItem.title, so match on that.
  const played = await waitFor(
    cdp,
    `(() => {
       const row = document.querySelector('.music-row.music-song');
       if (!row) return 0;
       row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
       row.click();
       return 1;
     })()`,
    'phase D — no song row to start',
  );
  record('D open and play', !!played, 'music app open, song row activated');
  await waitFor(cdp, "!!document.querySelector('.music-line')", 'phase D — playback never started, so no lyric lines rendered');

  // Phase E — the lyric lines and their Mine buttons actually render.
  const lines = await waitFor(
    cdp, "document.querySelectorAll('.music-line').length", 'phase E — no lyric lines rendered',
  );
  const buttons = await cdp.evaluate("document.querySelectorAll('.music-line-mine').length");
  record('E lyrics render', lines >= 3 && buttons === lines,
    `${lines} lyric lines, ${buttons} mine buttons`);

  // Phase F — the button is hidden until hover, and revealed by focus. This is the
  // accessibility trap in hover-reveal patterns, so it is asserted rather than assumed.
  const hidden = await cdp.evaluate(
    "getComputedStyle(document.querySelector('.music-line-mine')).opacity",
  );
  // The reveal is a 150 ms opacity transition, so reading getComputedStyle in the SAME task
  // as focus() returns the value mid-transition — which is 0, and looks exactly like a CSS
  // bug. It cost a real detour: the first version of this phase reported a failure, the
  // rules were dumped from the page and were correct, `:focus` matched, and the element was
  // `document.activeElement`. The instrument was wrong, not the stylesheet.
  const focusRevealed = await cdp.evaluate(
    `(async () => {
       const b = document.querySelector('.music-line-mine');
       b.focus();
       await new Promise((r) => setTimeout(r, 400));
       return getComputedStyle(b).opacity;
     })()`,
  );
  record('F hover-reveal', Number(hidden) === 0 && Number(focusRevealed) === 1,
    `resting opacity ${hidden}, focused opacity ${focusRevealed}`);

  // Phase G — mine the second line, through a real click, and prove the lyrics pane's
  // mouse-up-to-lookup handler did not swallow it or open the dictionary over the card.
  const clicked = await cdp.evaluate(
    `(() => {
       const btn = document.querySelectorAll('.music-line-mine')[1];
       if (!btn) return 0;
       btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
       btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
       btn.click();
       return 1;
     })()`,
  );
  if (!clicked) record('G mine', false, 'no mine button at index 1');

  const entry = await waitFor(
    cdp,
    `(() => {
       const raw = localStorage.getItem('jp-video-core-mining-history-v1');
       if (!raw) return null;
       const list = JSON.parse(raw);
       return list.length ? list[list.length - 1] : null;
     })()`,
    'phase G — nothing was written to the mining history',
    // Slice 18: the mine now RECORDS the line first, in real time, before calling Anki.
    // The default step timeout is comfortably longer than a lyric line, but be explicit.
    STEP_TIMEOUT_MS + 15_000,
  );
  record('G mine writes history', !!entry,
    `status=${entry.status} term=${JSON.stringify(entry.term)}`);

  // Phase H — the provenance Review will read. This is the whole point of the slice.
  const src = entry.provenance?.source ?? {};
  const cue = entry.provenance?.cue ?? {};
  const provenanceOk = src.playbackType === 'music'
    && src.streamType === 'music-lrc'
    && src.playbackId === audioPath
    && cue.startMs === 1500
    && cue.endMs === 2500
    && cue.text === '瞼閉じればそこに';
  record('H provenance', provenanceOk,
    `playbackType=${src.playbackType} streamType=${src.streamType} `
    + `cue=[${cue.startMs},${cue.endMs}] text=${JSON.stringify(cue.text)}`);

  // Phase H2 — slice 18: a SYNCED line records its own audio and attaches it. The seeded
  // cue is 1.0 s long, comfortably inside recordCueAudio's 100 ms..30 s window. An empty
  // `assets` here means the capture silently did nothing, which is the failure mode worth
  // catching: the mine still succeeds without audio by design, so nothing else would notice.
  const audioAsset = entry.provenance?.assets?.audio ?? null;
  // > 2 KB, not > 0. A 0.4 s silent fixture produced a valid-looking 275-byte opus
  // container that passed `bytes > 0` while having recorded nothing; recording this 1 s cue
  // out of the tone yields ~16.7 KB (measured 2026-08-01). The threshold is what makes this
  // assertion mean "captured the cue".
  //
  // The byte count is set by the CUE's length and by the fixture being a tone rather than
  // silence — not by how long the file is. Lengthening the tone to 20 s for the transport
  // phases therefore left this number where it was, which is why it is quoted against the
  // cue and not against the track.
  record('H2 audio attached', !!audioAsset && audioAsset.bytes > 2000,
    audioAsset
      ? `${audioAsset.filename} ${audioAsset.mimeType} ${audioAsset.bytes} bytes`
      : 'no audio asset on the mined entry');

  // Phase I — the dictionary popup must NOT have opened over the new card.
  const popupOpen = await cdp.evaluate(
    "!!document.querySelector('.music-lookup-popup, .dict-popup, [data-dict-popup]')",
  );
  record('I no dictionary popup', !popupOpen,
    popupOpen ? 'a lookup popup opened on the mine click' : 'lyrics-pane lookup did not fire');

  // Phase J — the button reports the outcome rather than silently doing nothing.
  const label = await cdp.evaluate(
    "document.querySelectorAll('.music-line-mine')[1]?.textContent?.trim() ?? ''",
  );
  record('J outcome shown', label.length > 0, `button label after mining: ${JSON.stringify(label)}`);

  // ---- Phases K–M: the cue transport, pressed in the running window (slice 20) --------
  //
  // Slice 20 proved the transport as pure functions and its wiring by source guard. What
  // no test can reach is whether a CLICK on those three buttons moves the playhead and the
  // active-line highlight in a real window.
  //
  // ## Where the position is read from, and why it is not `audio.currentTime`
  //
  // `playerBus` builds its element with `document.createElement('audio')` and never appends
  // it, so there is no `<audio>` in the DOM for CDP to reach and no element to hang a
  // `seeked` listener on — the trick `retirement-step3-harness.mjs` uses for video does not
  // port. The readings below come from `.music-seek` (the range input whose `value` is
  // `ps.time`, on a 0.1 s step grid) and from which `.music-line` carries `.active`.
  //
  // That is not a weaker instrument, it is a longer one: a click reaches those readouts only
  // via `player.seek` -> `audio.currentTime` -> `timeupdate` -> `state.time` -> React. A
  // wrong seek target, a seek that never happened, and a highlight that failed to follow are
  // all separately visible in it.
  //
  // ## Playback is PAUSED before every measurement
  //
  // The tone plays in real time, so an unpaused reading is the seek target plus whatever
  // has played since — the mistake `retirement-step3-harness.mjs` records making against
  // video, where it read 2.96 against a real cue start of 2.15 and concluded the control was
  // broken. `pausePlayback` samples the position twice and only claims to have paused after
  // confirming it stopped advancing, so a failure to pause cannot be mistaken for a failure
  // to seek.
  const CUE_STARTS = [0.5, 1.5, 2.5];
  const NEAR = 0.15;
  const near = (a, b) => a != null && Math.abs(a - b) <= NEAR;

  const readTransport = () => cdp.evaluate(`(() => {
    const lines = [...document.querySelectorAll('.music-line')];
    const seek = document.querySelector('.music-seek');
    return {
      activeIndex: lines.findIndex((l) => l.classList.contains('active')),
      lineCount: lines.length,
      seekValue: seek ? Number(seek.value) : null,
      seekMax: seek ? Number(seek.max) : null,
      timeText: (document.querySelector('.music-time')?.textContent ?? '').trim(),
      navButtons: document.querySelectorAll('.music-cue-nav button').length,
    };
  })()`);

  /** Two samples, not one: "is it moving" is the only reliable read of playing-ness here. */
  const isAdvancing = async () => {
    const a = await readTransport();
    await sleep(700);
    const b = await readTransport();
    return b.seekValue != null && a.seekValue != null && b.seekValue > a.seekValue + 0.05;
  };
  const pausePlayback = async () => {
    if (!(await isAdvancing())) return 'already paused';
    await cdp.evaluate("(document.querySelector('.music-play')?.click(),1)");
    await sleep(400);
    return (await isAdvancing()) ? 'STILL ADVANCING' : 'paused';
  };
  const clickNav = async (slot) => {
    // prev = 0, replay = 1, next = 2 — the order they are rendered in.
    const ok = await cdp.evaluate(
      `(() => { const b = document.querySelectorAll('.music-cue-nav button')[${slot}];`
      + ' if (!b || b.disabled) return 0; b.click(); return 1; })()',
    );
    await sleep(500);
    return !!ok;
  };

  const transport = { cueStarts: CUE_STARTS, tolerance: NEAR, readings: {} };

  const navCount = (await readTransport()).navButtons;
  record('K0 transport rendered', navCount === 3,
    `${navCount} cue-nav buttons (expect prev/replay/next)`);

  // Park inside the LAST cue by double-clicking its line — an existing handler
  // (`player.seek(c.start)`), not a synthetic seek — then let it drift off the exact start
  // so a later replay has somewhere to come back from.
  await cdp.evaluate(`(() => {
    const lines = [...document.querySelectorAll('.music-line')];
    lines[2]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return 1;
  })()`);
  await sleep(900);
  transport.pauseState = await pausePlayback();
  const beforePrev = await readTransport();
  transport.readings.beforePrev = beforePrev;

  // Phase K — PREVIOUS LINE: from inside cue 2, the playhead must land on cue 1's start.
  const prevClicked = await clickNav(0);
  const afterPrev = await readTransport();
  transport.readings.afterPrev = afterPrev;
  record('K previous line', Boolean(
    prevClicked && beforePrev.activeIndex === 2
    && afterPrev.activeIndex === 1 && near(afterPrev.seekValue, CUE_STARTS[1]),
  ), `cue ${beforePrev.activeIndex} @ ${beforePrev.seekValue}s -> cue ${afterPrev.activeIndex} `
    + `@ ${afterPrev.seekValue}s (expect cue 1 @ ${CUE_STARTS[1]}s)`);

  // Phase L — NEXT LINE: back to cue 2's start. Paused, so nothing drifts in between.
  const beforeNext = await readTransport();
  transport.readings.beforeNext = beforeNext;
  const nextClicked = await clickNav(2);
  const afterNext = await readTransport();
  transport.readings.afterNext = afterNext;
  record('L next line', Boolean(
    nextClicked && beforeNext.activeIndex === 1
    && afterNext.activeIndex === 2 && near(afterNext.seekValue, CUE_STARTS[2]),
  ), `cue ${beforeNext.activeIndex} @ ${beforeNext.seekValue}s -> cue ${afterNext.activeIndex} `
    + `@ ${afterNext.seekValue}s (expect cue 2 @ ${CUE_STARTS[2]}s)`);

  // Phase M — REPLAY LINE: the one action stepping cannot express. Resume briefly so the
  // playhead is strictly INSIDE cue 2 rather than on its start, or "went back to the start"
  // and "did nothing at all" would produce the same reading.
  await cdp.evaluate("(document.querySelector('.music-play')?.click(),1)");
  await sleep(1100);
  transport.pauseStateBeforeReplay = await pausePlayback();
  const beforeReplay = await readTransport();
  transport.readings.beforeReplay = beforeReplay;
  const driftedIntoCue = beforeReplay.seekValue > CUE_STARTS[2] + NEAR;
  const replayClicked = await clickNav(1);
  const afterReplay = await readTransport();
  transport.readings.afterReplay = afterReplay;
  record('M replay line', Boolean(
    replayClicked && driftedIntoCue && beforeReplay.activeIndex === 2
    && afterReplay.activeIndex === 2 && near(afterReplay.seekValue, CUE_STARTS[2]),
  ), `cue ${beforeReplay.activeIndex} @ ${beforeReplay.seekValue}s -> `
    + `@ ${afterReplay.seekValue}s (expect a jump BACK to ${CUE_STARTS[2]}s; `
    + `drifted-off-start=${driftedIntoCue})`);

  // ---- Phases N–Q: the three answers K–M cannot give ---------------------------------
  //
  // K–M press each button once from inside a cue, which is the ordinary case. What is left
  // is the boundary behaviour and the assumption the presses themselves rest on. None of
  // these repeats a reading K–M already took; where one would (the seek reaching the audio
  // ELEMENT rather than only `state.time`), phase M already discriminates it — its
  // `driftedIntoCue` resumes playback for 1.1 s and requires the clock to come back past
  // 2.65 s, which only happens if `audio.currentTime` really went to 2.5.

  /** Additive, not a second `readTransport`: the disabled bit is the subject of phase Q. */
  const replayDisabled = () => cdp.evaluate(
    "!!document.querySelector('.music-cue-replay')?.disabled",
  );

  /**
   * Move the playhead with the seek slider — a different, already-shipped call site into
   * `player.seek`. Used only to SET UP a position the transport is then asked about.
   *
   * React tracks a controlled input's value on the DOM node itself, so assigning
   * `el.value` is swallowed as a no-op change and `onChange` never fires. Going through the
   * prototype's setter is what makes React see it.
   */
  const dragSeekTo = async (seconds) => {
    await cdp.evaluate(
      `(() => {
         const el = document.querySelector('.music-seek');
         if (!el) return 0;
         const setter = Object.getOwnPropertyDescriptor(
           window.HTMLInputElement.prototype, 'value',
         ).set;
         setter.call(el, ${JSON.stringify(String(seconds))});
         el.dispatchEvent(new Event('input', { bubbles: true }));
         return 1;
       })()`,
    );
    await sleep(500);
  };

  // Phase N — the slot order K–M press is the order it means to press.
  //
  // `clickNav` addresses the buttons as `[0]`, `[1]`, `[2]`. That is an assumption about
  // render order, and a reordering (RTL, or next-before-prev) would leave every phase above
  // passing while pressing the wrong control — the reading would simply be a different cue
  // and the tolerance is 0.15 s, not a cue apart. The buttons carry `music-cue-prev` /
  // `-replay` / `-next` classes for exactly this check, and `musicMining.test.ts` fails if
  // the pane stops naming them.
  const slots = await cdp.evaluate(
    `(() => {
       const row = [...document.querySelectorAll('.music-cue-nav button')];
       return {
         order: row.map((b) => b.className.trim()),
         prev: document.querySelectorAll('.music-cue-prev').length,
         replay: document.querySelectorAll('.music-cue-replay').length,
         next: document.querySelectorAll('.music-cue-next').length,
       };
     })()`,
  );
  transport.slots = slots;
  record('N slot order is the named order', Boolean(
    slots.prev === 1 && slots.replay === 1 && slots.next === 1
    && slots.order[0] === 'music-cue-prev'
    && slots.order[1] === 'music-cue-replay'
    && slots.order[2] === 'music-cue-next',
  ), `rendered order ${JSON.stringify(slots.order)}`);

  // Phase O — previous-line clamps at the first line instead of seeking off the sheet.
  // Three presses from cue 2: 1.5, 0.5, and then nowhere. The third reading is the
  // assertion; the first two are there so a failure says which press went wrong.
  const backTrail = [];
  for (let i = 0; i < 3; i += 1) {
    await clickNav(0);
    const seen = await readTransport();
    backTrail.push({ at: seen.seekValue, active: seen.activeIndex });
  }
  transport.readings.backTrail = backTrail;
  record('O prev clamps at the first line', Boolean(
    near(backTrail[0].at, CUE_STARTS[1]) && backTrail[0].active === 1
    && near(backTrail[1].at, CUE_STARTS[0]) && backTrail[1].active === 0
    && near(backTrail[2].at, CUE_STARTS[0]) && backTrail[2].active === 0,
  ), backTrail.map((r, i) => `press${i + 1}=${r.at}s/cue${r.active}`).join(' '));

  // Phase P — and next-line clamps at the last, symmetrically.
  const forwardTrail = [];
  for (let i = 0; i < 3; i += 1) {
    await clickNav(2);
    const seen = await readTransport();
    forwardTrail.push({ at: seen.seekValue, active: seen.activeIndex });
  }
  transport.readings.forwardTrail = forwardTrail;
  record('P next clamps at the last line', Boolean(
    near(forwardTrail[0].at, CUE_STARTS[1]) && forwardTrail[0].active === 1
    && near(forwardTrail[1].at, CUE_STARTS[2]) && forwardTrail[1].active === 2
    && near(forwardTrail[2].at, CUE_STARTS[2]) && forwardTrail[2].active === 2,
  ), forwardTrail.map((r, i) => `press${i + 1}=${r.at}s/cue${r.active}`).join(' '));

  // Phase Q — before the first line there is no line to replay, and the button SAYS so
  // (`disabled={activeIndex < 0}`) rather than silently doing nothing. `clickNav` reports
  // false for a disabled button, so the refusal is observed rather than inferred.
  //
  // Previous-line from there seeks FORWARD, onto cue 0. That is `adjacentStudyCue`'s clamp
  // — the video overlay's own rule, which slice 20 reused deliberately instead of
  // re-deriving — and it is recorded here as observed behaviour, not asserted as desirable.
  await dragSeekTo(0);
  const beforeFirst = await readTransport();
  const replayRefused = !(await clickNav(1));
  const replayWasDisabled = await replayDisabled();
  await clickNav(0);
  const fromNowhere = await readTransport();
  transport.readings.beforeFirstLine = beforeFirst;
  transport.readings.prevFromBeforeFirstLine = fromNowhere;
  record('Q replay is disabled when no line is active', Boolean(
    beforeFirst.activeIndex === -1 && replayWasDisabled && replayRefused
    && near(fromNowhere.seekValue, CUE_STARTS[0])
    && fromNowhere.activeIndex === 0,
  ), `at ${beforeFirst.seekValue}s active=${beforeFirst.activeIndex} `
    + `replayDisabled=${replayWasDisabled} clickRefused=${replayRefused}; `
    + `prev from there landed at ${fromNowhere.seekValue}s (cue ${fromNowhere.activeIndex})`);

  // Phase R — none of those clicks opened the dictionary. Phase I asks this of the Mine
  // button, which stops propagation explicitly; the transport buttons do NOT, and they sit
  // inside the same `.music-lyrics` element whose mouse-up is a lookup. Different code,
  // different answer, so it is asked again after the transport rather than assumed from I.
  const popupAfterTransport = await cdp.evaluate(
    "!!document.querySelector('.music-lookup-popup, .dict-popup, [data-dict-popup]')",
  );
  record('R transport clicks opened no dictionary popup', !popupAfterTransport,
    popupAfterTransport
      ? 'a lookup popup opened while pressing the transport'
      : 'no lookup popup after the full transport sweep');

  // ---- Phase S: the KEYBOARD, which slice 20 deliberately did not build ---------------
  //
  // Every phase above CLICKS. Slice 20 shipped the transport as buttons only and wrote down
  // why it stopped there: `registerCommandHandler` keeps a stack per id and the last
  // registrant wins, so reusing `video.replayLine`/`prevLine`/`nextLine` here would hand one
  // of the two surfaces both gestures according to mount order — and `MediaWorkspaceHost`
  // mounts at App level, so the lyrics pane and the video overlay really can be mounted at
  // once. Slices 20-30 each re-recorded "music keyboard nav needs its OWN music.* rows, a
  // decision to take deliberately". Slice 31 took it; this is the phase that presses them.
  //
  // The three rows ship `defaultKeys: ''`, so this is a BIND-then-press, driven through the
  // real Settings → Shortcuts capture UI — the same route `retirement-step3-harness.mjs`
  // phase I uses for the five unbound `video.*` rows.
  const MUSIC_BIND = [
    { id: 'music.prevLine', chord: 'Ctrl+Alt+6', key: '6', code: 'Digit6', vk: 54, slot: 'prev' },
    { id: 'music.replayLine', chord: 'Ctrl+Alt+7', key: '7', code: 'Digit7', vk: 55, slot: 'replay' },
    { id: 'music.nextLine', chord: 'Ctrl+Alt+8', key: '8', code: 'Digit8', vk: 56, slot: 'next' },
  ];
  /** Same family, same dispatch, bound to nothing — the control. */
  const MUSIC_CONTROL = { chord: 'Ctrl+Alt+9', key: '9', code: 'Digit9', vk: 57 };
  const CTRL_ALT = 1 | 2;   // CDP modifier bits: Alt=1, Ctrl=2.

  const sendChord = async (spec) => {
    // A typing target suppresses chords by design (`isTypingTarget`), and the settings
    // search box is one — a stray focus would read as "the binding does not fire".
    await cdp.evaluate(
      "(() => { const el = document.activeElement;"
      + " if (el && el !== document.body) el.blur?.(); return 1; })()",
    );
    // No `text`: with Ctrl held the key produces no character.
    const common = {
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.vk,
      nativeVirtualKeyCode: spec.vk,
      modifiers: CTRL_ALT,
    };
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...common });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    await sleep(600);
  };
  const readShortcutRow = (id) => cdp.evaluate(`(() => {
    const el = document.querySelector('[data-shortcut-id="${id}"]');
    if (!el) return null;
    return {
      keys: el.getAttribute('data-shortcut-keys') ?? '',
      conflict: !!el.querySelector('.sc-conflict'),
    };
  })()`);

  const keyboard = { bind: [], press: {} };

  await cdp.evaluate("(window.dispatchEvent(new CustomEvent('os:open',{detail:'settings'})),1)");
  await waitFor(cdp, "!!document.querySelector('.os-set-nav-v2')",
    'phase S — the settings window never mounted', CDP_TIMEOUT_MS);
  await cdp.evaluate(
    "(window.dispatchEvent(new CustomEvent('settings:navigate',{detail:{page:'shortcuts'}})),1)",
  );
  await waitFor(cdp, '!!document.querySelector(\'[data-shortcut-id="music.prevLine"]\')',
    'phase S — Settings → Shortcuts never rendered the Music cue rows', CDP_TIMEOUT_MS);

  for (const row of MUSIC_BIND) {
    const before = await readShortcutRow(row.id);
    // Rows are addressed by `data-shortcut-id`, never by their label: every string on that
    // surface goes through `useT()` and this app ships four UI languages.
    const started = await cdp.evaluate(`(() => {
      const b = document.querySelector('[data-shortcut-capture="${row.id}"]');
      if (!b) return 0; b.click(); return 1;
    })()`);
    // Nothing may be clicked between here and the key: the capture effect also installs
    // mousedown/auxclick/contextmenu listeners, and a click would become the binding.
    await sleep(300);
    await sendChord(row);
    let after = null;
    for (let i = 0; i < 20; i += 1) {
      await sleep(200);
      after = await readShortcutRow(row.id);
      if (after?.keys === row.chord) break;
    }
    keyboard.bind.push({
      id: row.id, keysBefore: before?.keys ?? null, keysAfter: after?.keys ?? null,
      conflict: after?.conflict ?? null, chord: row.chord, started: !!started,
    });
    record(`S1 bind ${row.id}`, Boolean(
      started && before?.keys === '' && after?.keys === row.chord && after?.conflict === false,
    ), `${JSON.stringify(before)} -> ${JSON.stringify(after)} via the capture button`);
  }

  // Back to music. The settings window stays open behind it — closing every window would
  // close Music too, and the lyrics pane must stay MOUNTED or there is no registrant for
  // these ids and the phase would be measuring the wrong absence.
  await cdp.evaluate("(window.dispatchEvent(new CustomEvent('os:open',{detail:'music'})),1)");
  await waitFor(cdp, "!!document.querySelector('.music-lyrics')",
    'phase S — music never came back to the front', CDP_TIMEOUT_MS);

  // Park inside cue 2 the way phases K–M do — an existing handler, not a synthetic seek.
  await cdp.evaluate(`(() => {
    const lines = [...document.querySelectorAll('.music-line')];
    lines[2]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return 1;
  })()`);
  await sleep(900);
  keyboard.pauseState = await pausePlayback();

  const beforeKeyPrev = await readTransport();
  await sendChord(MUSIC_BIND[0]);
  const afterKeyPrev = await readTransport();
  keyboard.press.prev = { before: beforeKeyPrev, after: afterKeyPrev };
  record('S2 previous line by key', Boolean(
    beforeKeyPrev.activeIndex === 2 && afterKeyPrev.activeIndex === 1
    && near(afterKeyPrev.seekValue, CUE_STARTS[1]),
  ), `Ctrl+Alt+6: cue ${beforeKeyPrev.activeIndex} @ ${beforeKeyPrev.seekValue}s -> `
    + `cue ${afterKeyPrev.activeIndex} @ ${afterKeyPrev.seekValue}s (expect cue 1 @ ${CUE_STARTS[1]}s)`);

  const beforeKeyNext = await readTransport();
  await sendChord(MUSIC_BIND[2]);
  const afterKeyNext = await readTransport();
  keyboard.press.next = { before: beforeKeyNext, after: afterKeyNext };
  record('S3 next line by key', Boolean(
    beforeKeyNext.activeIndex === 1 && afterKeyNext.activeIndex === 2
    && near(afterKeyNext.seekValue, CUE_STARTS[2]),
  ), `Ctrl+Alt+8: cue ${beforeKeyNext.activeIndex} @ ${beforeKeyNext.seekValue}s -> `
    + `cue ${afterKeyNext.activeIndex} @ ${afterKeyNext.seekValue}s (expect cue 2 @ ${CUE_STARTS[2]}s)`);

  // Replay needs the playhead strictly INSIDE cue 2 rather than on its start, or "went back
  // to the start" and "did nothing at all" read identically — phase M's own reasoning.
  await cdp.evaluate("(document.querySelector('.music-play')?.click(),1)");
  await sleep(1100);
  keyboard.pauseStateBeforeReplay = await pausePlayback();
  const beforeKeyReplay = await readTransport();
  const keyDrifted = beforeKeyReplay.seekValue > CUE_STARTS[2] + NEAR;
  await sendChord(MUSIC_BIND[1]);
  const afterKeyReplay = await readTransport();
  keyboard.press.replay = { before: beforeKeyReplay, after: afterKeyReplay, drifted: keyDrifted };
  record('S4 replay line by key', Boolean(
    keyDrifted && beforeKeyReplay.activeIndex === 2 && afterKeyReplay.activeIndex === 2
    && near(afterKeyReplay.seekValue, CUE_STARTS[2]),
  ), `Ctrl+Alt+7: @ ${beforeKeyReplay.seekValue}s -> @ ${afterKeyReplay.seekValue}s `
    + `(expect a jump BACK to ${CUE_STARTS[2]}s; drifted-off-start=${keyDrifted})`);

  // The control. Without it, three moving readings would prove only that SOMETHING seeks
  // while Ctrl+Alt+<digit> is pressed — an auto-advance would satisfy all three.
  const beforeControl = await readTransport();
  await sendChord(MUSIC_CONTROL);
  const afterControl = await readTransport();
  keyboard.press.control = { chord: MUSIC_CONTROL.chord, before: beforeControl, after: afterControl };
  record('S5 an unbound chord of the same family does nothing', Boolean(
    beforeControl.activeIndex === afterControl.activeIndex
    && near(afterControl.seekValue, beforeControl.seekValue),
  ), `${MUSIC_CONTROL.chord}: cue ${beforeControl.activeIndex} @ ${beforeControl.seekValue}s -> `
    + `cue ${afterControl.activeIndex} @ ${afterControl.seekValue}s (expect unchanged)`);

  transport.keyboard = keyboard;
  results.transport = transport;

  results.ankiPresent = entry.status === 'exported';
  results.note = entry.status === 'exported'
    ? 'Anki was running and accepted the note.'
    : 'Anki was NOT running. The mine failed and was RECORDED as a failure, which is the '
      + 'designed behaviour — everything this slice added (cue, draft, request, history entry, '
      + 'localStorage write, provenance) is exercised either way. Only Anki acceptance is unproven.';
  log(results.note);
}

main()
  .then(() => { results.result = 'PASS'; })
  .catch((err) => { results.result = 'FAIL'; results.error = String(err?.message ?? err); })
  .finally(async () => {
    results.finishedAt = new Date().toISOString();
    results.log = logLines;
    fs.writeFileSync(
      path.join(workRoot, 'music-mining-live.json'),
      JSON.stringify(results, null, 2),
    );
    if (electron && !electron.killed) electron.kill();
    await sleep(500);
    console.log(`\nrecord: ${path.join(workRoot, 'music-mining-live.json')}`);
    process.exit(results.result === 'PASS' ? 0 : 1);
  });
