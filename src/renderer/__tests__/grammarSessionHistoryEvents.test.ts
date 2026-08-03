// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  onSessionHistoryChanged,
  saveSessionHistory,
} from '../grammarSessionHistory';

it('notifies Study when a Grammar session history save completes', () => {
  const listener = vi.fn();
  const unsubscribe = onSessionHistoryChanged(listener);
  saveSessionHistory([]);
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  saveSessionHistory([]);
  expect(listener).toHaveBeenCalledTimes(1);
});
