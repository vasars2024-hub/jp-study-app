// Region Recorder, second round (2026-10) -- English source of truth.
//
// Hardware encoding, quality presets, level meters, the recording history,
// window recording, study-day tagging and the "waiting for the speech model"
// queue. Keys live under `rec2.`; every key exists in all four languages.
import type { Catalog } from '../core';

export const RECORDER_V2_EN: Catalog = {
  // ---- main: errors and stop reasons ----
  'rec2.error.noWindow': 'There is no window to record. Open the window you want first, or choose one from the list.',
  'rec2.stopped.windowClosed': 'Stopped: the recorded window closed.',
  // ---- job card ----
  'rec2.job.encodedWith': 'Encoded with {encoder}.',
  'rec2.job.encoderFellBack': 'The hardware encoder could not handle this recording, so the processor encoded it.',
  'rec2.job.waitingModel': 'Waiting for the speech model. Transcription starts on its own once it is downloaded.',
  // ---- pill ----
  'rec2.pill.systemLevel': 'System audio level',
  'rec2.pill.window': 'Recording window: {name}',
  'rec2.pill.clipping': 'The input is clipping. Turn its gain down in Settings.',
  // ---- encoders ----
  'rec2.encoder.nvenc': 'NVIDIA graphics (NVENC)',
  'rec2.encoder.qsv': 'Intel graphics (Quick Sync)',
  'rec2.encoder.amf': 'AMD graphics (AMF)',
  'rec2.encoder.software': 'Processor (x264)',
  'rec2.encoder.label': 'Video encoder',
  'rec2.encoder.notDetected': 'Not checked on this computer yet.',
  'rec2.encoder.found': 'Works on this computer: {list}.',
  'rec2.encoder.noneFound': 'No hardware encoder works on this computer.',
  'rec2.encoder.using': 'Recordings are encoded with {encoder}.',
  'rec2.encoder.usingSoftware': 'Recordings are encoded on the processor.',
  'rec2.encoder.fallbackNote': 'The encoder you chose is not available here, so the processor is used instead.',
  'rec2.encoder.detect': 'Check again',
  'rec2.encoder.detecting': 'Checking...',
  'rec2.encoderPref.auto': 'Automatic (hardware when it works)',
  'rec2.encoderPref.software': 'Processor only (x264)',
  'rec2.quality.detail': 'Processor quality CRF {crf}, hardware quality {cq}, at most {mbps} Mbit/s.',
  // ---- settings ----
  'rec2.settings.studyTag': 'Add recordings to the study calendar',
  'rec2.settings.studyTagDesc': 'Each recording appears in Calendar on the day it was made, and its length counts as study time in Statistics.',
  'rec2.settings.waitingModel': {
    one: '{count} recording is waiting for the speech model and will be transcribed once it is downloaded.',
    other: '{count} recordings are waiting for the speech model and will be transcribed once it is downloaded.',
  },
  // ---- history ----
  'rec2.history.title': 'Recordings',
  'rec2.history.desc': 'Every recording you have made, newest first. Deleting one moves its file to the Recycle Bin.',
  'rec2.history.empty': 'No recordings yet.',
  'rec2.history.meta': '{when} · {duration} · {size} MB',
  'rec2.history.missing': 'The file has been moved or deleted.',
  'rec2.history.confirmLabel': 'Delete {title}?',
  'rec2.history.confirm': 'Move this recording to the Recycle Bin?',
  'rec2.history.confirmDelete': 'Move to Recycle Bin',
  'rec2.history.cancel': 'Keep it',
  'rec2.history.retranscribe': 'Transcribe again',
  'rec2.history.delete': 'Delete',
  'rec2.history.deleteLabel': 'Delete {title}',
  'rec2.history.showAll': { one: 'Show the {count} recording', other: 'Show all {count} recordings' },
  'rec2.history.transcript.waiting': 'waiting for the speech model',
  'rec2.history.transcript.done': 'transcribed',
  'rec2.history.transcript.failed': 'transcription failed',
  'rec2.history.transcript.running': 'transcribing',
  'rec2.history.error.gone': 'This recording is no longer in the list.',
  'rec2.history.error.missing': 'The file is no longer where it was saved.',
  'rec2.history.error.notInLibrary': 'This recording is not in the library, so it cannot be transcribed.',
  'rec2.history.error.delete': 'The file could not be moved to the Recycle Bin.',
  'rec2.history.error.failed': 'That did not work. Try again.',
  'rec2.source.window': 'window',
  // ---- window recording ----
  'rec2.window.active': 'Record the active window',
  'rec2.window.choose': 'Choose a window...',
  'rec2.window.hide': 'Hide the window list',
  'rec2.window.listLabel': 'Windows you can record',
  'rec2.window.none': 'No windows that can be recorded were found.',
  'rec2.window.hint': 'A window is recorded as it moves and resizes; the recording stops when the window closes.',
  // ---- calendar ----
  'rec2.calendar.eventTitle': 'Recording: {title}',
};
