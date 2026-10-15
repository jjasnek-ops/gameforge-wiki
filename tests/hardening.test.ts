import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertPublicData, productionFiles, secretFindings, sensitivePath } from '../scripts/lib/security';
import { gameSchema, sourceSchema, evidenceErrors } from '../scripts/lib/gameforge';
import { integrationVars } from '../scripts/lib/configure-game';
import { checkSourceLink, cachedSourceLink, sourceUrlIssue, publicAddress, type LinkDependencies } from '../scripts/lib/source-links';
import { auditIndexSets, headerNoindex, indexPolicy, robotsBlocked } from '../scripts/lib/seo-audit';

const root = fileURLToPath(new URL('../', import.meta.url));
const game = gameSchema.parse({ gameName: 'Safety Fixture', siteName: 'Safety Fixture Wiki', shortName: 'Safety', domain: 'safety.example', description: 'Fictional safety fixture for deterministic security and search indexing regression tests.', platform: 'Steam', genre: 'Fixture', developer: 'Fixture', officialUrl: 'https://safety.example/official', themeColor: '#123456', supportedLanguages: ['en', 'ja', 'pt-br'], featureFlags: { multilingual: true }, navigation: [{ key: 'guides2', label: 'Guides' }], homepage: { intro: 'Fictional verification fixture.' } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gameforge-hardening-'));
const git = (dir: string, args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const token = ['random', 'CREDENTIAL', 'abc012345678901234567890123456789'].join('');

describe('sensitive configuration, production copy and Git commit safety', () => {
  it('retains public IDs but rejects credentials and the ambiguous old beacon field', () => {
    const configured = gameSchema.parse({ ...game, featureFlags: { analytics: true }, analytics: { ga4: 'G-FIXTURE123', cloudflareBeaconToken: '0123456789abcdef0123456789abcdef' } });
    expect(integrationVars(configured).PUBLIC_GA_ID).toBe('G-FIXTURE123');
    expect(integrationVars(configured).PUBLIC_CF_BEACON_TOKEN).toBe(configured.analytics.cloudflareBeaconToken);
    expect(gameSchema.safeParse({ ...game, analytics: { cloudflareToken: token } }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, analytics: { cloudflareBeaconToken: token } }).success).toBe(false);
    expect(() => assertPublicData({ notes: `${['CF', 'API', 'TOKEN'].join('_')}=${token}` }, 'facts')).toThrow('sensitive data refused');
    expect(() => assertPublicData({ analytics: configured.analytics }, 'public')).not.toThrow();
  });
  it('detects provider signatures and key material without echoing their values', () => {
    const signature = ['ghp', '_', 'A'.repeat(36)].join('');
    const key = ['-----BEGIN ', 'PRIVATE KEY-----', '\n', 'a'.repeat(48)].join('');
    for (const raw of [signature, key, `CLOUDFLARE_API_TOKEN=${token}`, `${['pass', 'word'].join('')}='actual-short-value'`]) {
      const issues = secretFindings(raw);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.join('')).not.toContain(token);
      expect(issues.join('')).not.toContain(signature);
    }
    expect(secretFindings('CLOUDFLARE_API_TOKEN=\nPUBLIC_GA_ID=G-TEST123\napiToken: string;')).toEqual([]);
    expect(sensitivePath('src/.env.preview')).toBe(true);
    expect(sensitivePath('.dev.vars.local')).toBe(true);
  });
  it('copies only tracked production files, omitting nested credentials and personal products', () => {
    const dir = tmp();
    try {
      git(dir, ['init', '-q']);
      for (const [file, text] of Object.entries({ 'package.json': '{}', 'src/config/site.ts': 'export const test = true;', 'src/.env.preview': 'LOCAL=secret', 'personal.txt': 'private notes', 'scratch.csv': 'personal,data', 'tools/local.ts': 'tooling' })) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), text);
      }
      git(dir, ['add', '.']);
      fs.writeFileSync(path.join(dir, 'src/config/untracked.ts'), 'personal working file');
      expect(productionFiles(dir).sort()).toEqual(['package.json', 'src/config/site.ts']);
      fs.writeFileSync(path.join(dir, 'src/config/site.ts'), `export const apiToken = '${token}';`);
      expect(() => productionFiles(dir)).toThrow('sensitive data refused');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('the actual pre-commit hook scans staged bytes, even when the working copy is clean', () => {
    const dir = tmp();
    try {
      git(dir, ['init', '-q']); git(dir, ['config', 'user.name', 'Local fixture']); git(dir, ['config', 'user.email', 'fixture@example.invalid']);
      git(dir, ['config', 'core.hooksPath', path.join(root, '.githooks').replace(/\\/g, '/')]);
      const file = path.join(dir, 'config.json');
      fs.writeFileSync(file, JSON.stringify({ apiToken: token })); git(dir, ['add', 'config.json']);
      fs.writeFileSync(file, '{}');
      const blocked = spawnSync('git', ['commit', '-qm', 'must be blocked'], { cwd: dir, encoding: 'utf8' });
      expect(blocked.status).not.toBe(0);
      expect(blocked.stderr + blocked.stdout).toContain('Sensitive information check failed');
      expect(blocked.stderr + blocked.stdout).not.toContain(token);
      git(dir, ['add', 'config.json']);
      expect(() => git(dir, ['commit', '-qm', 'safe fixture'])).not.toThrow();
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('source reachability is separate from factual review', () => {
  const deps = (status = 200): LinkDependencies => ({ resolve: vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]), request: vi.fn(async () => ({ status })) });
  it.each(['http://safety.example', 'https://user:pass@safety.example', 'https://localhost', 'https://127.0.0.1', 'https://[::ffff:127.0.0.1]', 'https://safety.example:8443', `https://safety.example?${['api', 'key'].join('_')}=hidden`])('rejects unsafe source URL %s', url => {
    expect(sourceUrlIssue(url)).not.toBeNull();
    expect(sourceSchema.safeParse({ id: 'x', url, title: 'Fixture', kind: 'official', verified: true, verifiedAt: '2026-01-01', version: 'fixture', notes: 'Fixture' }).success).toBe(false);
  });
  it('blocks private DNS and HTTPS-to-HTTP/private redirects before sending a request there', async () => {
    const privateDns = deps(); privateDns.resolve = vi.fn(async () => [{ address: '10.0.0.1', family: 4 }]);
    expect((await checkSourceLink('https://safety.example', privateDns)).code).toBe('unsafe-dns');
    expect(privateDns.request).not.toHaveBeenCalled();
    for (const location of ['http://safety.example', 'https://169.254.169.254/latest']) {
      const redirect = deps(); redirect.request = vi.fn(async () => ({ status: 302, location }));
      expect((await checkSourceLink('https://safety.example', redirect)).code).toBe('unsafe-url');
      expect(redirect.request).toHaveBeenCalledTimes(1);
    }
    expect(publicAddress('192.168.1.1')).toBe(false);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('falls back from HEAD to bounded GET, explains HTTP failure and limits redirects', async () => {
    const check = deps(); check.request = vi.fn().mockResolvedValueOnce({ status: 405 }).mockResolvedValueOnce({ status: 200 });
    expect((await checkSourceLink('https://safety.example', check)).ok).toBe(true);
    expect(vi.mocked(check.request).mock.calls.map(c => c[1])).toEqual(['HEAD', 'GET']);
    expect((await checkSourceLink('https://safety.example', deps(403))).detail).toContain('HTTP 403');
    const loop = deps(); loop.request = vi.fn(async () => ({ status: 302, location: '/' }));
    expect((await checkSourceLink('https://safety.example', loop)).code).toBe('redirect');
    expect(loop.request).toHaveBeenCalledTimes(4);
  });
  it('times out during connection and does not mark a source as verified', async () => {
    const check = deps();
    check.request = (_u, _m, _a, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    const result = await checkSourceLink('https://safety.example', check, 30);
    expect(result.code).toBe('timeout'); expect(result.ok).toBe(false);
    expect(evidenceErrors({ draft: false, evidenceStatus: 'verified' }, [])).not.toEqual([]);
    expect(evidenceErrors({ draft: true }, [])).toEqual([]);
  });
  it('uses recent cache entries and refreshes expired/future entries', async () => {
    const url = 'https://safety.example', check = vi.fn(async () => ({ url, ok: true, checkedAt: Date.now(), code: 'reachable', detail: 'Not proof' }));
    const cache = {};
    await cachedSourceLink(url, cache, false, check); await cachedSourceLink(url, cache, false, check);
    expect(check).toHaveBeenCalledTimes(1);
    await cachedSourceLink(url, cache, true, check); expect(check).toHaveBeenCalledTimes(2);
    await cachedSourceLink(url, { [url]: { ...await check(), checkedAt: Date.now() - 25 * 3600000 } }, false, check);
    expect(check).toHaveBeenCalledTimes(4);
    await cachedSourceLink(url, { [url]: { ...await check(), checkedAt: Date.now() + 3600000 } }, false, check);
    expect(check).toHaveBeenCalledTimes(6);
    const failure = { url, ok: false, checkedAt: Date.now() - 60000, code: 'network', detail: 'Temporary failure' };
    expect((await cachedSourceLink(url, { [url]: failure }, false, check)).cached).toBe(true);
    expect(check).toHaveBeenCalledTimes(6);
    await cachedSourceLink(url, { [url]: { ...failure, checkedAt: Date.now() - 16 * 60000 } }, false, check);
    expect(check).toHaveBeenCalledTimes(7);
  });
  it('records per-claim source mappings without bypassing article review/version checks', () => {
    const source = { id: 'official', url: 'https://safety.example', title: 'Fixture', kind: 'official' as const, verified: true, verifiedAt: '2026-01-01', version: 'v1', notes: 'Fixture' };
    const article = { reviewedBy: 'Human fixture', reviewedAt: '2026-01-02', gameVersion: 'v1', evidenceStatus: 'verified', sourceIds: ['official'], claims: [{ id: 'platform', statement: 'Fictional statement', sourceIds: ['official'] }] };
    expect(evidenceErrors(article, [source])).toEqual([]);
    expect(evidenceErrors({ ...article, claims: [{ ...article.claims[0], sourceIds: ['unknown'] }] }, [source])).toContain('Claim platform must cite the article sources');
    expect(evidenceErrors({ ...article, gameVersion: 'v2' }, [source])).toContain('Source version differs from gameVersion');
  });
});

describe('bidirectional indexing and translation policy', () => {
  const origin = 'https://safety.example';
  const xml = (routes: string[]) => `<urlset>${routes.map(r => `<url><loc>${origin}${r}</loc></url>`).join('')}</urlset>`;
  const pages = () => new Map([['/', { html: '', indexed: true }], ['/ja/', { html: '', indexed: false }], ['/404.html', { html: '', indexed: false }]]);
  const audit = (sitemaps: string[], map = pages(), robots = 'User-agent: *\nAllow: /') => auditIndexSets({ origin, pages: map, sitemaps, robots, testOnly: false });
  it('requires every indexed page in the sitemap and rejects every extraneous noindex URL', () => {
    expect(audit([xml(['/'])]).errors).toEqual([]);
    expect(audit([xml([])]).errors.join()).toContain('Indexable page missing');
    expect(audit([xml(['/', '/ja/'])]).errors.join()).toContain('Sitemap points at missing/noindex');
    expect(audit([xml(['/', '/'])]).errors.join()).toContain('Duplicate sitemap URL');
  });
  it('rejects noindex/untranslated hreflang in both HTML and sitemap, and wrong language labels', () => {
    const map = pages(); map.get('/')!.html = `<link rel="alternate" hreflang="ja" href="${origin}/ja/">`;
    expect(audit([xml(['/'])], map).errors.join()).toContain('hreflang points at missing/noindex');
    const bad = `<urlset><url><loc>${origin}/</loc><xhtml:link rel="alternate" hreflang="ja" href="${origin}/ja/"/></url></urlset>`;
    expect(audit([bad]).errors.join()).toContain('hreflang points at missing/noindex');
    const wrong = new Map([['/', { indexed: true, html: `<link rel="alternate" hreflang="ja" href="${origin}/">` }]]);
    expect(auditIndexSets({ origin, pages: wrong, sitemaps: [xml(['/'])], robots: '', testOnly: false, localeFor: () => 'en' }).errors.join()).toContain('language does not match');
  });
  it('honors robots allow/disallow specificity, bot groups and Cloudflare header noindex', () => {
    expect(audit([xml(['/'])], pages(), 'User-agent: *\nDisallow: /').errors.join()).toContain('blocked by robots');
    expect(robotsBlocked('User-agent: *\nDisallow: /\nAllow: /guides/','/guides/x/')).toBe(false);
    expect(robotsBlocked('User-agent: *\nAllow: /\nUser-agent: googlebot\nDisallow: /','/', 'googlebot')).toBe(true);
    expect(headerNoindex('/*\n  X-Robots-Tag: NOINDEX, nofollow', '/')).toBe(true);
  });
  it('derives fallback, empty collection and translated-region routes from real source files', () => {
    const article = { file: path.join(root, 'src/content/wiki/en/guides2/start.mdx'), data: { draft: false, tags: [] } };
    const policy = indexPolicy(root, game, [article], new Set());
    expect(policy.expected('/ja/')).toBe(false); expect(policy.expected('/ja/guides2/start/')).toBe(false);
    expect(policy.expected('/ja/guides2/')).toBe(false); expect(policy.expected('/ja/about/')).toBe(false);
    expect(policy.expected('/en/about/')).toBe(false); expect(policy.expected('/tags/')).toBe(false);
    expect(policy.required.has('/guides2/start/')).toBe(true);
    const translated = { ...article, file: path.join(root, 'src/content/wiki/pt-br/guides2/start.mdx') };
    const withTranslation = indexPolicy(root, game, [article, translated], new Set());
    expect(withTranslation.expected('/pt-br/guides2/start/')).toBe(true);
    expect(withTranslation.expected('/pt-br/')).toBe(false);
    expect(withTranslation.split('/pt-br/guides2/start/').locale).toBe('pt-br');
  });
});
