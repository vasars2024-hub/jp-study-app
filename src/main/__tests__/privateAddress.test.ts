// @vitest-environment node
//
// The private-address guard against IPv6 forms that embed an IPv4 address
// (mapped, compatible, NAT64, 6to4, Teredo) and against DNS rebinding.

import dns from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPrivateAddress,
  parseIPv6,
  publicOnlyLookup,
  resolvesToPrivateAddress,
} from '../scraper/privateAddress';

describe('isPrivateAddress (IPv6)', () => {
  it.each([
    '[::ffff:127.0.0.1]',
    '::ffff:7f00:1',
    '[::ffff:7f00:1]',
    '::ffff:10.0.0.1',
    '::ffff:0:7f00:1',
    '64:ff9b::7f00:1',
    '64:ff9b::10.0.0.1',
    '64:ff9b:1::8.8.8.8',
    '2002:7f00:1::',
    '2002:c0a8:0101::1',
    '2001:0:4136:e378:8000:63bf:80ff:fffe',
    '::127.0.0.1',
    '::7f00:1',
    '::',
    '::1',
    '0:0:0:0:0:0:0:1',
    'fe80::1%eth0',
    '[fe80::1%25eth0]',
    'fd00::1',
    'fc00::1',
    'fec0::1',
    'ff02::1',
  ])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each([
    '2606:4700::1111',
    '2002:0808:0808::1',
    '64:ff9b::8.8.8.8',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '2001:0:4136:e378:8000:63bf:f7f7:f7f7',
    '8.8.8.8',
    'not-an-ip',
  ])('%s is public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it('expands :: and dotted tails', () => {
    expect(parseIPv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(parseIPv6('1:2:3:4:5:6:1.2.3.4')).toEqual([1, 2, 3, 4, 5, 6, 0x102, 0x304]);
    expect(parseIPv6('fe80::1%eth0')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6('1.2.3.4')).toBeNull();
  });

  it('applies to URL-normalised hostnames', async () => {
    const host = new URL('http://[::ffff:127.0.0.1]/').hostname;
    expect(host).toBe('[::ffff:7f00:1]');
    expect(await resolvesToPrivateAddress(host)).toBe(true);
  });
});

describe('publicOnlyLookup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function answer(addresses: dns.LookupAddress[]) {
    vi.spyOn(dns, 'lookup').mockImplementation(((
      _host: string,
      _options: unknown,
      callback: (error: null, addresses: dns.LookupAddress[]) => void,
    ) => {
      callback(null, addresses);
    }) as unknown as typeof dns.lookup);
  }

  function run(all: boolean): Promise<{ error: NodeJS.ErrnoException | null; result: unknown }> {
    return new Promise((resolve) => {
      publicOnlyLookup('rebind.example', { all }, (error, address, family) => {
        resolve({ error, result: all ? address : { address, family } });
      });
    });
  }

  it('refuses when any resolved address is private', async () => {
    answer([
      { address: '93.184.216.34', family: 4 },
      { address: '::ffff:7f00:1', family: 6 },
    ]);
    const { error } = await run(false);
    expect(error?.code).toBe('ERR_PRIVATE_ADDRESS');
  });

  it('passes public addresses through, single and all', async () => {
    answer([{ address: '93.184.216.34', family: 4 }]);
    expect(await run(false)).toEqual({ error: null, result: { address: '93.184.216.34', family: 4 } });
    expect(await run(true)).toEqual({ error: null, result: [{ address: '93.184.216.34', family: 4 }] });
  });
});
