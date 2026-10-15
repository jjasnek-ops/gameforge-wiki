import fs from 'node:fs';
import path from 'node:path';
import { articles, loadFacts, loadGame } from './lib/gameforge';
import { cachedSourceLink, sourceUrlIssue, type LinkResult } from './lib/source-links';

const root = process.cwd(), game = loadGame(root);
if (!game) throw new Error('Run source checks in an independent game site');
const online = process.argv.includes('--online'), strict = process.argv.includes('--strict');
if (strict && !online) throw new Error('--strict requires --online; local build/dev never needs network access');
const facts = loadFacts(root);
const referenced = new Set([...articles(root).filter(a => a.data.draft !== true).flatMap(a => a.data.sourceIds ?? []), ...game.homepage.facts.map(f => f.sourceId), ...game.homepage.faq.flatMap(f => f.sourceIds)]);
const selected = facts.filter(f => process.argv.includes('--all') || referenced.has(f.id));
for (const source of facts) if (sourceUrlIssue(source.url)) throw new Error(`Source ${source.id}: invalid public HTTPS URL`);
if (!online) console.log(`Offline URL validation passed for ${facts.length} sources. Reachability was not checked; verified remains a human assertion.`);
else {
  const cacheFile = path.join(root, '.gameforge/source-cache.json');
  let cache: Record<string, LinkResult> = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (!cache || Array.isArray(cache) || typeof cache !== 'object') cache = {}; } catch { /* missing/corrupt cache: recheck */ }
  const reports: Array<LinkResult & { id: string }> = [];
  // Two workers bound load; every source has one shared 8-second redirect deadline.
  let next = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (next < selected.length) {
      const source = selected[next++];
      const report = { ...await cachedSourceLink(source.url, cache, process.argv.includes('--refresh')), id: source.id };
      reports.push(report);
      console.log(`${source.id}: ${report.code}${report.cached ? ' (cached)' : ''} — ${report.detail}`);
    }
  }));
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n');
  fs.writeFileSync(path.join(root, '.gameforge/source-report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), reports, truthVerified: false }, null, 2) + '\n');
  if (strict && reports.some(r => !r.ok)) throw new Error('Source reachability check failed; consult .gameforge/source-report.json. Draft dev/build are unaffected.');
  console.log('Reachability is not proof of accuracy. Review the actual source content, version and each claim.');
}
