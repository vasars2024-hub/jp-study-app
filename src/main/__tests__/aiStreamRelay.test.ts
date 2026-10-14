// @vitest-environment node
/**
 * F9: chunks reach only the window that asked, tagged with its request id; a
 * closed window never fails the request; a cancel aborts by id, only for the
 * window that started it.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AI_STREAM_CHUNK_CHANNEL,
  AiRequestRegistry,
  aiStreamRequestId,
  aiStreamReset,
  aiStreamSink,
  aiStreamSinkFor,
} from '../aiStreamRelay';

function sender(destroyed = false) {
  return { send: vi.fn(), isDestroyed: vi.fn(() => destroyed) };
}

describe('aiStreamSink', () => {
  it('tags every chunk with the request id, on one channel', () => {
    const target = sender();
    const sink = aiStreamSink(target, 'req-1');
    sink?.('暑い');
    sink?.('');
    sink?.(' is');
    expect(target.send.mock.calls).toEqual([
      [AI_STREAM_CHUNK_CHANNEL, { requestId: 'req-1', text: '暑い' }],
      [AI_STREAM_CHUNK_CHANNEL, { requestId: 'req-1', text: ' is' }],
    ]);
  });

  it('is undefined (no streaming) without a window or an id', () => {
    expect(aiStreamSink(undefined, 'req-1')).toBeUndefined();
    expect(aiStreamSink(sender(), undefined)).toBeUndefined();
    expect(aiStreamSinkFor({ sender: sender() }, { requestId: 'bad id with spaces' })).toBeUndefined();
    expect(aiStreamSinkFor({ sender: sender() }, { requestId: 'ok_1' })).toBeTypeOf('function');
  });

  it('never throws for a closed window', () => {
    const closed = sender(true);
    aiStreamSink(closed, 'r')?.('x');
    expect(closed.send).not.toHaveBeenCalled();
    const throwing = { send: vi.fn(() => { throw new Error('gone'); }), isDestroyed: () => false };
    expect(() => aiStreamSink(throwing, 'r')?.('x')).not.toThrow();
    expect(() => aiStreamReset(throwing, 'r')).not.toThrow();
  });

  it('a reset marks the start of the next reply', () => {
    const target = sender();
    aiStreamReset(target, 'cs-1');
    expect(target.send).toHaveBeenCalledWith(AI_STREAM_CHUNK_CHANNEL, { requestId: 'cs-1', text: '', reset: true });
  });

  it('reads the id from a request', () => {
    expect(aiStreamRequestId({ requestId: 'ais-1' })).toBe('ais-1');
    expect(aiStreamRequestId({})).toBeUndefined();
    expect(aiStreamRequestId(null)).toBeUndefined();
  });
});

describe('AiRequestRegistry', () => {
  it('cancels by id, only for the window that started it', () => {
    const registry = new AiRequestRegistry();
    const controller = registry.begin('r1', 7);
    expect(registry.cancel('r1', 8)).toBe(false);
    expect(controller.signal.aborted).toBe(false);
    expect(registry.cancel('r1', 7)).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(registry.cancel('unknown', 7)).toBe(false);
  });

  it('a second request under the same id aborts the first; end forgets only its own', () => {
    const registry = new AiRequestRegistry();
    const first = registry.begin('r1', 1);
    const second = registry.begin('r1', 1);
    expect(first.signal.aborted).toBe(true);
    registry.end('r1', first);
    expect(registry.size).toBe(1);
    registry.end('r1', second);
    expect(registry.size).toBe(0);
  });

  it('a request without an id still gets a controller, but cannot be cancelled', () => {
    const registry = new AiRequestRegistry();
    const controller = registry.begin(undefined);
    expect(controller.signal.aborted).toBe(false);
    expect(registry.size).toBe(0);
  });
});
