/**
 * "Can Chromium play this file as it is, without the media server?" — answered from the
 * container's own headers, in a few small reads.
 *
 * ## Why
 *
 * Every local video used to go through the Seanime sidecar first: a library scan of its
 * folder (1-11 s measured), a directstream preparation, and only then — for anything the
 * sidecar had not matched to an anime — a fallback to plain disk playback. Most files people
 * study with are MP4/H.264 or WebM, which `<video>` plays straight off the app's own
 * `playfile://` protocol (Range requests, so seeking works). The sidecar is only *needed*
 * for what Chromium cannot do on its own: the embedded subtitle tracks of a Matroska file
 * (its MKV parser streams them as `subtitle-event`s), and codecs Chromium cannot decode
 * (its transcoder).
 *
 * ## Cheap on purpose
 *
 * ffprobe is not a dependency, and spawning ffmpeg for its banner costs 150-400 ms on
 * Windows — more than the whole budget of a warm open. This reads the boxes/elements that
 * name the tracks: an MP4's `moov` (wherever it sits, by walking top-level box headers) and
 * a Matroska/WebM `Tracks` element (directly, or through the `SeekHead`). A few reads of a
 * few KB. Anything it cannot read confidently is `unknown`, and the caller keeps the old
 * path for it.
 *
 * ## Optimistic, with a net
 *
 * A `direct` verdict that turns out wrong (a codec profile the GPU will not decode) is not
 * a dead end: the player's decode-error fallback (`shared/mediastreamTranscode.ts`) switches
 * the same request to the sidecar's transcoder and remembers the file. So the table below
 * only has to be right about the common case, and conservative where a mistake would cost
 * a feature rather than a second: HEVC, FLAC, AC-3/DTS and 10-bit H.264 go to the sidecar.
 *
 * Pure: the caller supplies `read(offset, length)` (a file descriptor in main, a Buffer in
 * tests) and the file size.
 */

export type ProbeContainer = 'mp4' | 'webm' | 'matroska' | 'unknown';

export interface DirectPlayProbe {
  container: ProbeContainer;
  /** Normalized codec names: h264, h264-10bit, hevc, vp8, vp9, av1, aac, mp3, opus, vorbis, flac, ac3, eac3, dts, … */
  video: string[];
  audio: string[];
  /** Embedded subtitle tracks (Matroska S_*, MP4 tx3g/wvtt/…). */
  subtitles: number;
  /** False when the track list could not be read to the end. */
  complete: boolean;
}

export type DirectPlayVerdict = 'direct' | 'sidecar' | 'unknown';

export interface DirectPlayDecision {
  verdict: DirectPlayVerdict;
  /** A short machine-readable why, for logs and tests. */
  reason: string;
}

/** Codecs Chromium decodes everywhere it runs (software paths included). */
export const DIRECT_VIDEO_CODECS: ReadonlySet<string> = new Set(['h264', 'vp8', 'vp9', 'av1']);
export const DIRECT_AUDIO_CODECS: ReadonlySet<string> = new Set(['aac', 'mp3', 'opus', 'vorbis']);

export type ProbeRead = (offset: number, length: number) => Uint8Array;

const EMPTY: DirectPlayProbe = { container: 'unknown', video: [], audio: [], subtitles: 0, complete: false };

/** Upper bounds, so a corrupt or hostile file cannot make the probe walk forever. */
const MAX_TOP_LEVEL_BOXES = 4096;
const MAX_MOOV_BYTES = 16 * 1024 * 1024;
const MAX_ELEMENTS = 20000;
const MAX_TRACKS_BYTES = 4 * 1024 * 1024;

