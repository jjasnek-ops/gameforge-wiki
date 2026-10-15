import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { readPublicJson } from './lib/security';
import { articles, loadGame, loadFacts, planKeywords, readArticle } from './lib/gameforge';
import { runScript } from './lib/run';

const root = process.cwd();
const game = loadGame(root);
if (!game) throw new Error('Run in a generated game site (game.config.json required).');
const input = process.argv[2] ?? 'keywords.json';
const plan = planKeywords(readPublicJson(path.resolve(root, input), 'keywords.json'), game);
const facts = loadFacts(root);
for (const k of plan.keywords) for (const id of k.sourceIds) if (!facts.some(f => f.id === id)) throw new Error(`Unknown source ${id} for ${k.keyword}`);
const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;
fs.mkdirSync(path.join(root, '.gameforge'), { recursive: true });
const csvPath = '.gameforge/new-posts.csv';
fs.writeFileSync(path.join(root, csvPath), ['locale,category,slug,title,description', ...plan.keywords.map(k => [k.locale, k.category, k.slug, `${game.gameName} ${k.topicName}`, `[Draft scaffold] Verified source material is required before this ${k.pageType} can be published.`].map(csv).join(','))].join('\n') + '\n');
const existing = new Set(articles(root).map(a => a.file));
for (const k of plan.keywords) {
  const file = path.join(root, 'src/content/wiki', k.locale, k.category, `${k.slug}.mdx`);
  if (!existing.has(file)) continue;
  const { data } = readArticle(file);
  const sameIntent = data.keyword === k.keyword || data.canonicalKeyword === (k.canonicalKeyword ?? k.keyword);
  if (!sameIntent) throw new Error(`Existing page conflicts with keyword: ${file}`);
}
runScript(root, 'scripts/bulk-new-posts.ts', [csvPath]);
const all = articles(root);
for (const k of plan.keywords) {
  const file = path.join(root, 'src/content/wiki', k.locale, k.category, `${k.slug}.mdx`);
  if (existing.has(file)) {
    continue; // Never overwrite an edited draft or published page.
  }
  const a = readArticle(file);
  const related = all.filter(other => other.file !== file && other.file.includes(`${path.sep}${k.locale}${path.sep}`) && other.data.category === k.category);
  const publicRelated = related.filter(other => other.data.draft !== true && !other.data.noindex).slice(0, 3);
  Object.assign(a.data, {
    pageType: k.pageType, keyword: k.keyword, canonicalKeyword: k.canonicalKeyword ?? k.keyword,
    searchIntent: k.intent, evidenceStatus: 'pending', sourceIds: k.sourceIds,
    tags: [k.category, k.pageType], relatedCandidates: related.map(other => path.basename(other.file, '.mdx')),
  });
  const links = publicRelated.map(other => {
    const rel = path.relative(path.join(root, 'src/content/wiki'), other.file).replace(/\\/g, '/').replace(/\.mdx$/, '');
    const route = rel.startsWith(`${game.defaultLanguage}/`) ? rel.slice(game.defaultLanguage.length + 1) : rel;
    return `- [${other.data.title.replace(/[\[\]]/g, '')}](/${route}/)`;
  });
  fs.writeFileSync(file, `---\n${stringify(a.data)}---\n\n${a.body.trim()}\n${links.length ? `\n## Related reading\n\n${links.join('\n')}\n` : ''}`);
}
fs.writeFileSync(path.join(root, '.gameforge/content-plan.json'), JSON.stringify({ ...plan, urls: plan.keywords.map(k => `https://${game.domain}/${k.locale === game.defaultLanguage ? '' : `${k.locale}/`}${k.category}/${k.slug}/`) }, null, 2) + '\n');
console.log(`Planned ${plan.keywords.length} drafts; merged ${plan.merged.length} synonyms. No pages automatically published.`);
