import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import { walkFiles } from './lib/walk';
import { runScript, runPnpm } from './lib/run';
import { articles, loadGame } from './lib/gameforge';

const root = process.cwd();
const require = createRequire(import.meta.url);
function expectGateFailure(site: string, script: string, message: string) {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), path.join(site, script)], { cwd: site, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert((result.stdout + result.stderr).includes(message), result.stdout + result.stderr);
}
function motherHash() {
  const h = createHash('sha256');
  for (const file of [...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'public'))].sort()) h.update(path.relative(root, file)).update(fs.readFileSync(file));
  return h.digest('hex');
}
const before = motherHash();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gameforge-sites-'));
const reports: unknown[] = [];
try {
  for (const type of ['roblox', 'steam']) {
    const fixture = path.join(root, 'fixtures/games', type), site = path.join(scratch, type);
    runScript(root, 'scripts/create-game.ts', ['--config', path.join(fixture, 'game.config.json'), '--keywords', path.join(fixture, 'keywords.json'), '--facts', path.join(fixture, 'facts.json'), '--out', site]);
    for (const excluded of ['tools', 'fixtures', '.zcode', '.dev.vars', '.env.local', 'docs/superpowers', 'scripts/test-games.ts']) assert(!fs.existsSync(path.join(site, excluded)), `Unsafe/unrelated copied path: ${excluded}`);
    assert(fs.existsSync(path.join(site, '.githooks/pre-commit')));
    const wrangler = fs.readFileSync(path.join(site, 'wrangler.toml'), 'utf8');
    assert(wrangler.includes('pages_build_output_dir = "dist"'));
    assert(!/CLOUDFLARE_API_TOKEN|CF_API_TOKEN/.test(wrangler));
    const game = loadGame(site)!;
    const files = articles(site);
    assert(files.length >= 2);
    assert(files.every(a => a.data.draft === true));
    assert(!fs.readFileSync(path.join(site, 'dist/sitemap-0.xml'), 'utf8').includes('/beginner/'));
    // Publish two explicitly fictional fixture articles to exercise real list,
    // detail, source, breadcrumb, related and sitemap output, then rebuild.
    for (const [i, a] of files.slice(0, 2).entries()) {
      Object.assign(a.data, { tags: type === 'steam' ? [] : a.data.tags, draft: false, evidenceStatus: 'verified', reviewedBy: 'Test fixture harness', reviewedAt: '2026-10-01', gameVersion: 'fixture-1', sourceIds: ['fixture-official'], description: `Fictional ${game.gameName} integration fixture ${i + 1} verifies ${a.data.pageType} rendering and source attribution.`, summary: `This is fictional test material for ${game.gameName}. Fixture ${i + 1} checks ${a.data.pageType} rendering. It asserts no real gameplay data.` });
      const body = `## What does ${a.data.title} test?\n\nThis explicitly fictional ${a.data.pageType} fixture for ${game.gameName} tests scenario ${i + 1}. It is a local template integration test, with no real codes, boss statistics or release claims.\n\n## How is scenario ${i + 1} checked?\n\nThe test harness checks ${a.data.pageType} metadata, source attribution, navigation, theme, and static output. Only fixture sources are used.\n`;
      fs.writeFileSync(a.file, `---\n${stringify(a.data)}---\n\n${body}`);
    }
    // Exercise a navigation category with no published articles before the
    // first real category: CTA labels and destinations must still agree.
    const emptyCategory = game.navigation.find(n => !articles(site).some(a => a.data.draft !== true && a.data.category === n.key));
    assert(emptyCategory, 'Fixture needs an empty leading category');
    game.navigation = [emptyCategory, ...game.navigation.filter(n => n !== emptyCategory)];
    fs.writeFileSync(path.join(site, 'game.config.json'), JSON.stringify(game));
    runPnpm(site, ['verify-game']);
    // Mutate real built output: omission must fail even when every remaining
    // sitemap URL is otherwise valid. Restore before continuing verification.
    const sitemapFile = path.join(site, 'dist/sitemap-0.xml');
    const completeSitemap = fs.readFileSync(sitemapFile, 'utf8');
    fs.writeFileSync(sitemapFile, completeSitemap.replace(/<url>[\s\S]*?<\/url>/, ''));
    try { expectGateFailure(site, 'scripts/check-seo.ts', 'missing from sitemap'); }
    finally { fs.writeFileSync(sitemapFile, completeSitemap); }
    const factsFile = path.join(site, 'facts.json');
    const factsRaw = fs.readFileSync(factsFile, 'utf8');
    const unverified = JSON.parse(factsRaw); unverified[0].verified = false;
    fs.writeFileSync(factsFile, JSON.stringify(unverified));
    try { expectGateFailure(site, 'scripts/check-evidence.ts', 'verified'); }
    finally { fs.writeFileSync(factsFile, factsRaw); }
    // No network request: fictional sources still support the local draft flow.
    expectGateFailure(site, 'scripts/predeploy.ts', 'Test-only game');
    runScript(site, 'scripts/check-sources.ts');
    runScript(site, 'scripts/check-seo.ts');
    const homeFile = path.join(site, 'dist/index.html');
    const home = fs.readFileSync(homeFile, 'utf8');
    const badCanonical = home.replace(/(rel="canonical" href=")[^"]+/, '$1https://foreign.example/');
    assert.notEqual(badCanonical, home);
    fs.writeFileSync(homeFile, badCanonical);
    try { expectGateFailure(site, 'scripts/check-seo.ts', 'Canonical does not match'); }
    finally { fs.writeFileSync(homeFile, home); }
    const configBeforeRobotsTest = fs.readFileSync(path.join(site, 'game.config.json'), 'utf8');
    fs.writeFileSync(path.join(site, 'game.config.json'), JSON.stringify({ ...game, testOnly: false }));
    try { expectGateFailure(site, 'scripts/check-seo.ts', 'blocked by robots'); }
    finally { fs.writeFileSync(path.join(site, 'game.config.json'), configBeforeRobotsTest); }
    runScript(site, 'scripts/check-seo.ts');
    const generatedUi = JSON.parse(fs.readFileSync(path.join(site, 'src/locales/en.json'), 'utf8'));
    const firstPublishedLink = generatedUi.home.popular.quickLinks[0];
    assert(firstPublishedLink, 'A published category needs a browse link');
    assert(home.includes(`href="${firstPublishedLink.href}" class="btn-outline"`), 'Hero CTA must target its labeled published category');
    assert(home.includes(game.siteName));
    assert(home.includes(game.themeColor) || fs.readFileSync(path.join(site, 'public/manifest.json'), 'utf8').includes(game.themeColor));
    assert(!/Anvil Quest|anvil\.wiki|googlesyndication\.com\/pagead|giscus\.app\/client/.test(home));
    const map = fs.readFileSync(path.join(site, 'dist/sitemap-0.xml'), 'utf8');
    for (const a of articles(site)) {
      const route = path.relative(path.join(site, 'src/content/wiki/en'), a.file).replace(/\\/g, '/').replace(/\.mdx$/, '/');
      assert.equal(map.includes(`https://${game.domain}/${route}`), !a.data.draft);
    }
    if (game.supportedLanguages.includes('ja')) {
      assert(!map.includes(`https://${game.domain}/ja/`));
      assert(home.includes('hreflang="en"'));
      assert(!home.includes('hreflang="ja"'));
      const original = articles(site).find(a => a.data.draft !== true)!;
      const translated = original.file.replace(`${path.sep}en${path.sep}`, `${path.sep}ja${path.sep}`);
      fs.mkdirSync(path.dirname(translated), { recursive: true });
      const data = { ...original.data, tags: ['動作確認'], title: `${game.gameName} 日本語の動作確認ガイド`, description: `${game.gameName} は架空のテスト用ゲームです。このページはテンプレートの日本語翻訳、出典表示と検索設定の検証だけに使用します。`, summary: 'これは架空のテスト資料です。実際のゲームの数値、ボス属性、交換コードなどは主張していません。' };
      fs.writeFileSync(translated, `---\n${stringify(data)}---\n\n## このテストで何を確認しますか？\n\nこれは日本語の記事と出典、パンくず、検索エンジン設定を確認するための架空の資料です。\n\n## 本物のゲームの攻略ですか？\n\nいいえ。公開サイトに配信するための資料ではありません。\n`);
      runPnpm(site, ['verify-game']);
      const translatedMap = fs.readFileSync(path.join(site, 'dist/sitemap-0.xml'), 'utf8');
      const translatedRoute = path.relative(path.join(site, 'src/content/wiki'), translated).replace(/\\/g, '/').replace(/\.mdx$/, '/');
      assert(translatedMap.includes(`https://${game.domain}/${translatedRoute}`));
      assert(!translatedMap.includes(`<loc>https://${game.domain}/ja/</loc>`), 'English fallback homepage stays excluded');
      const detail = fs.readFileSync(path.join(site, 'dist', translatedRoute, 'index.html'), 'utf8');
      assert(detail.includes('hreflang="ja"'));
      assert(fs.existsSync(path.join(site, 'dist/ja/tags/動作確認/index.html')), 'Unicode tag route must be generated');
      assert(translatedMap.includes(encodeURIComponent('動作確認')), 'Sitemap must contain the encoded Unicode tag URL');
    }
    if (type === 'steam') {
      const configFile = path.join(site, 'game.config.json');
      const originalConfig = fs.readFileSync(configFile, 'utf8');
      const enabled = JSON.parse(originalConfig);
      enabled.featureFlags = { ...enabled.featureFlags, analytics: true, adsense: true, comments: true };
      enabled.analytics = { ga4: 'G-FIXTURE123', cloudflareBeaconToken: '0123456789abcdef0123456789abcdef' };
      enabled.advertising = { adsenseClient: 'ca-pub-1234567890', adsenseSlots: { sticky: '12345', sidebar: '12346', incontent: '12347' } };
      enabled.comments = { repo: 'fixture/test-only', repoId: 'fixture-repo', category: 'Fixture', categoryId: 'fixture-category' };
      fs.writeFileSync(configFile, JSON.stringify(enabled));
      try {
        runPnpm(site, ['build']);
        const html = fs.readFileSync(path.join(site, 'dist/index.html'), 'utf8');
        assert(html.includes('0123456789abcdef0123456789abcdef'), 'Only the configured public beacon ID may be exposed');
        assert(html.includes('G-FIXTURE123'), 'Analytics must use the configured ID in local builds');
        assert(html.includes('ca-pub-1234567890'), 'AdSense loader must use the configured publisher');
        const detailFile = articles(site).find(a => a.data.draft !== true)!;
        const route = path.relative(path.join(site, 'src/content/wiki/en'), detailFile.file).replace(/\.mdx$/, '');
        const detail = fs.readFileSync(path.join(site, 'dist', route, 'index.html'), 'utf8');
        assert(detail.includes('fixture-repo'), 'Comments must use configured public IDs');
        assert(detail.includes('data-ad-slot="12347"'), 'Configured ad slots must render');
      } finally { fs.writeFileSync(configFile, originalConfig); }
      runPnpm(site, ['build']);
      runScript(site, 'scripts/check-seo.ts');
      const restored = fs.readFileSync(path.join(site, 'dist/index.html'), 'utf8');
      assert(!restored.includes('G-FIXTURE123') && !restored.includes('ca-pub-1234567890'));
    }
    assert.equal(motherHash(), before, 'Generation must not mutate mother config/content/assets');
    reports.push({ fixture: type, independentDirectory: true, allGates: 'passed', draftAndPublishedRendering: true, noMotherMutation: true, seo: JSON.parse(fs.readFileSync(path.join(site, '.gameforge/seo-report.json'), 'utf8')) });
  }
  fs.mkdirSync(path.join(root, '.gameforge'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gameforge/generation-tests.json'), JSON.stringify(reports, null, 2) + '\n');
} finally {
  // Only remove the mkdtemp-owned directory, never a computed user output.
  if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('gameforge-sites-')) throw new Error('Unexpected scratch target');
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log('Two independent game site generation tests passed; temporary outputs removed.');
