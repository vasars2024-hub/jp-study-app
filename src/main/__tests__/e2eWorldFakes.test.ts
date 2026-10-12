// @vitest-environment node
/**
 * The fakes the headless real-app harness (tools/e2e/world.cjs) puts around the app:
 * the shared fake AnkiConnect behind a real socket, and the texthooker WebSocket. They
 * stand in for the owner's Anki and Textractor during every run, so what they answer is
 * pinned here against the real wire formats — over real loopback sockets, ephemeral
 * ports only (never 8765 / 6677).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeAnkiServer, type FakeAnkiServer } from './e2eFixtures/fakeAnkiServer';
import { startTexthooker, type TexthookerServer } from './e2eFixtures/texthooker';

let anki: FakeAnkiServer | null = null;
let hook: TexthookerServer | null = null;

afterEach(async () => {
  await anki?.close();
  await hook?.close();
  anki = null;
  hook = null;
});

async function call(url: string, action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(url, { method: 'POST', body: JSON.stringify({ action, version: 6, params }) });
  return (await res.json()) as { result: unknown; error: string | null };
}

describe('fake AnkiConnect over HTTP', () => {
  it('answers a mine the way AnkiConnect does: deck, note type, note, duplicate refusal', async () => {
    anki = await startFakeAnkiServer();
    expect(anki.port).not.toBe(8765);
    expect((await call(anki.url, 'version')).result).toBe(6);
    expect((await call(anki.url, 'deckNames')).result).toEqual(['Default']);
    await call(anki.url, 'createDeck', { deck: 'JP Study::N2 Vocab' });
    await call(anki.url, 'createModel', { modelName: 'Gum JA', inOrderFields: ['Term', 'Reading'], css: '', cardTemplates: [] });
    expect((await call(anki.url, 'modelFieldNames', { modelName: 'Gum JA' })).result).toEqual(['Term', 'Reading']);
    const note = { deckName: 'JP Study::N2 Vocab', modelName: 'Gum JA', fields: { Term: '猫', Reading: 'ねこ' }, tags: ['jp-study-app'], options: { allowDuplicate: false } };
    expect((await call(anki.url, 'canAddNotes', { notes: [note] })).result).toEqual([true]);
    const added = await call(anki.url, 'addNote', { note });
    expect(typeof added.result).toBe('number');
    expect((await call(anki.url, 'canAddNotes', { notes: [note] })).result).toEqual([false]);
    expect((await call(anki.url, 'addNote', { note })).error).toMatch(/duplicate/);
    expect((await call(anki.url, 'addNote', { note: { ...note, deckName: 'Nope', fields: { Term: '犬' } } })).error).toMatch(/deck was not found/);
    const stored = anki.fake.notes.get(added.result as number)!;
    expect(stored.fields).toEqual({ Term: '猫', Reading: 'ねこ' });
    expect(anki.fake.cards.get(stored.cards[0])?.deckName).toBe('JP Study::N2 Vocab');
    // The review-sync half is the shared fake's: an answer moves the card.
    const ans = await call(anki.url, 'answerCards', { answers: [{ cardId: stored.cards[0], ease: 3 }] });
    expect(ans.result).toEqual([true]);
    expect(anki.fake.cards.get(stored.cards[0])).toMatchObject({ reps: 1, type: 2 });
    // `multi` batches, and an unknown action answers like an AnkiConnect that lacks it.
    const multi = await call(anki.url, 'multi', { actions: [{ action: 'version' }, { action: 'guiBrowse' }] });
    expect(multi.result).toEqual([{ result: 6, error: null }, { result: null, error: 'unsupported action' }]);
  });

  it('is unreachable at the transport when "Anki is closed"', async () => {
    anki = await startFakeAnkiServer();
    anki.fake.down = true;
    await expect(call(anki.url, 'version')).rejects.toThrow();
  });
});

describe('texthooker WebSocket fixture', () => {
  it('accepts a real WebSocket client and delivers hooked lines as text frames', async () => {
    hook = await startTexthooker();
    expect(hook.port).not.toBe(6677);
    const ws = new WebSocket(hook.url);
    const got: string[] = [];
    ws.addEventListener('message', (e) => got.push(String(e.data)));
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
    await hook.waitForClient(1, 2000);
    const long = 'あ'.repeat(200); // > 125 bytes: the 16-bit length form
    expect(hook.send('【小町】おはようございます。')).toBe(1);
    hook.send(JSON.stringify({ sentence: '今日は雨ですね。' }));
    hook.send(long);
    for (let i = 0; i < 50 && got.length < 3; i++) await new Promise((r) => setTimeout(r, 20));
    expect(got).toEqual(['【小町】おはようございます。', '{"sentence":"今日は雨ですね。"}', long]);
    ws.close();
    for (let i = 0; i < 50 && hook.clients() > 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(hook.clients()).toBe(0);
  });
});
