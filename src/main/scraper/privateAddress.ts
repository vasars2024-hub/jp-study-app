// The private-address (SSRF) guard.
//
// The HTTP Inspector, the source probes and a job's crawl requests fetch URLs a
// user (or a page a user pointed at) supplied. Left unchecked, that is a way to
// make the app talk to the machine it runs on or to the LAN behind it: a
// router admin page, a cloud metadata endpoint, a dev server. Unless the
// profile says `safety.allowPrivateNetwork`, those requests are refused.
//
// Never applied to the qBittorrent client or Seanime: those are first-party
// local services the user configured by address, and reaching them is the point.
//
// Hostnames are resolved with dns.lookup and every address checked before the
// request starts. A direct (non-proxied) guarded request also connects through
// `publicOnlyLookup`, which re-checks the addresses the socket actually uses, so
// a DNS-rebinding answer that changes between the two lookups is still refused.
// A proxied request is resolved by the proxy, out of our reach; http.ts checks
// the name again once the proxied response arrives and discards it when the
// name resolves privately by then (it cannot see the proxy's own lookup).
// A guarded crawl's robots.txt fetch is under the same guard as the crawl.

import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import net from 'node:net';

function ipv4Parts(address: string): number[] | null {
  if (net.isIPv4(address) === false) return null;
  return address.split('.').map((part) => Number(part));
}

function isPrivateIPv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

/** Whether the IPv4 address held in two 16-bit groups is private (only the high group matters). */
function v4FromGroups(high: number): boolean {
  return isPrivateIPv4(high >> 8, high & 0xff);
}

/**
 * An IPv6 address as eight 16-bit groups, or null when it is not one. Accepts
 * brackets, a zone id (`%eth0`), `::` and a dotted-quad tail.
 */
export function parseIPv6(address: string): number[] | null {
  let raw = address.trim().replace(/^\[|\]$/g, '').toLowerCase();
  const zone = raw.indexOf('%');
  if (zone >= 0) raw = raw.slice(0, zone);
  if (!net.isIPv6(raw)) return null;
  // A dotted-quad tail becomes its two hex groups.
  const lastColon = raw.lastIndexOf(':');
  const v4 = ipv4Parts(raw.slice(lastColon + 1));
  if (v4) {
    const hex = (hi: number, lo: number) => ((hi << 8) | lo).toString(16);
    raw = `${raw.slice(0, lastColon + 1)}${hex(v4[0], v4[1])}:${hex(v4[2], v4[3])}`;
  }
  const halves = raw.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] => (part ? part.split(':').map((g) => Number.parseInt(g, 16)) : []);
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const groups = [...head, ...new Array<number>(halves.length === 2 ? fill : 0).fill(0), ...rest];
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

function isPrivateIPv6(g: number[]): boolean {
  const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (zeros(0, 8)) return true; // ::
  if (zeros(0, 7) && g[7] === 1) return true; // ::1
  // IPv4-compatible `::a.b.c.d`, IPv4-mapped `::ffff:a.b.c.d` and SIIT
  // `::ffff:0:a.b.c.d` all carry an IPv4 address in the last 32 bits.
  if (zeros(0, 6) || (zeros(0, 5) && g[5] === 0xffff) || (zeros(0, 4) && g[4] === 0xffff && g[5] === 0)) {
    return v4FromGroups(g[6]);
  }
  // NAT64 well-known prefix 64:ff9b::/96 translates to the IPv4 in the tail.
  if (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6)) return v4FromGroups(g[6]);
  // 64:ff9b:1::/48 is the local-use NAT64 prefix: only ever a local network.
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  // 6to4 2002::/16: the IPv4 sits in bits 16-48.
  if (g[0] === 0x2002) return v4FromGroups(g[1]);
  // Teredo 2001:0::/32: the client IPv4 is the last 32 bits, inverted.
  if (g[0] === 0x2001 && g[1] === 0) return v4FromGroups(g[6] ^ 0xffff);
  const first = g[0];
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (deprecated)
  if ((first & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** Loopback, RFC 1918, link-local, CGNAT, unspecified, ULA, multicast and friends. */
export function isPrivateAddress(address: string): boolean {
  const raw = address.trim().replace(/^\[|\]$/g, '').toLowerCase();
  const v4 = ipv4Parts(raw);
  if (v4) return isPrivateIPv4(v4[0], v4[1]);
  const v6 = parseIPv6(raw);
  return v6 ? isPrivateIPv6(v6) : false;
}

/**
 * Whether `hostname` is, or resolves to, a private address. A name that does
 * not resolve answers false: the request itself then fails with the
 * resolver's own, more useful, message.
 */
export async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIP(host) || parseIPv6(host)) return isPrivateAddress(host);
  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    return addresses.some((entry) => isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

/** The error `publicOnlyLookup` fails a connection with. */
export class PrivateAddressError extends Error {
  readonly code = 'ERR_PRIVATE_ADDRESS';
}

/**
 * A `lookup` for `http.request`/`net.connect` that resolves every address and
 * fails the connection if any is private, so the socket can only reach the
 * addresses that were checked (closes the DNS-rebinding window).
 */
export const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const bad = list.find((entry) => isPrivateAddress(entry.address));
    if (bad || list.length === 0) {
      callback(
        new PrivateAddressError(
          `Refusing to fetch ${hostname}: it resolves to a private or local network address. `
            + 'Turn on "Allow private network" in the profile\'s Safety settings to reach it.',
        ),
        '',
        0,
      );
      return;
    }
    if (options.all) {
      (callback as unknown as (err: null, all: dns.LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};
