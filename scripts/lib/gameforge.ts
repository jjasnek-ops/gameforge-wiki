import fs from 'node:fs';
import path from 'node:path';
import { z } from 'astro/zod';
import { parse } from 'yaml';
import { walkFiles } from './walk';

const text = z.string().trim().min(1).refine(v => !/[\x00-\x1f]/.test(v), 'Control characters are not allowed');
const key = text.regex(/^[a-z][a-z0-9-]*$/);
const url = z.url().refine(v => new URL(v).protocol === 'https:', 'HTTPS required');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v && v <= new Date().toISOString().slice(0, 10);
}, 'A real, non-future verification date is required');
const locale = text.regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/);
export const PAGE_TYPES = ['beginner-guide', 'walkthrough', 'codes', 'tier-list', 'boss-guide', 'items', 'maps', 'builds', 'faq'] as const;
export const sourceSchema = z.object({
  id: key, url, title: text, kind: z.enum(['official', 'store', 'developer', 'gameplay', 'video', 'community']),
  verified: z.boolean(), verifiedAt: date, version: text, notes: text,
}).strict();
export const gameSchema = z.object({
  gameName: text.max(55), siteName: text.max(80), shortName: text.max(30),
  domain: text.refine(v => {
    try { return new URL(`https://${v}`).host === v && !v.includes(':') && v.includes('.'); } catch { return false; }
  }, 'Use a bare hostname without protocol, port, path or trailing slash'),
  description: text.min(40).max(165), platform: text, genre: text, developer: text,
  releaseDate: date.optional(), officialUrl: url, discordUrl: url.optional(), youtubeUrl: url.optional(),
  contactEmail: z.email().optional(), themeColor: text.regex(/^#[0-9a-fA-F]{6}$/),
  defaultLanguage: locale.default('en'), supportedLanguages: z.array(locale).min(1),
  translatedLanguages: z.array(locale).default([]),
  navigation: z.array(z.object({ key, label: text, icon: text.regex(/^lucide:[a-z0-9-]+$/).default('lucide:book-open') }).strict()).min(1).max(8),
  featureFlags: z.object({
    comments: z.boolean().default(false), adsense: z.boolean().default(false), adsterra: z.boolean().default(false),
    affiliates: z.boolean().default(false), advancedVideo: z.boolean().default(false),
    multilingual: z.boolean().default(false), analytics: z.boolean().default(false),
  }).strict().prefault({}),
  analytics: z.object({ ga4: z.string().regex(/^G-[A-Z0-9]+$/).optional(), cloudflareToken: text.optional(), gscVerification: text.optional() }).strict().prefault({}),
  advertising: z.object({
    adsenseClient: z.string().regex(/^ca-pub-\d+$/).optional(),
    adsenseSlots: z.object({ sticky: text.optional(), sidebar: text.optional(), incontent: text.optional() }).strict().prefault({}),
    adsterraSlots: z.partialRecord(z.enum(['SIDEBAR_300X250', 'INCONTENT_728X90', 'NATIVE_BANNER', 'SIDEBAR_160X300', 'SIDEBAR_160X600', 'STICKY_320X50']), text).default({}),
    adsTxt: z.array(text).default([]),
  }).strict().prefault({}),
  comments: z.object({ repo: text, repoId: text, category: text, categoryId: text }).strict().optional(),
  homepage: z.object({
    intro: text, heroImage: text.regex(/^\/images\/[a-zA-Z0-9/_.-]+$/).optional(),
    heroAlt: text.optional(),
    facts: z.array(z.object({ label: text, value: text, sourceId: key }).strict()).default([]),
    faq: z.array(z.object({ question: text, answer: text, sourceIds: z.array(key).min(1) }).strict()).default([]),
    modules: z.array(z.object({ category: key, title: text, description: text }).strict()).max(8).default([]),
  }).strict(),
  forbiddenTerms: z.array(text).default([]), testOnly: z.boolean().default(false),
}).strict().superRefine((g, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!g.supportedLanguages.includes(g.defaultLanguage)) fail('defaultLanguage must be supported');
  if (!g.supportedLanguages.includes('en')) fail('Keep en as the base UI dictionary language');
  if (new Set(g.supportedLanguages).size !== g.supportedLanguages.length) fail('Duplicate language');
  if (new Set(g.navigation.map(n => n.key)).size !== g.navigation.length) fail('Duplicate category');
  const reserved = ['landing', 'demo', 'tags', 'recent', 'faq', 'about', 'contact', 'copyright', 'privacy-policy', 'terms-of-service', ...g.supportedLanguages];
  if (g.navigation.some(n => reserved.includes(n.key))) fail('Category conflicts with a reserved route');
  if (g.translatedLanguages.some(l => !g.supportedLanguages.includes(l) || l === g.defaultLanguage)) fail('Invalid translatedLanguages');
  if (g.homepage.modules.some(m => !g.navigation.some(n => n.key === m.category))) fail('Unknown homepage module category');
  if (g.homepage.heroImage && !g.homepage.heroAlt) fail('heroImage needs heroAlt');
  if (g.featureFlags.comments && !g.comments) fail('Enabled comments need configuration');
});
export type GameConfig = z.infer<typeof gameSchema>;
export type FactSource = z.infer<typeof sourceSchema>;

