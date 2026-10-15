import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { articles, loadGame, validateEvidence } from './lib/gameforge';
import { walkFiles } from './lib/walk';
import { attr, routeKey, decodeXml, noindexDirective, headerNoindex, indexPolicy, auditIndexSets } from './lib/seo-audit';
import { DEMO_GAME_NAMES, DEMO_DOMAINS, DEMO_VAR_VALUES } from './lib/apply-rewrites';

const root = process.cwd(), game = loadGame(root);
if (!game) {
  console.log('GameForge production audit applies to generated game sites; run template-audit for the upstream reference fixtures.');
  process.exit(0);
}
validateEvidence(root, game);
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) throw new Error('Build first: dist is missing');
const origin = `https://${game.domain}`;
const errors: string[] = [], titles = new Map<string, string>(), descriptions = new Map<string, string>(), bodies = new Map<string, string>();
const meta = (html: string, name: string) => {
  const tag = [...html.matchAll(/<meta\s[^>]*>/gi)].map(m => m[0]).find(t => attr(t, 'name') === name || attr(t, 'property') === name);
  return tag ? attr(tag, 'content') : undefined;
};
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'gi'))].map(m => m[0]);
const htmlFiles = walkFiles(dist, { exts: ['.html'] }).filter(f => !path.relative(dist, f).replace(/\\/g, '/').startsWith('ads/'));
const byRoute = new Map<string, { html: string; indexed: boolean }>();
const headerFile = path.join(dist, '_headers');
const headers = fs.existsSync(headerFile) ? fs.readFileSync(headerFile, 'utf8') : '';
for (const file of htmlFiles) {
  const rel = path.relative(dist, file).replace(/\\/g, '/');
  const route = rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -10)}` : `/${rel}`;
  const html = fs.readFileSync(file, 'utf8');
  const directives = tags(html, 'meta').filter(tag => ['robots', 'googlebot', 'bingbot'].includes((attr(tag, 'name') ?? '').toLowerCase())).map(tag => attr(tag, 'content') ?? '').join(',');
  const indexed = !noindexDirective(directives) && !headerNoindex(headers, route);
  byRoute.set(route, { html, indexed });
  const err = (message: string) => errors.push(`${route}: ${message}`);
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const description = meta(html, 'description');
  if (!title?.trim()) err('Missing title');
  if (!description?.trim()) err('Missing meta description');
  if ((html.match(/<h1(?:\s|>)/gi) ?? []).length !== 1) err('Expected exactly one H1');
  const canonical = tags(html, 'link').filter(t => attr(t, 'rel') === 'canonical');
  if (canonical.length !== 1 || routeKey(attr(canonical[0], 'href') ?? '') !== origin + route) err('Canonical does not match the actual URL');
  if (!meta(html, 'robots')) err('Missing robots directive');
  if (noindexDirective(directives) && /(?:^|[\s,])index(?=$|[\s,])/i.test(directives)) err('Conflicting index/noindex directives');
  if (meta(html, 'og:url') && routeKey(meta(html, 'og:url')!) !== origin + route) err('og:url differs from canonical URL');
  for (const name of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'twitter:image']) if (!meta(html, name)) err(`Missing ${name}`);
  for (const name of ['og:image', 'twitter:image']) {
    const image = meta(html, name);
    if (image && !image.startsWith(origin + '/')) err(`${name} must use this site's origin`);
    if (image?.startsWith(origin + '/') && !fs.existsSync(path.join(dist, decodeURIComponent(new URL(image).pathname)))) err(`${name} image does not exist`);
  }
  for (const img of tags(html, 'img')) if (!attr(img, 'alt')?.trim()) err('Image needs nonempty ALT');
  let jsonLdCount = 0;
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { const json = JSON.parse(m[1]); if (!json['@context'] || !json['@type']) err('JSON-LD missing context/type'); jsonLdCount++; }
    catch { err('Invalid JSON-LD'); }
  }
  if (!jsonLdCount) err('Missing JSON-LD');
  if (html.includes('data-pagefind-body') && /"@type":"Article"/.test(html) && !/"@type":"BreadcrumbList"/.test(html)) err('Article breadcrumb missing');
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? '';
  const headingLevels = [...main.matchAll(/<h([1-6])(?:\s|>)/g)].map(m => +m[1]);
  for (let i = 1; i < headingLevels.length; i++) if (headingLevels[i] > headingLevels[i - 1] + 1) err('Heading level skipped');
  if (indexed) {
    if (title && titles.has(title)) err(`Duplicate title with ${titles.get(title)}`);
    if (title) titles.set(title, route);
    if (description && descriptions.has(description)) err(`Duplicate description with ${descriptions.get(description)}`);
    if (description) descriptions.set(description, route);
  }
}
const sitemapFiles = walkFiles(dist, { exts: ['.xml'] }).filter(f => /sitemap-\d+\.xml$/.test(f));
if (!sitemapFiles.length) errors.push('Missing sitemap pages');
const robotsFile = path.join(dist, 'robots.txt');
const robots = fs.existsSync(robotsFile) ? fs.readFileSync(robotsFile, 'utf8') : '';
const faqLocales = new Set(game.supportedLanguages.filter(l => {
  const file = path.join(root, `src/locales/${l}.json`);
  return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).home?.faq?.items?.length > 0;
}));
const policy = indexPolicy(root, game, articles(root), faqLocales);
const audit = auditIndexSets({ origin, pages: byRoute, sitemaps: sitemapFiles.map(f => fs.readFileSync(f, 'utf8')), robots, testOnly: game.testOnly, expected: policy.expected, required: policy.required, localeFor: route => policy.split(route).locale });
errors.push(...audit.errors);
const submitted = audit.submitted;
const indexFile = path.join(dist, 'sitemap-index.xml');
const indexUrls = fs.existsSync(indexFile) ? [...fs.readFileSync(indexFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decodeXml(m[1])) : [];
const expectedSitemaps = new Set(sitemapFiles.map(f => `${origin}/${path.relative(dist, f).replace(/\\/g, '/')}`));
if (new Set(indexUrls).size !== indexUrls.length || indexUrls.length !== expectedSitemaps.size || indexUrls.some(url => !expectedSitemaps.has(url))) errors.push('Sitemap index does not exactly match the emitted sitemap files');
const robotsSitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)\s*$/gmi)].map(m => m[1]);
if (robotsSitemaps.length !== 1 || robotsSitemaps[0] !== `${origin}/sitemap-index.xml`) errors.push('robots sitemap origin/index mismatch');
if (!fs.existsSync(path.join(dist, '404.html'))) errors.push('404.html missing');
const retiredFile = path.join(root, '.gameforge/retired-identities.json');
const retired: string[] = fs.existsSync(retiredFile) ? JSON.parse(fs.readFileSync(retiredFile, 'utf8')) : [];
const forbidden = [...DEMO_GAME_NAMES, ...DEMO_DOMAINS, ...DEMO_VAR_VALUES.filter(v => v.length >= 12), ...game.forbiddenTerms, ...retired];
const scan = [...walkFiles(path.join(root, 'src/locales'), { exts: ['.json'] }), ...walkFiles(path.join(root, 'src/content/wiki'), { exts: ['.mdx'] }), ...walkFiles(dist, { exts: ['.html', '.xml', '.txt', '.json', '.svg'] })];
for (const file of scan) {
  const raw = fs.readFileSync(file, 'utf8').toLowerCase();
  for (const term of forbidden) if (raw.includes(term.toLowerCase())) errors.push(`${path.relative(root, file)}: forbidden demo/retired identity ${term}`);
}
for (const route of byRoute.keys()) if (/(?:^|\/)(?:landing|demo)(?:\/|$)/.test(route)) errors.push(`Template marketing route leaked: ${route}`);
for (const a of articles(root).filter(a => a.data.draft !== true && !a.data.noindex)) {
  const hash = createHash('sha256').update(a.body.trim().replace(/\s+/g, ' ')).digest('hex');
  if (bodies.has(hash)) errors.push(`Duplicate article body: ${a.file} / ${bodies.get(hash)}`);
  bodies.set(hash, a.file);
}
fs.mkdirSync(path.join(root, '.gameforge'), { recursive: true });
fs.writeFileSync(path.join(root, '.gameforge/seo-report.json'), JSON.stringify({ passed: errors.length === 0, pages: byRoute.size, sitemapUrls: submitted.size, errors }, null, 2) + '\n');
if (errors.length) throw new Error(errors.join('\n'));
console.log(`Production SEO audit passed: ${byRoute.size} pages, ${submitted.size} sitemap URLs.`);
