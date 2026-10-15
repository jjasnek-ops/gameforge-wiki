import path from 'node:path';
import type { GameConfig } from './gameforge';
import { fixedEnglishPage, indexableLocalePage } from '../../src/lib/gameforge-indexing';

export const decodeXml = (s: string) => s.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
  const names: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
  if (entity.toLowerCase() in names) return names[entity.toLowerCase()];
  const n = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
  return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entity;
});
export const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? decodeXml(m[1] ?? m[2]) : undefined;
};
export const routeKey = (p: string) => { try { return decodeURIComponent(p); } catch { return p; } };
export const noindexDirective = (s: string) => /(?:^|[\s,:])(?:noindex|none)(?=$|[\s,])/i.test(s);
const tags = (html: string, name: string) => [...html.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'gi'))].map(m => m[0]);
const glob = (pattern: string, end: boolean) => new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + (end ? '$' : ''));

export function robotsBlocked(raw: string, route: string, bot = '*'): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; pattern: string }> }> = [];
  let group = { agents: [] as string[], rules: [] as Array<{ allow: boolean; pattern: string }> };
  for (const line of raw.split(/\r?\n/)) {
    const match = line.split('#')[0].match(/^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, field, value] = match;
    if (field.toLowerCase() === 'user-agent') {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if (value && group.agents.length) group.rules.push({ allow: field.toLowerCase() === 'allow', pattern: routeKey(value) });
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.includes(bot.toLowerCase()));
  const applicable = specific.length ? specific : groups.filter(g => g.agents.includes('*'));
  const matches = applicable.flatMap(g => g.rules).filter(r => glob(r.pattern.replace(/\$$/, ''), r.pattern.endsWith('$')).test(route));
  matches.sort((a, b) => b.pattern.replace(/\*/g, '').length - a.pattern.replace(/\*/g, '').length || Number(b.allow) - Number(a.allow));
  return matches[0] ? !matches[0].allow : false;
}
export function headerNoindex(raw: string, route: string): boolean {
  let pattern = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.startsWith('/')) pattern = line.trim();
    else if (pattern && glob(pattern, true).test(route) && /^\s+X-Robots-Tag:/i.test(line) && noindexDirective(line.split(':').slice(1).join(':'))) return true;
  }
  return false;
}
interface Article { file: string; data: Record<string, any> }
export function indexPolicy(root: string, game: GameConfig, articles: Article[], faqLocales: Set<string>) {
  const languages = game.featureFlags.multilingual ? game.supportedLanguages : [game.defaultLanguage];
  const categories = game.navigation.map(n => n.key);
  const published = articles.filter(a => a.data.draft !== true).map(a => {
    const rel = path.relative(path.join(root, 'src/content/wiki'), a.file).replace(/\\/g, '/').replace(/\.mdx$/, '');
    const [locale, category, ...slug] = rel.split('/');
    const route = `/${locale === game.defaultLanguage ? '' : `${locale}/`}${category}/${slug.join('/')}/`;
    return { ...a, locale, category, route };
  });
  const split = (route: string) => {
    const parts = route.split('/').filter(Boolean);
    const locale = game.supportedLanguages.includes(parts[0]) ? parts.shift()! : game.defaultLanguage;
    return { locale, parts };
  };
  const expected = (route: string): boolean | undefined => {
    if (route === '/404.html' || /(?:^|\/)(?:demo|landing)(?:\/|$)/.test(route)) return false;
    const { locale, parts } = split(route);
    if (!languages.includes(locale) || route.startsWith(`/${game.defaultLanguage}/`)) return false;
    if (fixedEnglishPage(route)) return locale === 'en';
    if (categories.includes(parts[0])) {
      if (parts.length === 1) return published.some(a => a.locale === locale && a.category === parts[0]);
      const article = published.find(a => a.route === route);
      return !!article && !article.data.noindex;
    }
    if (!indexableLocalePage(route, locale, game.defaultLanguage, game.translatedLanguages, categories)) return false;
    if (!parts.length) return true;
    if (parts[0] === 'faq') return faqLocales.has(locale);
    if (parts[0] === 'recent') return published.some(a => a.locale === locale);
    if (parts[0] === 'tags') return published.some(a => a.locale === locale && (a.data.tags ?? []).some((t: string) => {
      if (parts.length === 1) return true;
      const folded = t.trim().toLowerCase().replace(/[\s_]+/g, '-');
      return (/[^a-z0-9-]/.test(folded) ? t.trim() : folded) === parts.slice(1).join('/');
    }));
    return undefined; // Custom pages retain their explicit robots directive.
  };
  const required = new Set<string>();
  for (const language of languages) {
    const prefix = language === game.defaultLanguage ? '/' : `/${language}/`;
    for (const suffix of ['', 'faq/', 'recent/', 'tags/', ...categories.map(c => `${c}/`), ...['about', 'contact', 'copyright', 'privacy-policy', 'terms-of-service'].map(c => `${c}/`)]) {
      if (expected(prefix + suffix) === true) required.add(prefix + suffix);
    }
  }
  for (const a of published) if (languages.includes(a.locale) && !a.data.noindex) required.add(a.route);
  return { expected, required, split };
}
export interface AuditPage { html: string; indexed: boolean }
export function auditIndexSets(input: {
  origin: string; pages: Map<string, AuditPage>; sitemaps: string[]; robots: string; testOnly: boolean;
  expected?: (route: string) => boolean | undefined; required?: Set<string>; localeFor?: (route: string) => string;
}) {
  const { origin, pages, robots } = input;
  const errors: string[] = [], submitted = new Set<string>();
  const target = (value: string | undefined, owner: string): string | null => {
    try {
      const u = new URL(value ?? '');
      if (u.origin !== origin || u.search || u.hash) throw new Error();
      return routeKey(u.pathname);
    } catch { errors.push(`${owner}: invalid/foreign URL`); return null; }
  };
  const alternate = (tag: string, owner: string) => {
    const destination = target(attr(tag, 'href'), owner);
    if (!destination || !pages.get(destination)?.indexed || input.expected?.(destination) === false) errors.push(`${owner}: hreflang points at missing/noindex/untranslated page`);
    const language = attr(tag, 'hreflang');
    if (destination && language !== 'x-default' && input.localeFor && language !== input.localeFor(destination)) errors.push(`${owner}: hreflang language does not match destination`);
  };
  for (const [route, page] of pages) {
    const expected = input.expected?.(route);
    if (expected !== undefined && expected !== page.indexed) errors.push(`${route}: robots/noindex differs from source translation/content policy`);
    if (page.indexed && !input.testOnly && ['*', 'googlebot', 'bingbot'].some(bot => robotsBlocked(robots, route, bot))) errors.push(`${route}: indexable page blocked by robots.txt`);
    const links = tags(page.html, 'link').filter(t => attr(t, 'rel') === 'alternate' && attr(t, 'hreflang'));
    if (!page.indexed && links.length) errors.push(`${route}: noindex page advertises hreflang`);
    for (const link of links) alternate(link, route);
  }
  for (const xml of input.sitemaps) {
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<urlset(?:\s[^>]*)?>[\s\S]*<\/urlset>\s*$/i.test(xml) || /<!DOCTYPE/i.test(xml)) errors.push('Invalid sitemap urlset document');
    for (const item of xml.matchAll(/<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi)) {
      const value = item[1].match(/<loc>([^<]*)<\/loc>/)?.[1];
      const route = target(value ? decodeXml(value) : undefined, 'Sitemap');
      if (!route) continue;
      if (submitted.has(route)) errors.push(`Duplicate sitemap URL ${route}`);
      submitted.add(route);
      if (!pages.get(route)?.indexed || input.expected?.(route) === false) errors.push(`Sitemap points at missing/noindex/untranslated page ${route}`);
      for (const link of tags(item[1], 'xhtml:link')) alternate(link, `Sitemap ${route}`);
    }
  }
  for (const [route, page] of pages) if (page.indexed && !submitted.has(route)) errors.push(`Indexable page missing from sitemap ${route}`);
  for (const route of input.required ?? []) if (!pages.has(route) || !submitted.has(route)) errors.push(`Required source page missing from HTML/sitemap ${route}`);
  if (input.testOnly && !robotsBlocked(robots, '/')) errors.push('Test-only site must block crawling');
  return { errors, submitted };
}