export function decideDirectPlay(probe: DirectPlayProbe): DirectPlayDecision {
  if (probe.container === 'unknown') return { verdict: 'unknown', reason: 'container not recognized' };
  if (!probe.complete) return { verdict: 'unknown', reason: 'track list not readable' };
  if (!probe.video.length && !probe.audio.length) return { verdict: 'unknown', reason: 'no tracks found' };
  const badVideo = probe.video.find((c) => !DIRECT_VIDEO_CODECS.has(c));
  if (badVideo) return { verdict: 'sidecar', reason: `video codec ${badVideo}` };
  const badAudio = probe.audio.find((c) => !DIRECT_AUDIO_CODECS.has(c));
  if (badAudio) return { verdict: 'sidecar', reason: `audio codec ${badAudio}` };
  // Matroska subtitles reach the study player only through the sidecar's MKV parser. MP4
  // timed text has no such path at all (the sidecar does not parse it either), so it does
  // not hold an MP4 back.
  if (probe.container !== 'mp4' && probe.subtitles > 0) {
    return { verdict: 'sidecar', reason: `${probe.subtitles} embedded subtitle track(s)` };
  }
  return { verdict: 'direct', reason: `${probe.container} ${[...probe.video, ...probe.audio].join('+')}` };
}

export function probeDirectPlay(read: ProbeRead, size: number): DirectPlayProbe {
  if (!(size > 16)) return EMPTY;
  let head: Uint8Array;
  try {
    head = read(0, Math.min(size, 64));
  } catch {
    return EMPTY;
  }
  try {
    if (head.length >= 8 && fourcc(head, 4) === 'ftyp') return probeMp4(read, size);
    if (head.length >= 4 && u32(head, 0) === 0x1a45dfa3) return probeMatroska(read, size);
  } catch {
    /* a short read or a malformed header: not something to guess about */
  }
  return EMPTY;
}

// ----- byte helpers -------------------------------------------------------------------

function u32(b: Uint8Array, at: number): number {
  return (((b[at] ?? 0) << 24) >>> 0) + ((b[at + 1] ?? 0) << 16) + ((b[at + 2] ?? 0) << 8) + (b[at + 3] ?? 0);
}

function fourcc(b: Uint8Array, at: number): string {
  return String.fromCharCode((b[at] ?? 0), (b[at + 1] ?? 0), (b[at + 2] ?? 0), (b[at + 3] ?? 0));
}

// ----- MP4 / MOV ----------------------------------------------------------------------

interface Box {
  type: string;
  /** Offset of the box's payload within the buffer it was found in. */
  start: number;
  end: number;
}

