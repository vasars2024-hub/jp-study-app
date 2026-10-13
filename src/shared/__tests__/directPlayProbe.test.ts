/**
 * The direct-play probe (`shared/directPlayProbe.ts`): container + codecs read from the
 * file's own headers, and the verdict that decides whether a local video plays straight
 * from disk or goes through the media server.
 *
 * Files are built byte by byte here (MP4 boxes, EBML elements) so every branch — `moov`
 * after `mdat`, a `SeekHead` pointing past a Cluster, 10-bit H.264, embedded subtitles —
 * is exercised without a binary fixture.
 */
import { describe, expect, it } from 'vitest';
import {
  decideDirectPlay,
  probeDirectPlay,
  type DirectPlayProbe,
} from '../directPlayProbe';

// ----- builders -------------------------------------------------------------------------

const bytes = (...parts: Array<Uint8Array | number[]>): Uint8Array => {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
const ascii = (s: string): Uint8Array => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const zeros = (n: number): Uint8Array => new Uint8Array(n);

function box(type: string, ...payload: Array<Uint8Array | number[]>): Uint8Array {
  const body = bytes(...payload);
  return bytes(u32(body.length + 8), ascii(type), body);
}

function hdlr(handler: string): Uint8Array {
  return box('hdlr', zeros(4), zeros(4), ascii(handler), zeros(12), [0]);
}

function videoEntry(fourcc: string, avcProfile?: number): Uint8Array {
  const children = avcProfile === undefined ? [] : [box('avcC', [1, avcProfile, 0, 31, 0xff])];
  return box(fourcc, zeros(78), ...children);
}

function audioEntry(fourcc: string, children: Uint8Array[] = []): Uint8Array {
  return box(fourcc, zeros(28), ...children);
}

function esds(objectType: number): Uint8Array {
  // ES_Descriptor (0x03) -> DecoderConfigDescriptor (0x04) with objectTypeIndication.
  return box('esds', zeros(4), [0x03, 0x19, 0x00, 0x01, 0x00, 0x04, 0x11, objectType, 0x15, 0, 0, 0]);
}

function trak(handler: string, entry: Uint8Array): Uint8Array {
  const stsd = box('stsd', zeros(4), u32(1), entry);
  return box('trak', box('mdia', hdlr(handler), box('minf', box('stbl', stsd))));
}

function mp4(traks: Uint8Array[], { moovLast = false, mdatBytes = 4096 } = {}): Uint8Array {
  const ftyp = box('ftyp', ascii('isom'), zeros(4), ascii('isomavc1'));
  const moov = box('moov', box('mvhd', zeros(100)), ...traks);
  const mdat = box('mdat', zeros(mdatBytes));
  return moovLast ? bytes(ftyp, mdat, moov) : bytes(ftyp, moov, mdat);
}

/** EBML element: ID bytes as written, size as an 8-byte vint (simple and always valid). */
function el(id: number[], ...payload: Array<Uint8Array | number[]>): Uint8Array {
  const body = bytes(...payload);
  const n = body.length;
  const size = [0x01, 0, 0, 0, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return bytes(id, size, body);
}
const uintEl = (id: number[], v: number): Uint8Array => el(id, [v]);
const strEl = (id: number[], s: string): Uint8Array => el(id, ascii(s));

const EBML = [0x1a, 0x45, 0xdf, 0xa3];
const DOCTYPE = [0x42, 0x82];
const SEGMENT = [0x18, 0x53, 0x80, 0x67];
const SEEKHEAD = [0x11, 0x4d, 0x9b, 0x74];
const SEEK = [0x4d, 0xbb];
const SEEKID = [0x53, 0xab];
const SEEKPOS = [0x53, 0xac];
const INFO = [0x15, 0x49, 0xa9, 0x66];
const TRACKS = [0x16, 0x54, 0xae, 0x6b];
const TRACKENTRY = [0xae];
const TRACKTYPE = [0x83];
const CODECID = [0x86];
const CODECPRIVATE = [0x63, 0xa2];
const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];

function trackEntry(type: number, codec: string, priv?: number[]): Uint8Array {
  return el(TRACKENTRY, uintEl(TRACKTYPE, type), strEl(CODECID, codec), ...(priv ? [el(CODECPRIVATE, priv)] : []));
}

function mkv(docType: string, entries: Uint8Array[], { tracksAfterCluster = false } = {}): Uint8Array {
  const header = el(EBML, strEl(DOCTYPE, docType));
  const info = el(INFO, zeros(20));
  const tracks = el(TRACKS, ...entries);
  const cluster = el(CLUSTER, zeros(2048));
  if (!tracksAfterCluster) return bytes(header, el(SEGMENT, info, tracks, cluster));
  // SeekHead first, pointing at Tracks after the Cluster. Its size is fixed, so the
  // position can be computed before it is written.
  const seekHeadLen = el(SEEKHEAD, el(SEEK, el(SEEKID, TRACKS), el(SEEKPOS, u32(0)))).length;
  const tracksPos = seekHeadLen + info.length + cluster.length;
  const seekHead = el(SEEKHEAD, el(SEEK, el(SEEKID, TRACKS), el(SEEKPOS, u32(tracksPos))));
  return bytes(header, el(SEGMENT, seekHead, info, cluster, tracks));
}

const probe = (file: Uint8Array): DirectPlayProbe =>
  probeDirectPlay((offset, length) => file.subarray(offset, Math.min(file.length, offset + length)), file.length);

// ----- MP4 ------------------------------------------------------------------------------

describe('MP4', () => {
  it('H.264 + AAC (faststart) is direct', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 100)), trak('soun', audioEntry('mp4a', [esds(0x40)]))]));
    expect(p).toEqual({ container: 'mp4', video: ['h264'], audio: ['aac'], subtitles: 0, complete: true });
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('finds moov after mdat (a recorder that never moved it to the front)', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 66)), trak('soun', audioEntry('mp4a'))], { moovLast: true, mdatBytes: 200_000 }));
    expect(p.complete).toBe(true);
    expect(p.video).toEqual(['h264']);
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('MP3 in mp4a is told apart from AAC, and still direct', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 100)), trak('soun', audioEntry('mp4a', [esds(0x6b)]))]));
    expect(p.audio).toEqual(['mp3']);
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('10-bit H.264 (High 10) goes to the media server', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 110)), trak('soun', audioEntry('mp4a'))]));
    expect(p.video).toEqual(['h264-10bit']);
    expect(decideDirectPlay(p)).toMatchObject({ verdict: 'sidecar', reason: 'video codec h264-10bit' });
  });

  it('HEVC goes to the media server', () => {
    const p = probe(mp4([trak('vide', videoEntry('hvc1')), trak('soun', audioEntry('mp4a'))]));
    expect(decideDirectPlay(p)).toMatchObject({ verdict: 'sidecar', reason: 'video codec hevc' });
  });

  it('AC-3 audio goes to the media server', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 100)), trak('soun', audioEntry('ac-3'))]));
    expect(decideDirectPlay(p)).toMatchObject({ verdict: 'sidecar', reason: 'audio codec ac3' });
  });

  it('MP4 timed text does not hold a file back (the server cannot read it either)', () => {
    const p = probe(mp4([trak('vide', videoEntry('avc1', 100)), trak('soun', audioEntry('mp4a')), trak('sbtl', box('tx3g', zeros(40)))]));
    expect(p.subtitles).toBe(1);
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('an MP4 with no moov at all is unknown, not guessed', () => {
    const file = bytes(box('ftyp', ascii('isom'), zeros(4)), box('mdat', zeros(64)));
    const p = probe(file);
    expect(p.complete).toBe(false);
    expect(decideDirectPlay(p).verdict).toBe('unknown');
  });

  it('a truncated moov is unknown', () => {
    const whole = mp4([trak('vide', videoEntry('avc1', 100))], { mdatBytes: 16 });
    const cut = whole.subarray(0, whole.length - 40);
    expect(decideDirectPlay(probe(cut)).verdict).toBe('unknown');
  });
});

