// @vitest-environment node
/**
 * Yomitan store provisioning runs in the dictionary utility process.
 *
 * Parsing the bundled JMdict on Electron's main process held it for ~10 s at
 * first boot and left ~900 MB of garbage whose collection, 20-30 s later, froze
 * the main process (every IPC call and the E2E bridge) for another 5-8 s. The
 * parse now runs in the utility process; these tests pin both halves of that:
 * the worker role that writes the store, and the host that waits for it and
 * falls back to an in-process parse only when no child answers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

const h = vi.hoisted(() => ({
  fork: vi.fn(),
  root: '',
}));

vi.mock('electron', () => ({
  app: { getPath: () => h.root },
  utilityProcess: { fork: h.fork },
}));

import { attachYomitanProvisionWorker } from '../dictionary/importWorker';
import { provisionYomitanStoreOffMainLoop } from '../dictionary/yomitanStoreHost';
import type { YomitanProvisionReply, YomitanProvisionRequest } from '../dictionary/yomitanZip';

const TERM_BANK = [
  ['猫', 'ねこ', 'n', '', 0, ['cat'], 1, 'news1'],
  ['犬', 'いぬ', 'n', '', 0, ['dog'], 2, ''],
];

function writeFixtureZip(): string {
  const zipPath = path.join(h.root, 'fixture.zip');
  const zip = new AdmZip();
  zip.addFile('index.json', Buffer.from(JSON.stringify({ title: 'Fixture', revision: 'r1', format: 3 })));
  zip.addFile('term_bank_1.json', Buffer.from(JSON.stringify(TERM_BANK)));
  zip.writeZip(zipPath);
  return zipPath;
}

function readStore(file: string): { info: Record<string, unknown>; terms: Record<string, Array<Record<string, unknown>>> } {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A fake `process.parentPort`: what the worker posts, and a way to send it a message. */
function fakePort() {
  const listeners: Array<(event: { data: unknown }) => void> = [];
  const posted: YomitanProvisionReply[] = [];
  return {
    posted,
    port: {
      postMessage: (message: unknown) => posted.push(message as YomitanProvisionReply),
      on: (_event: 'message', listener: (event: { data: unknown }) => void) => listeners.push(listener),
    },
    send: (data: unknown) => listeners.forEach((listener) => listener({ data })),
  };
}

/** A fake utility child whose replies come from the real worker role. */
function workerBackedChild() {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    postMessage: (message: unknown) => {
      const { port, send } = fakePort();
      port.postMessage = (reply: unknown) => setTimeout(() => child.emit('message', reply), 0);
      attachYomitanProvisionWorker(port);
      send(message);
    },
  });
  return child;
}

beforeEach(() => {
  h.root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa-yomitan-provision-'));
  h.fork.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(h.root, { recursive: true, force: true });
});

describe('the utility process role', () => {
  it('acknowledges, writes the store with the overrides applied, and answers with only its info', async () => {
    const zipPath = writeFixtureZip();
    const outPath = path.join(h.root, 'out', 'index.json');
    const { port, posted, send } = fakePort();
    attachYomitanProvisionWorker(port);
    send({
      type: 'provisionYomitan',
      zipPath,
      outPath,
      overrides: { id: 'bundled-x', title: 'Bundled X', bundled: true, priority: 3, glossLangs: ['en'], compact: true },
    } satisfies YomitanProvisionRequest);

    // The ack goes out before the parse starts.
    expect(posted).toEqual([{ type: 'provisionYomitanAccepted' }]);
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    const answer = posted[1];
    expect(answer).toMatchObject({ type: 'provisionYomitanResult', ok: true, termCount: 2 });
    expect(answer).not.toHaveProperty('terms');
    const store = readStore(outPath);
    expect(store.info).toMatchObject({ id: 'bundled-x', title: 'Bundled X', bundled: true, priority: 3, glossLangs: ['en'] });
    // Compact: the duplicated glossary HTML is not stored, the senses are.
    expect(store.terms['猫'][0].glossaryHtml).toBeUndefined();
    expect(store.terms['猫'][0].senses).toEqual([expect.objectContaining({ definitions: ['cat'] })]);
  });

  it('answers a broken archive with its error instead of going quiet', async () => {
    const bad = path.join(h.root, 'bad.zip');
    fs.writeFileSync(bad, 'not a zip');
    const { port, posted, send } = fakePort();
    attachYomitanProvisionWorker(port);
    send({ type: 'provisionYomitan', zipPath: bad, outPath: path.join(h.root, 'never.json') });
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toMatchObject({ type: 'provisionYomitanResult', ok: false });
    expect(fs.existsSync(path.join(h.root, 'never.json'))).toBe(false);
  });

  it('ignores the messages of the other roles', () => {
    const { port, posted, send } = fakePort();
    attachYomitanProvisionWorker(port);
    send({ type: 'read', id: 1 });
    send({ type: 'start' });
    expect(posted).toEqual([]);
  });
});

describe('provisionYomitanStoreOffMainLoop', () => {
  it('runs the parse in the utility process and kills it once answered', async () => {
    const child = workerBackedChild();
    h.fork.mockReturnValue(child);
    const outPath = path.join(h.root, 'store.json');
    const done = await provisionYomitanStoreOffMainLoop(writeFixtureZip(), outPath, { id: 'x' });
    expect(h.fork).toHaveBeenCalledTimes(1);
    expect(done).toMatchObject({ termCount: 2, info: expect.objectContaining({ id: 'x' }) });
    expect(child.kill).toHaveBeenCalled();
    expect(readStore(outPath).terms['犬']).toHaveLength(1);
  });

  it('passes a parse failure through as the error, without a second parse on this process', async () => {
    const child = workerBackedChild();
    h.fork.mockReturnValue(child);
    const bad = path.join(h.root, 'bad.zip');
    fs.writeFileSync(bad, 'not a zip');
    await expect(provisionYomitanStoreOffMainLoop(bad, path.join(h.root, 'never.json'))).rejects.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('parses here when the child exits without answering (a missing worker bundle)', async () => {
    const child = Object.assign(new EventEmitter(), {
      kill: vi.fn(),
      postMessage: () => setTimeout(() => child.emit('exit', 1), 0),
    });
    h.fork.mockReturnValue(child);
    const outPath = path.join(h.root, 'fallback.json');
    const done = await provisionYomitanStoreOffMainLoop(writeFixtureZip(), outPath);
    expect(done.termCount).toBe(2);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('exit:1'));
  });

  it('parses here when the child never acknowledges the request', async () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), postMessage: () => undefined });
    h.fork.mockReturnValue(child);
    const outPath = path.join(h.root, 'silent.json');
    const done = await provisionYomitanStoreOffMainLoop(writeFixtureZip(), outPath, {}, { startupTimeoutMs: 20 });
    expect(done.termCount).toBe(2);
    expect(child.kill).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no-ack'));
  });

  it('parses here when no utility process can be forked', async () => {
    h.fork.mockImplementation(() => {
      throw new Error('no utility process');
    });
    const outPath = path.join(h.root, 'inproc.json');
    const done = await provisionYomitanStoreOffMainLoop(writeFixtureZip(), outPath);
    expect(done.termCount).toBe(2);
  });
});