/** Child boxes of `buf[from, to)`. */
function boxesIn(buf: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let at = from;
  while (at + 8 <= to && out.length < 512) {
    let size = u32(buf, at);
    const type = fourcc(buf, at + 4);
    let header = 8;
    if (size === 1) {
      if (at + 16 > to) break;
      size = u32(buf, at + 8) * 2 ** 32 + u32(buf, at + 12);
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header || at + size > to) break;
    out.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return out;
}

function child(buf: Uint8Array, box: Box | undefined, type: string): Box | undefined {
  return box ? boxesIn(buf, box.start, box.end).find((b) => b.type === type) : undefined;
}

const MP4_VIDEO: Record<string, string> = {
  avc1: 'h264', avc3: 'h264', hev1: 'hevc', hvc1: 'hevc', dvh1: 'hevc', dvhe: 'hevc',
  av01: 'av1', vp09: 'vp9', vp08: 'vp8', mp4v: 'mpeg4', 'mjp2': 'mjpeg', jpeg: 'mjpeg',
};
const MP4_AUDIO: Record<string, string> = {
  mp4a: 'aac', Opus: 'opus', opus: 'opus', fLaC: 'flac', 'ac-3': 'ac3', 'ec-3': 'eac3',
  '.mp3': 'mp3', alac: 'alac', 'ac-4': 'ac4', dtsc: 'dts', dtsh: 'dts', dtsl: 'dts', samr: 'amr', sowt: 'pcm', twos: 'pcm', lpcm: 'pcm',
};

/** `mp4a` carries MP3 too; the esds object type says which. */
function mp4aCodec(buf: Uint8Array, entryStart: number, entryEnd: number): string {
  // AudioSampleEntry: 8 reserved/index + 20 fields = 28 bytes before child boxes.
  const esds = boxesIn(buf, entryStart + 28, entryEnd).find((b) => b.type === 'esds');
  if (!esds) return 'aac';
  for (let i = esds.start + 4; i < esds.end - 2; i++) {
    // DecoderConfigDescriptor tag 0x04; objectTypeIndication follows its length bytes.
    if (buf[i] !== 0x04) continue;
    let j = i + 1;
    while (j < esds.end && ((buf[j] ?? 0) & 0x80)) j++;
    const oti = buf[j + 1];
    if (oti === 0x69 || oti === 0x6b) return 'mp3';
    return 'aac';
  }
  return 'aac';
}

/** 8-bit H.264 is universal; High 10 / 4:2:2 / 4:4:4 profiles are not (no Chromium decoder). */
function avcProfileCodec(profile: number | undefined): string {
  return profile === 110 || profile === 122 || profile === 244 || profile === 44 ? 'h264-10bit' : 'h264';
}

function probeMp4(read: ProbeRead, size: number): DirectPlayProbe {
  // Walk the top-level box headers to find `moov` — at the front of a "faststart" file,
  // after `mdat` (so near the end) of one written straight from a recorder.
  let at = 0;
  let moov: { offset: number; size: number; header: number } | null = null;
  for (let n = 0; n < MAX_TOP_LEVEL_BOXES && at + 8 <= size; n++) {
    const h = read(at, 16);
    if (h.length < 8) break;
    let boxSize = u32(h, 0);
    const type = fourcc(h, 4);
    let header = 8;
    if (boxSize === 1) {
      if (h.length < 16) break;
      boxSize = u32(h, 8) * 2 ** 32 + u32(h, 12);
      header = 16;
    } else if (boxSize === 0) {
      boxSize = size - at;
    }
    if (boxSize < header) break;
    if (type === 'moov') {
      moov = { offset: at, size: boxSize, header };
      break;
    }
    at += boxSize;
  }
  if (!moov || moov.size > MAX_MOOV_BYTES || moov.offset + moov.size > size) return { ...EMPTY, container: 'mp4' };
  const buf = read(moov.offset, moov.size);
  if (buf.length < moov.size) return { ...EMPTY, container: 'mp4' };

  const probe: DirectPlayProbe = { container: 'mp4', video: [], audio: [], subtitles: 0, complete: true };
  for (const trak of boxesIn(buf, moov.header, buf.length).filter((b) => b.type === 'trak')) {
    const mdia = child(buf, trak, 'mdia');
    const hdlr = child(buf, mdia, 'hdlr');
    const handler = hdlr && hdlr.end - hdlr.start >= 12 ? fourcc(buf, hdlr.start + 8) : '';
    const stsd = child(buf, child(buf, child(buf, mdia, 'minf'), 'stbl'), 'stsd');
    // stsd: version/flags (4) + entry count (4), then the first sample entry.
    const entry = stsd && stsd.end - stsd.start >= 16
      ? boxesIn(buf, stsd.start + 8, stsd.end)[0]
      : undefined;
    const kind = entry?.type ?? '';
    if (handler === 'vide') {
      let codec = MP4_VIDEO[kind] ?? (kind.trim() || 'unknown');
      if (codec === 'h264' && entry) {
        // VisualSampleEntry: 8 + 70 bytes of fields before its child boxes.
        const avcC = boxesIn(buf, entry.start + 78, entry.end).find((b) => b.type === 'avcC');
        if (avcC) codec = avcProfileCodec(buf[avcC.start + 1]);
      }
      probe.video.push(codec);
    } else if (handler === 'soun') {
      probe.audio.push(kind === 'mp4a' && entry ? mp4aCodec(buf, entry.start, entry.end) : MP4_AUDIO[kind] ?? (kind.trim() || 'unknown'));
    } else if (handler === 'sbtl' || handler === 'text' || handler === 'subt' || handler === 'clcp') {
      probe.subtitles += 1;
    }
    // Others (hint, meta, tmcd chapters) do not affect playback.
  }
  return probe;
}

// ----- Matroska / WebM ----------------------------------------------------------------

const ID = {
  EBML: 0x1a45dfa3,
  DocType: 0x4282,
  Segment: 0x18538067,
  SeekHead: 0x114d9b74,
  Seek: 0x4dbb,
  SeekID: 0x53ab,
  SeekPosition: 0x53ac,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Cluster: 0x1f43b675,
} as const;

interface Vint {
  value: number;
  length: number;
  unknown: boolean;
}

/** An element ID keeps its length marker; a size drops it. */
function readVint(b: Uint8Array, at: number, keepMarker: boolean): Vint | null {
  const first = b[at];
  if (first === undefined || first === 0) return null;
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || at + length > b.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + (b[at + i] ?? 0);
    if (b[at + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

interface Element {
  id: number;
  /** Absolute file offset of the payload. */
  dataStart: number;
  /** Payload size; `Infinity` for an unknown-size element (live-written files). */
  size: number;
  headerLength: number;
}

function readElementHeader(read: ProbeRead, at: number): Element | null {
  const h = read(at, 12);
  const id = readVint(h, 0, true);
  if (!id) return null;
  const size = readVint(h, id.length, false);
  if (!size) return null;
  return { id: id.value, dataStart: at + id.length + size.length, size: size.unknown ? Infinity : size.value, headerLength: id.length + size.length };
}

/** Children of an element whose payload is already in memory. */
function elementsIn(b: Uint8Array, from: number, to: number): Array<{ id: number; start: number; end: number }> {
  const out: Array<{ id: number; start: number; end: number }> = [];
  let at = from;
  while (at < to && out.length < MAX_ELEMENTS) {
    const id = readVint(b, at, true);
    if (!id) break;
    const size = readVint(b, at + id.length, false);
    if (!size || size.unknown) break;
    const start = at + id.length + size.length;
    const end = start + size.value;
    if (end > to) break;
    out.push({ id: id.value, start, end });
    at = end;
  }
  return out;
}

function uintOf(b: Uint8Array, start: number, end: number): number {
  let v = 0;
  for (let i = start; i < end; i++) v = v * 256 + (b[i] ?? 0);
  return v;
}

function textOf(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && b[i] !== 0; i++) s += String.fromCharCode((b[i] ?? 0));
  return s;
}

function mkvVideoCodec(id: string, codecPrivate: Uint8Array | null): string {
  if (id === 'V_MPEG4/ISO/AVC') return avcProfileCodec(codecPrivate?.[1]);
  if (id === 'V_MPEGH/ISO/HEVC') return 'hevc';
  if (id === 'V_VP8') return 'vp8';
  if (id === 'V_VP9') return 'vp9';
  if (id === 'V_AV1') return 'av1';
  if (id.startsWith('V_MPEG4/')) return 'mpeg4';
  if (id.startsWith('V_MPEG2') || id.startsWith('V_MPEG1')) return 'mpeg2';
  return id.toLowerCase() || 'unknown';
}

function mkvAudioCodec(id: string): string {
  if (id.startsWith('A_AAC')) return 'aac';
  if (id === 'A_OPUS') return 'opus';
  if (id === 'A_VORBIS') return 'vorbis';
  if (id === 'A_FLAC') return 'flac';
  if (id === 'A_MPEG/L3') return 'mp3';
  if (id === 'A_AC3') return 'ac3';
  if (id === 'A_EAC3') return 'eac3';
  if (id.startsWith('A_DTS')) return 'dts';
  if (id === 'A_TRUEHD') return 'truehd';
  if (id.startsWith('A_PCM')) return 'pcm';
  return id.toLowerCase() || 'unknown';
}

function probeMatroska(read: ProbeRead, size: number): DirectPlayProbe {
  const ebml = readElementHeader(read, 0);
  if (!ebml || ebml.id !== ID.EBML || !Number.isFinite(ebml.size) || ebml.size > 4096) return EMPTY;
  const header = read(ebml.dataStart, ebml.size);
  const docTypeEl = elementsIn(header, 0, header.length).find((e) => e.id === ID.DocType);
  const docType = docTypeEl ? textOf(header, docTypeEl.start, docTypeEl.end) : 'matroska';
  const container: ProbeContainer = docType === 'webm' ? 'webm' : 'matroska';
  const none: DirectPlayProbe = { ...EMPTY, container };

  const segment = readElementHeader(read, ebml.dataStart + ebml.size);
  if (!segment || segment.id !== ID.Segment) return none;
  const segmentEnd = Number.isFinite(segment.size) ? Math.min(size, segment.dataStart + segment.size) : size;

  // Walk the segment's top-level children until Tracks. A SeekHead says where Tracks is
  // when something big (a Cluster, attachments) comes first.
  let tracks: Element | null = null;
  let seekTracksAt: number | null = null;
  let at = segment.dataStart;
  for (let n = 0; n < 256 && at < segmentEnd; n++) {
    const el = readElementHeader(read, at);
    if (!el) break;
    if (el.id === ID.Tracks) {
      tracks = el;
      break;
    }
    if (el.id === ID.SeekHead && Number.isFinite(el.size) && el.size < 64 * 1024) {
      const sh = read(el.dataStart, el.size);
      for (const seek of elementsIn(sh, 0, sh.length).filter((e) => e.id === ID.Seek)) {
        const parts = elementsIn(sh, seek.start, seek.end);
        const idPart = parts.find((p) => p.id === ID.SeekID);
        const posPart = parts.find((p) => p.id === ID.SeekPosition);
        if (idPart && posPart && uintOf(sh, idPart.start, idPart.end) === ID.Tracks) {
          seekTracksAt = segment.dataStart + uintOf(sh, posPart.start, posPart.end);
        }
      }
    }
    if (el.id === ID.Cluster || !Number.isFinite(el.size)) break;
    at = el.dataStart + el.size;
  }
  if (!tracks && seekTracksAt !== null && seekTracksAt < size) {
    const el = readElementHeader(read, seekTracksAt);
    if (el && el.id === ID.Tracks) tracks = el;
  }
  if (!tracks || !Number.isFinite(tracks.size) || tracks.size > MAX_TRACKS_BYTES) return none;
  const buf = read(tracks.dataStart, tracks.size);
  if (buf.length < tracks.size) return none;

  const probe: DirectPlayProbe = { container, video: [], audio: [], subtitles: 0, complete: true };
  for (const entry of elementsIn(buf, 0, buf.length).filter((e) => e.id === ID.TrackEntry)) {
    const fields = elementsIn(buf, entry.start, entry.end);
    const typeEl = fields.find((f) => f.id === ID.TrackType);
    const codecEl = fields.find((f) => f.id === ID.CodecID);
    const privEl = fields.find((f) => f.id === ID.CodecPrivate);
    const type = typeEl ? uintOf(buf, typeEl.start, typeEl.end) : 0;
    const codec = codecEl ? textOf(buf, codecEl.start, codecEl.end) : '';
    if (type === 1) probe.video.push(mkvVideoCodec(codec, privEl ? buf.subarray(privEl.start, privEl.end) : null));
    else if (type === 2) probe.audio.push(mkvAudioCodec(codec));
    else if (type === 17 || codec.startsWith('S_')) probe.subtitles += 1;
  }
  return probe;
}
