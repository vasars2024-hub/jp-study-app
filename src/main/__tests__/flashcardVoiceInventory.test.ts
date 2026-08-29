import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => path.join(os.tmpdir(), `jp-voice-inventory-test-${process.pid}`) },
  ipcMain: { handle: vi.fn() },
}));

import {
  parseLinuxVoices,
  parseMacVoices,
  parseWindowsVoices,
} from '../flashcardAudio';

describe('reading what Windows reports', () => {
  it('handles the single-voice case, which serialises as an object not an array', () => {
    // The shape that would otherwise produce an empty inventory on exactly the
    // machines that have one Japanese voice and nothing else.
    expect(parseWindowsVoices('{"Name":"Microsoft Haruka Desktop","Culture":"ja-JP"}')).toEqual([
      {
        id: 'Microsoft Haruka Desktop',
        name: 'Microsoft Haruka Desktop',
        culture: 'ja-JP',
        language: 'ja',
      },
    ]);
  });

  it('reads several voices and their languages', () => {
    const voices = parseWindowsVoices(JSON.stringify([
      { Name: 'Microsoft Haruka Desktop', Culture: 'ja-JP' },
      { Name: 'Microsoft Zira Desktop', Culture: 'en-US' },
    ]));
    expect(voices.map((voice) => voice.language)).toEqual(['ja', 'en']);
  });

  it('returns nothing for output that is not JSON, rather than throwing', () => {
    expect(parseWindowsVoices('')).toEqual([]);
    expect(parseWindowsVoices('Add-Type : Cannot find type')).toEqual([]);
    expect(parseWindowsVoices('null')).toEqual([]);
    expect(parseWindowsVoices('[{"Culture":"ja-JP"}]')).toEqual([]);
  });
});

describe('reading what macOS reports', () => {
  it('takes the name and the culture from the fixed-width table', () => {
    const stdout = [
      'Alex                en_US    # Most people recognize me by my voice.',
      'Kyoko               ja_JP    # こんにちは、私の名前はKyokoです。',
      'Tingting            zh_CN    # 你好，我叫Tingting。',
    ].join('\n');
    expect(parseMacVoices(stdout)).toEqual([
      { id: 'Alex', name: 'Alex', culture: 'en-US', language: 'en' },
      { id: 'Kyoko', name: 'Kyoko', culture: 'ja-JP', language: 'ja' },
      { id: 'Tingting', name: 'Tingting', culture: 'zh-CN', language: 'zh' },
    ]);
  });

  it('keeps a multi-word voice name whole', () => {
    expect(parseMacVoices('Eddy (English (UK))   en_GB    # Hello')[0].name)
      .toBe('Eddy (English (UK))');
  });
});

describe('reading what espeak-ng reports', () => {
  it('takes the voice name column, not the language code', () => {
    // espeak is the one back end where the id and the culture differ; using the
    // language code as the id would pick a different voice than the one shown.
    const stdout = [
      'Pty Language Age/Gender VoiceName          File                 Other Languages',
      ' 5  ja        --/--      japanese           gmw/ja',
      ' 5  en-gb     --/M       english            gmw/en',
    ].join('\n');
    expect(parseLinuxVoices(stdout)).toEqual([
      { id: 'japanese', name: 'japanese', culture: 'ja', language: 'ja' },
      { id: 'english', name: 'english', culture: 'en-gb', language: 'en' },
    ]);
  });

  it('skips the header and anything that is not a table row', () => {
    expect(parseLinuxVoices('Pty Language Age/Gender VoiceName File\n\nnot a row')).toEqual([]);
  });
});
