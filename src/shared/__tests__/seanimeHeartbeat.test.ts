import { describe, expect, it } from 'vitest';
import {
  acknowledgeSeanimePong,
  advanceSeanimeHeartbeat,
  type SeanimeHeartbeatState,
} from '../seanime';

describe('Seanime heartbeat', () => {
  it('reconnects only after three heartbeat callbacks actually miss a pong', () => {
    let state: SeanimeHeartbeatState = acknowledgeSeanimePong();

    const first = advanceSeanimeHeartbeat(state);
    state = first.state;
    const second = advanceSeanimeHeartbeat(state);
    state = second.state;
    const third = advanceSeanimeHeartbeat(state);
    state = third.state;
    const fourth = advanceSeanimeHeartbeat(state);

    expect([
      first.shouldReconnect,
      second.shouldReconnect,
      third.shouldReconnect,
      fourth.shouldReconnect,
    ]).toEqual([false, false, false, true]);
  });

  it('a pong resets all accumulated misses', () => {
    const waiting = advanceSeanimeHeartbeat(
      advanceSeanimeHeartbeat(acknowledgeSeanimePong()).state,
    ).state;

    expect(waiting).toEqual({ awaitingPong: true, missedPongs: 1 });
    expect(acknowledgeSeanimePong()).toEqual({ awaitingPong: false, missedPongs: 0 });
    expect(advanceSeanimeHeartbeat(acknowledgeSeanimePong()).shouldReconnect).toBe(false);
  });
});
