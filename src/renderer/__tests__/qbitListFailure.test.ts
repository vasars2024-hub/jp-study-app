/**
 * Resilience audit #13, renderer half: a transfer list main could not read
 * reaches the page as a thrown `qbit-list-failed:<code>` (the IPC boundary
 * keeps only the message). The page keeps its last rows and shows the reason
 * in the UI language instead of "no transfers".
 */
import { describe, expect, it } from 'vitest';
import { qbitListFailureKey } from '../components/scraper/data/qbitActions';

const overIpc = (message: string): Error =>
  new Error(`Error invoking remote method 'scraper:qbitTransfers': Error: ${message}`);

describe('qbitListFailureKey', () => {
  it('maps each typed failure to its translated line, through the IPC wrapper', () => {
    expect(qbitListFailureKey(overIpc('qbit-list-failed:offline connect ECONNREFUSED'))).toBe('scrApp.qbitList.offline');
    expect(qbitListFailureKey(overIpc('qbit-list-failed:auth Forbidden'))).toBe('scrApp.qbitList.auth');
    expect(qbitListFailureKey(overIpc('qbit-list-failed:service-error HTTP 500'))).toBe('scrApp.qbitList.service');
  });

  it('leaves any other error to the generic line', () => {
    expect(qbitListFailureKey(new Error('something else'))).toBeNull();
  });
});
