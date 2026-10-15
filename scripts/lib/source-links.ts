import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Global unicast only; reject mapped IPv4, local, multicast and transition ranges.
  if (isIP(address) !== 6) return false;
  const [first, second] = address.split(':').map(v => parseInt(v || '0', 16));
  return first >= 0x2000 && first < 0x3ffe && first !== 0x2002 && !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}
export function sourceUrlIssue(value: string): string | null {
  try {
    if (value.trim() !== value || /[\x00-\x20\\]/.test(value)) return 'URL whitespace/backslash forbidden';
    const u = new URL(value), host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (u.protocol !== 'https:') return 'HTTPS required';
    if (u.username || u.password) return 'URL credentials are forbidden';
    if (u.port && u.port !== '443') return 'Only the standard HTTPS port is allowed';
    if ((!host.includes('.') && !isIP(host)) || /(?:^|\.)(?:localhost|local|internal|lan|home|onion)$/i.test(host)) return 'Public hostname required';
    if (isIP(host) && !publicAddress(host)) return 'Private/reserved address forbidden';
    if ([...u.searchParams.keys()].some(k => /^(?:api[_-]?key|api[_-]?token|access[_-]?token|password|secret)$/i.test(k))) return 'Credential query parameters forbidden';
    return null;
  } catch { return 'Invalid URL'; }
}
interface Address { address: string; family: number }
interface Headers { status: number; location?: string }
export interface LinkDependencies {
  resolve: (host: string, signal: AbortSignal) => Promise<Address[]>;
  request: (url: URL, method: 'HEAD' | 'GET', address: Address, signal: AbortSignal) => Promise<Headers>;
}
const live: LinkDependencies = {
  async resolve(host, signal) {
    if (isIP(host)) return [{ address: host, family: isIP(host) }];
    const resolver = new Resolver({ timeout: 2500, tries: 1 });
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const rows = await Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]);
      return rows.flatMap((row, i) => row.status === 'fulfilled' ? row.value.map(address => ({ address, family: i === 0 ? 4 : 6 })) : []);
    } finally { signal.removeEventListener('abort', cancel); }
  },
  request(url, method, address, signal) {
    return new Promise((resolve, reject) => {
      // Pin the validated DNS answer, preserving TLS hostname verification.
      // No proxy environment, cookies, auth, automatic redirects or socket reuse.
      const req = https.request(url, {
        method, agent: false, signal, family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: { 'user-agent': 'GameForge-source-check/1.0', accept: '*/*' },
      }, res => {
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
        res.destroy(); // Check headers only; never download an unbounded body.
      });
      req.on('error', reject); req.end();
    });
  },
};
export interface LinkResult { url: string; ok: boolean; code: string; detail: string; checkedAt: number; cached?: boolean }
export async function checkSourceLink(value: string, deps = live, timeoutMs = 8000): Promise<LinkResult> {
  const checkedAt = Date.now();
  const result = (ok: boolean, code: string, detail: string): LinkResult => ({ url: value, ok, code, detail, checkedAt });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    let current = new URL(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const issue = sourceUrlIssue(current.href);
      if (issue) return result(false, 'unsafe-url', issue);
      const addresses = await deps.resolve(current.hostname.replace(/^\[|\]$/g, ''), signal);
      if (signal.aborted) return result(false, 'timeout', 'The 8-second per-source deadline expired; retry or use a recent cached result');
      if (!addresses.length) return result(false, 'dns', 'No DNS answer; retry after checking the hostname/network');
      if (addresses.some(a => !publicAddress(a.address))) return result(false, 'unsafe-dns', 'DNS resolved to a private/reserved address; no request sent');
      let response = await deps.request(current, 'HEAD', addresses[0], signal);
      if (response.status === 405 || response.status === 501) response = await deps.request(current, 'GET', addresses[0], signal);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.location || redirects === 3) return result(false, 'redirect', 'Missing Location or more than 3 redirects');
        current = new URL(response.location, current);
        continue;
      }
      if (response.status >= 200 && response.status < 300) return result(true, 'reachable', 'HTTPS endpoint responded; this does not verify the factual claim');
      return result(false, 'http', `HTTP ${response.status}; login, rate limiting or bot protection may need human investigation`);
    }
    return result(false, 'redirect', 'Redirect limit reached');
  } catch {
    return result(false, signal.aborted ? 'timeout' : 'network', signal.aborted ? 'Source deadline expired; retry later' : 'DNS/TLS/network error; no verification status was changed');
  }
}
export async function cachedSourceLink(value: string, cache: Record<string, LinkResult>, refresh = false, check = checkSourceLink): Promise<LinkResult> {
  const hit = cache[value], now = Date.now();
  const ttl = hit?.ok ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000;
  if (!refresh && hit?.url === value && typeof hit.ok === 'boolean' && typeof hit.checkedAt === 'number' && now >= hit.checkedAt && now - hit.checkedAt < ttl) return { ...hit, cached: true };
  const result = await check(value); cache[value] = result; return result;
}