// ----- Matroska / WebM ------------------------------------------------------------------

describe('Matroska and WebM', () => {
  it('WebM VP9 + Opus is direct', () => {
    const p = probe(mkv('webm', [trackEntry(1, 'V_VP9'), trackEntry(2, 'A_OPUS')]));
    expect(p).toEqual({ container: 'webm', video: ['vp9'], audio: ['opus'], subtitles: 0, complete: true });
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('MKV H.264 + AAC with no subtitle tracks is direct', () => {
    const p = probe(mkv('matroska', [trackEntry(1, 'V_MPEG4/ISO/AVC', [1, 100, 0, 40]), trackEntry(2, 'A_AAC')]));
    expect(p.video).toEqual(['h264']);
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });

  it('MKV with embedded ASS subtitles needs the media server (its MKV parser feeds the study line)', () => {
    const p = probe(mkv('matroska', [trackEntry(1, 'V_MPEG4/ISO/AVC', [1, 100, 0, 40]), trackEntry(2, 'A_AAC'), trackEntry(17, 'S_TEXT/ASS')]));
    expect(p.subtitles).toBe(1);
    expect(decideDirectPlay(p)).toMatchObject({ verdict: 'sidecar', reason: '1 embedded subtitle track(s)' });
  });

  it('HEVC + FLAC (the measured Big O case) goes to the media server', () => {
    const p = probe(mkv('matroska', [trackEntry(1, 'V_MPEGH/ISO/HEVC'), trackEntry(2, 'A_FLAC')]));
    expect(decideDirectPlay(p).verdict).toBe('sidecar');
  });

  it('10-bit H.264 in MKV (Hi10P fansubs) goes to the media server', () => {
    const p = probe(mkv('matroska', [trackEntry(1, 'V_MPEG4/ISO/AVC', [1, 110, 0, 40]), trackEntry(2, 'A_AAC')]));
    expect(p.video).toEqual(['h264-10bit']);
    expect(decideDirectPlay(p).verdict).toBe('sidecar');
  });

  it('finds Tracks through the SeekHead when a Cluster comes first', () => {
    const p = probe(mkv('matroska', [trackEntry(1, 'V_VP9'), trackEntry(2, 'A_VORBIS')], { tracksAfterCluster: true }));
    expect(p.complete).toBe(true);
    expect(p.video).toEqual(['vp9']);
    expect(p.audio).toEqual(['vorbis']);
    expect(decideDirectPlay(p).verdict).toBe('direct');
  });
});

describe('anything else', () => {
  it('an AVI, a text file or an empty file is unknown', () => {
    expect(decideDirectPlay(probe(bytes(ascii('RIFF'), u32(1000), ascii('AVI LIST'), zeros(64)))).verdict).toBe('unknown');
    expect(decideDirectPlay(probe(ascii('hello, this is not a video at all, just words'))).verdict).toBe('unknown');
    expect(decideDirectPlay(probe(new Uint8Array(0))).verdict).toBe('unknown');
  });

  it('a reader that throws is unknown, never an exception', () => {
    const p = probeDirectPlay(() => {
      throw new Error('EIO');
    }, 1_000_000);
    expect(decideDirectPlay(p).verdict).toBe('unknown');
  });

  it('a box size pointing far past the end does not loop or throw', () => {
    const file = bytes(box('ftyp', ascii('isom')), u32(0x7fffffff), ascii('free'), zeros(16));
    expect(() => probe(file)).not.toThrow();
    expect(decideDirectPlay(probe(file)).verdict).toBe('unknown');
  });
});