export const keywordSchema = z.object({
  topicName: text, category: key, keyword: text, slug: key,
  intent: text, priority: z.number().int().min(1).max(5),
  evidenceStatus: z.enum(['pending', 'verified', 'disputed']), pageType: z.enum(PAGE_TYPES),
  relevant: z.boolean().default(true), canonicalKeyword: text.optional(), locale: locale.default('en'),
  sourceIds: z.array(key).default([]),
}).strict();
export type Keyword = z.infer<typeof keywordSchema>;
export function planKeywords(input: unknown, game: GameConfig) {
  const rows = z.array(keywordSchema).parse(input).filter(k => k.relevant).sort((a, b) => a.priority - b.priority);
  const seenIntent = new Map<string, Keyword>();
  const seenPath = new Set<string>();
  const merged: string[] = [];
  const keywords: Keyword[] = [];
  for (const k of rows) {
    if (!game.navigation.some(n => n.key === k.category)) throw new Error(`Unknown category: ${k.category}`);
    if (!game.supportedLanguages.includes(k.locale) || (!game.featureFlags.multilingual && k.locale !== game.defaultLanguage)) throw new Error(`Unknown locale: ${k.locale}`);
    const intentKey = `${k.locale}:${(k.canonicalKeyword ?? k.keyword).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const prior = seenIntent.get(intentKey);
    if (prior) {
      if (prior.intent !== k.intent || prior.category !== k.category || prior.pageType !== k.pageType) throw new Error(`Conflicting synonym intent: ${k.keyword}`);
      prior.sourceIds = [...new Set([...prior.sourceIds, ...k.sourceIds])];
      merged.push(k.keyword); continue;
    }
    const route = `${k.locale}/${k.category}/${k.slug}`;
    if (seenPath.has(route)) throw new Error(`Slug collision: ${route}`);
    if (`${game.gameName} ${k.topicName}`.length > 80) throw new Error(`Title exceeds 80 characters: ${k.topicName}`);
    seenIntent.set(intentKey, k); seenPath.add(route); keywords.push(k);
  }
  return { keywords, merged };
}
export function loadGame(root = process.cwd()): GameConfig | null {
  const file = path.join(root, 'game.config.json');
  return fs.existsSync(file) ? gameSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : null;
}
export function loadFacts(root: string): FactSource[] {
  const facts = z.array(sourceSchema).parse(JSON.parse(fs.readFileSync(path.join(root, 'facts.json'), 'utf8')));
  if (new Set(facts.map(f => f.id)).size !== facts.length) throw new Error('Duplicate fact source ID');
  return facts;
}
export function readArticle(file: string) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!m) throw new Error(`Missing YAML frontmatter: ${file}`);
  return { file, data: parse(m[1]) as Record<string, any>, body: raw.slice(m[0].length) };
}
export function articles(root: string) {
  return walkFiles(path.join(root, 'src/content/wiki'), { exts: ['.mdx'] }).map(readArticle);
}
export function evidenceErrors(data: Record<string, any>, facts: FactSource[]): string[] {
  if (data.draft === true) return [];
  const errors: string[] = [];
  if (data.evidenceStatus !== 'verified') errors.push('evidenceStatus must be verified');
  if (!text.safeParse(data.reviewedBy).success || !date.safeParse(data.reviewedAt).success) errors.push('Human reviewedBy and reviewedAt required');
  if (!text.safeParse(data.gameVersion).success) errors.push('gameVersion required (use a verified version or dated snapshot)');
  const ids = z.array(key).min(1).safeParse(data.sourceIds);
  if (!ids.success) return [...errors, 'sourceIds required'];
  const sources = ids.data.map(id => facts.find(f => f.id === id));
  if (sources.some(s => !s?.verified)) errors.push('Every source must exist and be verified');
  if (!sources.some(s => s?.verified && s.kind !== 'community')) errors.push('Community claims need corroboration');
  if (sources.some(s => s && s.version !== data.gameVersion)) errors.push('Source version differs from gameVersion');
  if (sources.some(s => s && s.verifiedAt > data.reviewedAt)) errors.push('Review must follow source verification');
  return errors;
}
export function validateEvidence(root: string, game = loadGame(root)) {
  if (!game) return;
  const facts = loadFacts(root);
  const errors: string[] = [];
  for (const a of articles(root)) {
    for (const e of evidenceErrors(a.data, facts)) errors.push(`${path.relative(root, a.file)}: ${e}`);
    if (a.data.draft !== true && /\bTODO\b|\[Draft scaffold\]|← write section|One-sentence direct answer/.test(a.body + a.data.description + a.data.summary)) errors.push(`${a.file}: scaffold placeholders cannot publish`);
  }
  for (const id of [...game.homepage.facts.map(f => f.sourceId), ...game.homepage.faq.flatMap(f => f.sourceIds)]) {
    const source = facts.find(f => f.id === id);
    if (!source?.verified || source.kind === 'community') errors.push(`Homepage fact/FAQ source is not corroborated: ${id}`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
}
