/* global chrome */
/*
 * The offscreen recorder. An MV3 service worker cannot touch media, so the
 * worker gets a tab-capture stream id and hands it here (reason USER_MEDIA).
 *
 * - Tab capture mutes the tab for the user; its sound is played straight back
 *   through an AudioContext so watching continues normally.
 * - MediaRecorder writes webm in 2 s chunks. Each chunk goes to IndexedDB
 *   first (the worker uploads from there), then the worker is told about it —
 *   a worker restart or a closed app loses nothing.
 * - An optional crop (a dragged box, or the page's largest video) is applied
 *   per frame with VideoFrame.visibleRect, so only that region is encoded.
 *
 * Offscreen documents get chrome.runtime and nothing else, which is why the
 * pairing token and the network stay in the worker.
 */
(function () {
  const IDB = globalThis.jpStudyIdb;
  const CHUNK_MS = 2000;
  const sessions = new Map();

  function pickMime(video) {
    const list = video
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['audio/webm;codecs=opus', 'audio/webm'];
    return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }

  /** Crop rect in frame pixels for a CSS-viewport region, even-aligned. */
  function cropRectFor(frame, crop) {
    const vw = Number(crop.viewportWidth) || 0;
    const vh = Number(crop.viewportHeight) || 0;
    const fw = frame.displayWidth || frame.codedWidth;
    const fh = frame.displayHeight || frame.codedHeight;
    if (!vw || !vh || !fw || !fh) return null;
    const sx = fw / vw;
    const sy = fh / vh;
    const even = (n) => Math.max(0, Math.floor(n / 2) * 2);
    let x = even(Number(crop.left) * sx);
    let y = even(Number(crop.top) * sy);
    let w = even(Number(crop.width) * sx);
    let h = even(Number(crop.height) * sy);
    x = Math.min(x, fw - 2);
    y = Math.min(y, fh - 2);
    w = Math.max(2, Math.min(w, even(fw - x)));
    h = Math.max(2, Math.min(h, even(fh - y)));
    return { x, y, width: w, height: h };
  }

  function croppedTrack(track, crop) {
    if (
      !crop ||
      typeof MediaStreamTrackProcessor !== 'function' ||
      typeof MediaStreamTrackGenerator !== 'function' ||
      typeof VideoFrame !== 'function'
    ) {
      return track;
    }
    const processor = new MediaStreamTrackProcessor({ track });
    const generator = new MediaStreamTrackGenerator({ kind: 'video' });
    const transform = new TransformStream({
      transform(frame, controller) {
        const rect = cropRectFor(frame, crop);
        if (!rect) {
          controller.enqueue(frame);
          return;
        }
        try {
          const out = new VideoFrame(frame, { visibleRect: rect, displayWidth: rect.width, displayHeight: rect.height });
          controller.enqueue(out);
        } catch {
          controller.enqueue(frame);
          return;
        }
        frame.close();
      },
    });
    processor.readable.pipeThrough(transform).pipeTo(generator.writable).catch(() => undefined);
    return generator;
  }

  function notify(msg) {
    try {
      return chrome.runtime.sendMessage(msg);
    } catch {
      return Promise.resolve();
    }
  }

  /** The stream for a session: the tab (stream id from the worker) or the microphone. */
  function openStream(msg) {
    if (msg.source === 'mic') {
      // The extension origin's mic permission (granted once on options.html#mic).
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    }
    const constraint = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } };
    return navigator.mediaDevices.getUserMedia({
      audio: constraint,
      video: msg.video
        ? { mandatory: { ...constraint.mandatory, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } }
        : false,
    });
  }

  async function start(msg) {
    if (sessions.has(msg.recId)) return { ok: true, already: true };
    const stream = await openStream(msg);
    // Tab capture silences the tab; play it back so the user still hears it.
    // (Never for the mic: that would echo the user's own voice.)
    const audioCtx = msg.source === 'mic' ? null : new AudioContext();
    if (audioCtx && stream.getAudioTracks().length) audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

    const tracks = [...stream.getAudioTracks()];
    const rawVideo = stream.getVideoTracks()[0];
    if (rawVideo) tracks.push(croppedTrack(rawVideo, msg.crop));
    const mimeType = pickMime(!!rawVideo);
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      ...(mimeType ? { mimeType } : {}),
      ...(rawVideo ? { videoBitsPerSecond: 2_500_000 } : {}),
      audioBitsPerSecond: 128_000,
    });
    const session = { recorder, stream, audioCtx, seq: 0, chain: Promise.resolve(), startedAt: Date.now(), timer: null };
    sessions.set(msg.recId, session);

    recorder.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      const seq = session.seq++;
      // Serialised so chunks reach IndexedDB, and the worker, in order.
      session.chain = session.chain.then(async () => {
        await IDB.putStrict('chunks', { key: `${msg.recId}:${String(seq).padStart(7, '0')}`, recId: msg.recId, seq, data: e.data, size: e.data.size });
        await notify({ type: 'rec-chunk', recId: msg.recId, seq, size: e.data.size });
      }).catch((err) => notify({ type: 'rec-error', recId: msg.recId, error: String((err && err.message) || err) }));
    };
    recorder.onstop = () => {
      void session.chain.then(() => {
        cleanup(msg.recId);
        return notify({ type: 'rec-stopped', recId: msg.recId, durationMs: Date.now() - session.startedAt });
      });
    };
    // The tab closed or the capture was revoked.
    for (const tr of stream.getTracks()) tr.addEventListener('ended', () => stop(msg.recId));
    if (Number(msg.maxMs) > 0) session.timer = setTimeout(() => stop(msg.recId), Number(msg.maxMs));
    recorder.start(CHUNK_MS);
    return { ok: true, mimeType: recorder.mimeType || mimeType };
  }

  function cleanup(recId) {
    const session = sessions.get(recId);
    if (!session) return;
    clearTimeout(session.timer);
    for (const tr of session.stream.getTracks()) tr.stop();
    if (session.audioCtx) void session.audioCtx.close().catch(() => undefined);
    sessions.delete(recId);
  }

  /*
   * A short microphone clip for the page's "record audio" (attached to the next
   * card). Kept in memory and handed back as a data URL on stop; it used to be
   * recorded by the content script, which made every site ask for the mic.
   */
  const CLIP_MAX_MS = 120000;
  let clip = null;

  async function clipStart() {
    if (clip) return { ok: true, already: true };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    const mimeType = pickMime(false);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const session = { recorder, stream, parts: [], done: null, timer: null };
    session.done = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) session.parts.push(e.data);
    };
    session.timer = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, CLIP_MAX_MS);
    clip = session;
    recorder.start();
    return { ok: true, mimeType: recorder.mimeType || mimeType };
  }

  async function clipStop() {
    const session = clip;
    if (!session) return { ok: false, error: 'not recording' };
    clip = null;
    clearTimeout(session.timer);
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    await session.done;
    for (const tr of session.stream.getTracks()) tr.stop();
    const type = (session.recorder.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(session.parts, { type });
    if (!blob.size) return { ok: true, empty: true };
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('unreadable'));
      reader.readAsDataURL(blob);
    });
    return { ok: true, dataUrl, mimeType: type };
  }

  /** Save to disk: the recording's chunks, in order, as one Blob URL the worker hands to chrome.downloads. */
  async function blobUrlFor(msg) {
    const chunks = (await IDB.getAllByIndex('chunks', 'recId', msg.recId)).sort((a, b) => a.seq - b.seq);
    if (!chunks.length) return { ok: false, error: 'no chunks' };
    const blob = new Blob(
      chunks.map((c) => c.data),
      { type: String(msg.mimeType || 'video/webm').split(';')[0] },
    );
    return { ok: true, url: URL.createObjectURL(blob), size: blob.size };
  }

  function stop(recId) {
    const session = sessions.get(recId);
    if (!session) return { ok: true, stopped: false };
    if (session.recorder.state !== 'inactive') session.recorder.stop();
    else cleanup(recId);
    return { ok: true, stopped: true };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.target !== 'offscreen') return false;
    if (sender && sender.id && sender.id !== chrome.runtime.id) return false;
    (async () => {
      if (msg.type === 'offscreen-rec-start') return start(msg);
      if (msg.type === 'offscreen-rec-stop') return stop(msg.recId);
      if (msg.type === 'offscreen-blob-url') return blobUrlFor(msg);
      if (msg.type === 'offscreen-rec-list') return { ok: true, ids: [...sessions.keys()] };
      if (msg.type === 'offscreen-clip-start') return clipStart();
      if (msg.type === 'offscreen-clip-stop') return clipStop();
      if (msg.type === 'offscreen-revoke') {
        if (typeof msg.url === 'string' && msg.url.startsWith('blob:')) URL.revokeObjectURL(msg.url);
        return { ok: true };
      }
      return { ok: false, error: 'unknown' };
    })()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err), name: err && err.name }));
    return true;
  });
})();
