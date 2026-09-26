/**
 * The sentence a VNDB failure is shown as, by typed code (resilience audit #9).
 *
 * Main returns `errorCode` from `vndbFailureCode`; the renderer resolves the
 * key here in the UI language. The raw error — a native fetch message, an
 * English HTTP sentence — is never the message.
 */
import type { FailureCode } from './resilience';

const VNDB_FAILURE_KEYS: Partial<Record<FailureCode, string>> = {
  offline: 'vnSource.error.offline',
  timeout: 'vnSource.error.timeout',
  'rate-limited': 'vnSource.error.rateLimited',
  'service-error': 'vnSource.error.service',
  auth: 'vnSource.error.service',
};

export function vndbFailureKey(code: FailureCode | undefined, fallback = 'vnSource.msg.searchFailed'): string {
  return (code && VNDB_FAILURE_KEYS[code]) || fallback;
}
