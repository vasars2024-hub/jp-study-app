/**
 * Chromium's insertable streams for media ("breakout box"), which the
 * TypeScript DOM library does not describe. Used by the Region Recorder host
 * to crop the captured monitor live; every use is feature-checked first.
 */
export interface GumTrackProcessor {
  readable: ReadableStream<VideoFrame>;
}

export interface GumTrackGenerator extends MediaStreamTrack {
  writable: WritableStream<VideoFrame>;
}

export interface GumInsertableStreams {
  MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => GumTrackProcessor;
  MediaStreamTrackGenerator?: new (init: { kind: 'video' | 'audio' }) => GumTrackGenerator;
  VideoFrame?: typeof VideoFrame;
}
