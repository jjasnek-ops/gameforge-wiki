import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gameSchema, loadFacts, planKeywords, validateEvidence } from './lib/gameforge';
import { configureGame } from './lib/configure-game';
import { runScript, runPnpm } from './lib/run';
import { walkFiles } from './lib/walk';

const args = process.argv.slice(2);
function arg(name: string) {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Required: --${name} <path>`);
  return path.resolve(args[i + 1]);
}
const root = fs.realpathSync(process.cwd());
const config = arg('config'), keywordsFile = arg('keywords'), factsFile = arg('facts'), output = arg('out');
const game = gameSchema.parse(JSON.parse(fs.readFileSync(config, 'utf8')));
planKeywords(JSON.parse(fs.readFileSync(keywordsFile, 'utf8')), game);
// Validate inputs before creating a directory. The output may not overwrite
// anything or sit under the template; resolve the existing parent against links.
const parent = fs.realpathSync(path.dirname(output));
const target = path.join(parent, path.basename(output));
if (fs.existsSync(target)) throw new Error('Output already exists; refusing to overwrite');
if (target === root || target.startsWith(root + path.sep) || root.startsWith(target + path.sep)) throw new Error('New site must be outside the template directory');
const factsRaw = fs.readFileSync(factsFile, 'utf8');
const { z } = await import('astro/zod');
const { sourceSchema } = await import('./lib/gameforge');
z.array(sourceSchema).parse(JSON.parse(factsRaw));
const contentInput = args.includes('--content') ? fs.realpathSync(arg('content')) : null;
const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const excluded = /^(?:\.git(?:\/|$)|node_modules\/|dist\/|\.astro\/|\.env(?:\.|$)|\.indexnow-key$|game\.config\.json$|facts\.json$|keywords\.json$|\.gameforge\/|\.zcode\/)/;
fs.mkdirSync(target);
for (const rel of files) {
  if (excluded.test(rel) || !fs.existsSync(path.join(root, rel))) continue;
  const from = path.join(root, rel);
  if (!fs.lstatSync(from).isFile()) throw new Error(`Copy source must be a regular file: ${rel}`);
  const to = path.join(target, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to);
}
fs.writeFileSync(path.join(target, 'game.config.json'), JSON.stringify(game, null, 2) + '\n');
fs.copyFileSync(keywordsFile, path.join(target, 'keywords.json'));
fs.writeFileSync(path.join(target, 'facts.json'), factsRaw);
loadFacts(target);
fs.mkdirSync(path.join(target, '.gameforge'));
const ui = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));
// Store only generic UI strings; no demo homepage, branding or topics.
for (const field of ['site', 'home', 'nav', 'overview']) delete ui[field];
delete ui.footer.copyrightText; delete ui.footer.playGame;
fs.writeFileSync(path.join(target, '.gameforge/ui-base.json'), JSON.stringify(ui, null, 2));
// Reuse the mature upstream initializer to remove its registered demo
// routes/assets/authors. It runs only inside our newly created directory.
const answers = [game.gameName, game.shortName, game.domain, game.homepage.intro, game.description,
  `${game.siteName} is an independent fan site.`, game.officialUrl, game.themeColor, game.platform, game.developer,
  game.genre, game.releaseDate ?? '', game.supportedLanguages.join(','), game.navigation.map(n => n.key).join(','), 'y', '2', 'y', 'y'];
fs.writeFileSync(path.join(target, '.gameforge/answers.json'), JSON.stringify(answers));
// Install the exact template lockfile in the independent project.
runPnpm(target, ['install', '--frozen-lockfile']);
runScript(target, 'scripts/apply-template.ts', ['--answers', '.gameforge/answers.json']);
// This is a fresh output, so all remaining source content is template material.
// Never clear the parent's content or a user-supplied directory.
const content = path.join(target, 'src/content/wiki');
if (!content.startsWith(target + path.sep)) throw new Error('Unsafe content target');
fs.rmSync(content, { recursive: true, force: true }); fs.mkdirSync(content, { recursive: true });
if (contentInput) for (const from of walkFiles(contentInput, { exts: ['.mdx'] })) {
  if (!fs.lstatSync(from).isFile()) throw new Error('Content inputs must be regular files');
  const to = path.join(content, path.relative(contentInput, from));
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to);
}
for (const file of fs.readdirSync(path.join(target, 'src/locales'))) if (file.endsWith('.json')) fs.unlinkSync(path.join(target, 'src/locales', file));
fs.writeFileSync(path.join(target, 'src/locales/en.json'), JSON.stringify(ui, null, 2));
configureGame(target);
runScript(target, 'scripts/plan-content.ts');
configureGame(target);
validateEvidence(target);
// Preserve the entire template regression suite in the mother repository.
// The independent site's CI runs its own portable config/evidence tests;
// marketing/demo fixture contracts are not production-site contracts.
const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
pkg.name = game.domain.replace(/\./g, '-'); pkg.homepage = `https://${game.domain}`;
delete pkg.repository; delete pkg.bugs;
pkg.scripts.test = 'vitest run tests/gameforge-site.test.ts';
delete pkg.scripts['test:e2e']; delete pkg.scripts['test:games'];
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
const tsconfigFile = path.join(target, 'tsconfig.json');
const tsconfig = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'));
tsconfig.include = ['.astro/types.d.ts', 'src/**/*', 'scripts/**/*', 'tests/gameforge-site.test.ts', '*.config.ts'];
fs.writeFileSync(tsconfigFile, JSON.stringify(tsconfig, null, 2) + '\n');
// No upstream scheduled operations or automatic submissions in new sites.
const workflows = path.join(target, '.github/workflows');
for (const file of fs.readdirSync(workflows)) fs.unlinkSync(path.join(workflows, file));
fs.writeFileSync(path.join(workflows, 'ci.yml'), `name: Game site checks\non: [push, pull_request]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09\n      - uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38\n        with:\n          node-version: '22'\n      - run: corepack enable\n      - run: pnpm install --frozen-lockfile\n      - run: pnpm verify-game\n`);
// Use generated neutral artwork; never carry the upstream game's hero.
runScript(target, 'scripts/gen-assets.ts');
for (const rel of ['public/favicon.ico', 'public/images/hero.svg']) fs.rmSync(path.join(target, rel), { force: true });
runPnpm(target, ['verify-game']);
fs.writeFileSync(path.join(target, 'LAUNCH_REPORT.md'), `# ${game.siteName}: local generation report\n\nIndependent directory: ${target}\n\nLocal configuration, evidence, TypeScript, lint, content, translation keys, tests, production build, Pagefind, links and SEO checks passed.\n\nAll keyword pages start as unpublished drafts. Fill verified material, reviewedBy/reviewedAt/gameVersion/sourceIds and review each page before setting draft: false.\n\n${game.testOnly ? 'TEST FIXTURE: robots disallows crawling; do not deploy.\n\n' : ''}No GitHub repository or Cloudflare deployment was created. No DNS/NS/DS/DNSSEC settings were changed. Build success does not prove domain availability.\n\nNext: follow docs/DEPLOYMENT.md. Create an independent remote only with authorization, then git init, git add ., git commit and git remote add origin YOUR_AUTHORIZED_REPOSITORY.\n`);
console.log(`Independent site verified: ${target}`);
