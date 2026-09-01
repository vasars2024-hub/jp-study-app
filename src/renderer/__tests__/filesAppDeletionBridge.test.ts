import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FILES_DELETE_CHANNEL } from '../../shared/filesApp/deletion';

const root = resolve(__dirname, '../../..');
const preload = readFileSync(resolve(root, 'src/preload.ts'), 'utf8');
const declaration = readFileSync(resolve(root, 'src/renderer/window.d.ts'), 'utf8');

describe('Files app deletion preload bridge', () => {
  it('invokes the shared narrow channel with only the typed request', () => {
    expect(FILES_DELETE_CHANNEL).toBe('filesapp:delete');
    expect(preload).toContain("import { FILES_DELETE_CHANNEL } from './shared/filesApp/deletion';");
    expect(preload).toMatch(
      /filesDelete:\s*\(\s*request:[\s\S]*?FilesDeleteRequest[\s\S]*?ipcRenderer\.invoke\(FILES_DELETE_CHANNEL, request\)/,
    );
  });

  it('keeps renderer typing on the same request and result union', () => {
    expect(declaration).toMatch(
      /filesDelete\(\s*request: import\('\.\.\/shared\/filesApp\/deletion'\)\.FilesDeleteRequest,[\s\S]*?Promise<import\('\.\.\/shared\/filesApp\/deletion'\)\.FilesDeletionResult>/,
    );
  });
});
