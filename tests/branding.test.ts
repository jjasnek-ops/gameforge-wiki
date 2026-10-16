import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { gameSchema } from '../scripts/lib/gameforge';
import { integrationVars } from '../scripts/lib/configure-game';
import { productionFile } from '../scripts/lib/security';
import { auditBranding, deploymentPathAllowed, publicTextIssues, publishNotices, recordBrandAssets, validateNotices, NOTICE_FILES } from '../scripts/lib/branding';
import { BRAND_ASSETS } from '../scripts/lib/branding-policy';

const root = fileURLToPath(new URL('../', import.meta.url));
const game = gameSchema.parse({ gameName: 'Alpha Island', siteName: 'Alpha Island Wiki', shortName: 'Alpha', domain: 'alpha-island.example', description: 'An explicitly fictional independent game site used only for deterministic brand isolation tests.', platform: 'Steam', genre: 'Fixture', developer: 'Fixture authors', officialUrl: 'https://alpha-island.example/official', themeColor: '#123456', supportedLanguages: ['en'], contactEmail: 'alpha@alpha-island.example', navigation: [{ key: 'guides', label: 'Guides' }], homepage: { intro: 'Independent fictional game reference.' } });
const peer = gameSchema.parse({ ...game, gameName: 'Beta Harbor', siteName: 'Beta Harbor Wiki', shortName: 'Beta', domain: 'beta-harbor.example', contactEmail: 'beta@beta-harbor.example', analytics: { ga4: 'G-BETA123' } });
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-test-'));
  fs.mkdirSync(path.join(dir, 'licenses')); fs.mkdirSync(path.join(dir, 'dist'));
  for (const name of ['manifest.json', ...NOTICE_FILES]) fs.copyFileSync(path.join(root, 'licenses', name), path.join(dir, 'licenses', name));
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'));
  for (const rel of BRAND_ASSETS) {
    const file = path.join(dir, 'public', rel);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${game.siteName}: ${rel}`);
    const dest = path.join(dir, 'dist', rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(file, dest);
  }
  fs.writeFileSync(path.join(dir, 'dist/index.html'), `<html><head><meta property="og:site_name" content="${game.siteName}"><script type="application/ld+json">{"@type":"Organization","name":"${game.siteName}"}</script></head><body>${game.siteName}<a href="mailto:${game.contactEmail}">Contact</a></body></html>`);
  fs.writeFileSync(path.join(dir, 'dist/manifest.json'), JSON.stringify({ name: game.siteName, short_name: game.shortName }));
  publishNotices(dir); recordBrandAssets(dir, game);
  return dir;
}
const remove = (dir: string) => { if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith('branding-test-')) throw new Error('Unsafe fixture cleanup'); fs.rmSync(dir, { recursive: true, force: true }); };

describe('public identity and internal factory separation', () => {
  it.each(['AnvilWiki', 'PNGTRID', 'anvil.wiki', 'GameForge', 'gameforge-wiki', 'Anvil Quest', 'Forge Master Kael'])('rejects upstream/template identity %s', brand => {
    expect(publicTextIssues(`<meta name="description" content="${brand}">`, 'index.html', game).length).toBeGreaterThan(0);
  });
  it('checks JS/CSS, escaped URLs and internal workflow text', () => {
    expect(publicTextIssues('const link = "https://github.com/PNGTRID/AnvilWiki"', '_astro/app.js', game).length).toBeGreaterThan(0);
    expect(publicTextIssues('/* GameForge */ body{}', '_astro/app.css', game).length).toBeGreaterThan(0);
    expect(publicTextIssues('"\\u0041nvilWiki"', '_astro/app.js', game).length).toBeGreaterThan(0);
    expect(publicTextIssues('pnpm create-game --config game.config.json', 'llms.txt', game).join()).toContain('workflow');
    expect(publicTextIssues('CLOUDFLARE_API_TOKEN', '_astro/app.js', game).join()).toContain('Private deployment');
  });
  it('allows only the exact explicitly requested template credit, never unrelated leaked metadata', () => {
    const credit = '<a data-template-credit="true" href="https://github.com/jjasnek-ops/gameforge-wiki">Built with GameForge Wiki</a>';
    expect(publicTextIssues(credit, 'index.html', game).join()).toContain('Unexpected template credit');
    const optIn = gameSchema.parse({ ...game, branding: { showTemplateCredit: true } });
    expect(publicTextIssues(credit, 'index.html', optIn)).toEqual([]);
    expect(publicTextIssues(credit + '<title>AnvilWiki</title>', 'index.html', optIn).join()).toContain('Internal/demo');
  });
  it('isolates foreign contacts/stats and blanks ambient sponsor values unless explicitly configured', () => {
    expect(publicTextIssues(peer.contactEmail!, 'index.html', game, [peer]).join()).toContain('Another site');
    expect(publicTextIssues(peer.analytics.ga4!, '_astro/app.js', game, [peer]).join()).toContain('Another site');
    expect(publicTextIssues('<a href="mailto:unconfigured@example.invalid">Contact</a>', 'contact/index.html', game).join()).toContain('Contact address');
    expect(integrationVars(game).PUBLIC_SPONSOR_URL).toBe('');
    const configured = gameSchema.parse({ ...game, featureFlags: { affiliates: true }, advertising: { sponsorUrl: 'https://alpha-island.example/support' } });
    expect(integrationVars(configured).PUBLIC_SPONSOR_URL).toBe(configured.advertising.sponsorUrl);
    const intentional = gameSchema.parse({ ...game, analytics: { ga4: peer.analytics.ga4 } });
    expect(publicTextIssues(peer.analytics.ga4!, '_astro/app.js', intentional, [peer])).toEqual([]);
  });
  it('does not copy manuals, agent rules, research or demonstration media into the independent source', () => {
    for (const rel of ['docs/handbook/en/ai-ops.md', '.agent/skills/anvil-find-keywords/SKILL.md', 'AGENTS.md', 'README.md', 'fixtures/games/steam/facts.json', 'src/content/wiki/en/guides/demo.mdx', 'src/assets/covers/demo.png', 'public/images/research.png', 'public/images/showcase/demo.webp', 'scripts/create-game.ts', 'scripts/new-research-tool.ts', 'scripts/lib/private-experiment.ts']) expect(productionFile(rel), rel).toBe(false);
    for (const rel of ['LICENSE', 'licenses/site-software.txt', 'licenses/manifest.json', 'scripts/fonts/Lato-Regular.ttf', 'pnpm-workspace.yaml', 'src/components/home/HomePage.astro']) expect(productionFile(rel), rel).toBe(true);
  });
  it('permits only necessary production route/resource families', () => {
    for (const rel of ['index.html', 'guides/start/index.html', '_astro/style.css', 'pagefind/pagefind-ui.js', 'licenses/site-software.txt']) expect(deploymentPathAllowed(rel, game), rel).toBe(true);
    for (const rel of ['docs/research.html', 'research/index.html', '.agent/rules.json', '_astro/app.js.map', '.env.production', '.well-known/anvilwiki-deploy.txt', 'landing/index.html', 'images/research.json', 'fixtures/games/steam/facts.json']) expect(deploymentPathAllowed(rel, game), rel).toBe(false);
  });
});

describe('copyright integrity and actual production audit', () => {
  it('preserves the original MIT text and dependency notices without treating them as promotion', () => {
    expect(validateNotices(root)).toEqual([]);
    const dir = fixture();
    try { expect(auditBranding(dir, game).errors).toEqual([]); }
    finally { remove(dir); }
  });
  it('does not remove genuine copyright comments', () => {
    expect(publicTextIssues('/* Copyright (c) 2026 AnvilWiki contributors\nSPDX-License-Identifier: MIT */', '_astro/code.js', game)).toEqual([]);
    expect(publicTextIssues('/* Copyright (c) 2026 AnvilWiki contributors\nBuilt with AnvilWiki */', '_astro/code.js', game).length).toBeGreaterThan(0);
  });
  it('keeps the game developer distinct from the wiki publisher in structured data', () => {
    const data = (type: string, name: string) => `<script type="application/ld+json">${JSON.stringify({ '@type': type, publisher: { '@type': 'Organization', name } })}</script>`;
    expect(publicTextIssues(data('VideoGame', game.developer), 'index.html', game)).toEqual([]);
    expect(publicTextIssues(data('Article', game.developer), 'index.html', game).join()).toContain('Wrong JSON-LD');
    expect(publicTextIssues(data('VideoGame', peer.siteName), 'index.html', game).join()).toContain('Wrong JSON-LD');
  });
  it('rejects removed/changed licenses instead of excluding any file called LICENSE', () => {
    const dir = fixture();
    try {
      fs.appendFileSync(path.join(dir, 'dist/licenses/site-software.txt'), '\nGameForge promotion');
      expect(auditBranding(dir, game).errors.join()).toContain('altered legal notice');
      fs.unlinkSync(path.join(dir, 'LICENSE'));
      expect(validateNotices(dir).join()).toContain('Original MIT');
    } finally { remove(dir); }
  });
  it('finds compressed search-fragment leakage, stray research, and stale brand artwork', () => {
    const dir = fixture();
    try {
      fs.mkdirSync(path.join(dir, 'dist/pagefind/fragment'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'dist/pagefind/fragment/en_test.pf_fragment'), gzipSync(Buffer.from('AnvilWiki research')));
      fs.mkdirSync(path.join(dir, 'dist/docs')); fs.writeFileSync(path.join(dir, 'dist/docs/secret.md'), 'internal operating manual');
      fs.appendFileSync(path.join(dir, 'dist/favicon.svg'), 'stale');
      const errors = auditBranding(dir, game).errors.join();
      expect(errors).toContain('Internal/demo identity'); expect(errors).toContain('not an approved'); expect(errors).toContain('stale brand artwork');
      fs.writeFileSync(path.join(dir, '.gameforge/retired-brand-values.json'), JSON.stringify(['G-OLDACCOUNT123']));
      fs.writeFileSync(path.join(dir, 'dist/pagefind/fragment/en_test.pf_fragment'), gzipSync(Buffer.from('G-OLDACCOUNT123')));
      expect(auditBranding(dir, game).errors.join()).toContain('Retired brand/contact/integration');
    } finally { remove(dir); }
  });
  it('detects another configured game across the generated output', () => {
    const dir = fixture();
    try {
      fs.appendFileSync(path.join(dir, 'dist/index.html'), peer.contactEmail!);
      expect(auditBranding(dir, game, [peer]).errors.join()).toContain('Another site');
    } finally { remove(dir); }
  });
});
