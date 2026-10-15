import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import { walkFiles } from './lib/walk';
import { runScript, runPnpm } from './lib/run';
import { articles, loadGame } from './lib/gameforge';

const root = process.cwd();
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
    const game = loadGame(site)!;
    const files = articles(site);
    assert(files.length >= 2);
    assert(files.every(a => a.data.draft === true));
    assert(!fs.readFileSync(path.join(site, 'dist/sitemap-0.xml'), 'utf8').includes('/beginner/'));
    // Publish two explicitly fictional fixture articles to exercise real list,
    // detail, source, breadcrumb, related and sitemap output, then rebuild.
    for (const [i, a] of files.slice(0, 2).entries()) {
      Object.assign(a.data, { draft: false, evidenceStatus: 'verified', reviewedBy: 'Test fixture harness', reviewedAt: '2026-10-01', gameVersion: 'fixture-1', sourceIds: ['fixture-official'], description: `Fictional ${game.gameName} integration fixture ${i + 1} verifies ${a.data.pageType} rendering and source attribution.`, summary: `This is fictional test material for ${game.gameName}. Fixture ${i + 1} checks ${a.data.pageType} rendering. It asserts no real gameplay data.` });
      const body = `## What does ${a.data.title} test?\n\nThis explicitly fictional ${a.data.pageType} fixture for ${game.gameName} tests scenario ${i + 1}. It is a local template integration test, with no real codes, boss statistics or release claims.\n\n## How is scenario ${i + 1} checked?\n\nThe test harness checks ${a.data.pageType} metadata, source attribution, navigation, theme, and static output. Only fixture sources are used.\n`;
      fs.writeFileSync(a.file, `---\n${stringify(a.data)}---\n\n${body}`);
    }
    runPnpm(site, ['verify-game']);
    const home = fs.readFileSync(path.join(site, 'dist/index.html'), 'utf8');
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
      const data = { ...original.data, title: `${game.gameName} 日本語の動作確認ガイド`, description: `${game.gameName} は架空のテスト用ゲームです。このページはテンプレートの日本語翻訳、出典表示と検索設定の検証だけに使用します。`, summary: 'これは架空のテスト資料です。実際のゲームの数値、ボス属性、交換コードなどは主張していません。' };
      fs.writeFileSync(translated, `---\n${stringify(data)}---\n\n## このテストで何を確認しますか？\n\nこれは日本語の記事と出典、パンくず、検索エンジン設定を確認するための架空の資料です。\n\n## 本物のゲームの攻略ですか？\n\nいいえ。公開サイトに配信するための資料ではありません。\n`);
      runPnpm(site, ['verify-game']);
      const translatedMap = fs.readFileSync(path.join(site, 'dist/sitemap-0.xml'), 'utf8');
      const translatedRoute = path.relative(path.join(site, 'src/content/wiki'), translated).replace(/\\/g, '/').replace(/\.mdx$/, '/');
      assert(translatedMap.includes(`https://${game.domain}/${translatedRoute}`));
      assert(!translatedMap.includes(`<loc>https://${game.domain}/ja/</loc>`), 'English fallback homepage stays excluded');
      const detail = fs.readFileSync(path.join(site, 'dist', translatedRoute, 'index.html'), 'utf8');
      assert(detail.includes('hreflang="ja"'));
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
