import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import type { GameConfig } from './gameforge';
import { walkFiles } from './walk';
import { secretFindings, sensitivePath } from './security';
import { attr, decodeXml } from './seo-audit';
import { BRAND_ASSETS, DEMO_MEDIA, SOFTWARE_NOTICE_SHA256, TEMPLATE_TERMS } from './branding-policy';

export const NOTICE_FILES = ['astro.txt', 'lato.txt', 'lucide.txt', 'pagefind.txt', 'site-software.txt', 'tailwindcss.txt'];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const noticeHash = (raw: string) => hash(raw.replace(/\r\n/g, '\n'));
const creditUrl = 'https://github.com/jjasnek-ops/gameforge-wiki';
export function identityValues(g: GameConfig): string[] {
  return [g.gameName, g.siteName, g.shortName, g.domain, g.contactEmail, g.officialUrl, g.discordUrl, g.youtubeUrl, g.twitterUrl, g.redditUrl,
    ...Object.values(g.analytics), g.advertising.adsenseClient, ...Object.values(g.advertising.adsenseSlots),
    ...Object.values(g.advertising.adsterraSlots), g.advertising.sponsorUrl, g.advertising.sponsorImageUrl,
    ...g.advertising.suggestions.flatMap(s => [s.url, s.title]), g.comments?.repo, g.comments?.repoId, g.comments?.categoryId].filter((v): v is string => !!v);
}
export function assetIdentity(g: GameConfig) {
  return { gameName: g.gameName, siteName: g.siteName, shortName: g.shortName, themeColor: g.themeColor };
}
export function recordBrandAssets(root: string, g: GameConfig) {
  const assets = Object.fromEntries(BRAND_ASSETS.map(rel => [rel, hash(fs.readFileSync(path.join(root, 'public', rel)))]));
  fs.mkdirSync(path.join(root, '.gameforge'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gameforge/assets.json'), JSON.stringify({ identity: assetIdentity(g), assets }, null, 2) + '\n');
}
export function validateNotices(root: string): string[] {
  const errors: string[] = [];
  let manifest: Record<string, string> = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'licenses/manifest.json'), 'utf8')); }
  catch { errors.push('Missing/invalid private license manifest'); }
  if (Object.keys(manifest).sort().join() !== NOTICE_FILES.slice().sort().join()) errors.push('Required software/dependency notices missing from manifest');
  for (const file of NOTICE_FILES) {
    const p = path.join(root, 'licenses', file);
    if (!fs.existsSync(p) || noticeHash(fs.readFileSync(p, 'utf8')) !== manifest[file]) errors.push(`Missing/changed license notice: ${file}`);
  }
  if (manifest['site-software.txt'] !== SOFTWARE_NOTICE_SHA256 || !fs.existsSync(path.join(root, 'LICENSE')) || noticeHash(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8')) !== SOFTWARE_NOTICE_SHA256) errors.push('Original MIT copyright/permission/warranty notice must remain intact');
  return errors;
}
export function publishNotices(root: string) {
  const errors = validateNotices(root);
  if (errors.length) throw new Error(errors.join('\n'));
  fs.mkdirSync(path.join(root, 'dist/licenses'), { recursive: true });
  for (const file of NOTICE_FILES) fs.copyFileSync(path.join(root, 'licenses', file), path.join(root, 'dist/licenses', file));
}
export function deploymentPathAllowed(rel: string, game: GameConfig, key?: string): boolean {
  if (sensitivePath(rel) || /(?:^|\/)(?:docs|handbook|research|competitors?|fixtures|reports?|\.agent|\.gameforge|src|scripts|node_modules|\.git)(?:\/|$)/i.test(rel) || /\.(?:map|md|mdx|csv|ya?ml|toml|log|bak)$/i.test(rel)) return false;
  if (/^(?:robots\.txt|llms\.txt|ads\.txt|rss\.xml|sitemap-index\.xml|sitemap-\d+\.xml|_headers|_redirects|manifest\.json|404\.html)$/.test(rel)) return true;
  if (key && rel === `${key}.txt`) return true; // Per-site public IndexNow proof only.
  if (NOTICE_FILES.some(file => rel === `licenses/${file}`)) return true;
  if (BRAND_ASSETS.includes(rel)) return true;
  if (/^(?:_astro|images|fonts)\/.+\.(?:js|css|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm)$/.test(rel)) return true;
  if (/^pagefind\/(?:pagefind[^/]*\.(?:js|css|json)|wasm\.[^/]+\.(?:wasm|pagefind)|(?:fragment|index)\/[^/]+\.pf_(?:fragment|index)|[^/]+\.pf_meta)$/.test(rel)) return true;
  if (game.featureFlags.adsterra && /^ads\/(?:sidebar-300x250|incontent-728x90|native-banner|sidebar-160x300|sidebar-160x600|sticky-320x50)\.html$/.test(rel)) return true;
  if (!rel.endsWith('index.html')) return false;
  const parts = rel.slice(0, -10).split('/').filter(Boolean);
  const languages = game.featureFlags.multilingual ? game.supportedLanguages : [game.defaultLanguage];
  if (languages.includes(parts[0]) && parts[0] !== game.defaultLanguage) parts.shift();
  if (!parts.length) return true;
  if (['about', 'contact', 'copyright', 'privacy-policy', 'terms-of-service', 'faq', 'recent'].includes(parts[0])) return parts.length === 1;
  return parts[0] === 'tags' || game.navigation.some(n => n.key === parts[0]);
}
export function publicTextIssues(raw: string, rel: string, game: GameConfig, peers: GameConfig[] = [], retiredValues: string[] = []): string[] {
  const errors: string[] = [];
  // Only this exact, explicitly enabled credit is allowed, never metadata or arbitrary assets.
  let text = raw.replace(/<a\b[^>]*data-template-credit="true"[^>]*>[\s\S]*?<\/a>/gi, tag => {
    if (!game.branding.showTemplateCredit || attr(tag, 'href') !== creditUrl || tag.replace(/<[^>]+>/g, '').trim() !== 'Built with GameForge Wiki') errors.push('Unexpected template credit');
    return '';
  });
  // Preserve genuine software copyright comments, not promotional comments.
  text = text.replace(/\/\*[\s\S]*?\*\//g, comment => {
    const normalized = comment.replace(/^\/\*+|\*\/$/g, '').replace(/^\s*\*\s?/gm, '').trim();
    return /^Copyright \(c\) 2026 AnvilWiki contributors\s+SPDX-License-Identifier: MIT\s*$/.test(normalized) ? '' : comment;
  });
  text = decodeXml(text).replace(/\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (_m, u, x) => String.fromCharCode(parseInt(u ?? x, 16))).replace(/\\\//g, '/');
  try { text = decodeURIComponent(text); } catch { /* invalid percent literals remain visible */ }
  if (/\b(?:create-game|apply-template|plan-content|game\.config\.json|keywords\.json|facts\.json|AGENTS\.md)\b/.test(text)) errors.push('Internal production workflow exposed');
  for (const term of [...TEMPLATE_TERMS, ...game.forbiddenTerms]) if (text.toLowerCase().includes(term.toLowerCase())) errors.push(`Internal/demo identity: ${term}`);
  const own = identityValues(game);
  for (const peer of peers) for (const value of identityValues(peer)) if (!own.includes(value) && text.includes(value)) errors.push('Another site identity/contact/integration value leaked');
  for (const value of retiredValues) if (text.includes(value)) errors.push('Retired brand/contact/integration value leaked');
  for (const link of text.matchAll(/mailto:([^"'\s<>]+)/gi)) if (link[1] !== game.contactEmail) errors.push('Contact address is not the configured site contact');
  if (/\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|GITHUB_TOKEN|CF_ACCOUNT_ID)\b/.test(text)) errors.push('Private deployment environment identifier exposed');
  if (secretFindings(text).length) errors.push('Sensitive content detected (values redacted)');
  if (rel.endsWith('.html')) {
    for (const m of text.matchAll(/<meta\s[^>]*>/gi)) if (attr(m[0], 'property') === 'og:site_name' && attr(m[0], 'content') !== game.siteName) errors.push('Wrong og:site_name');
    for (const ld of text.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const visit = (item: any, parentType?: string, field?: string) => {
          if (!item || typeof item !== 'object') return;
          const expected = parentType === 'VideoGame' && field === 'publisher' ? game.developer : game.siteName;
          if (['Organization', 'WebSite'].includes(item['@type']) && item.name !== expected) errors.push('Wrong JSON-LD publisher/site identity');
          for (const [key, child] of Object.entries(item)) if (typeof child === 'object') visit(child, item['@type'], key);
        };
        visit(JSON.parse(ld[1]));
      } catch { errors.push('Invalid JSON-LD'); }
    }
  }
  return [...new Set(errors)].map(e => `${rel}: ${e}`);
}
export function auditBranding(root: string, game: GameConfig, peers: GameConfig[] = []) {
  const errors = validateNotices(root), dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) return { passed: false, files: 0, legalNotices: 0, errors: [...errors, 'Build dist first'] };
  let manifest: Record<string, string> = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'licenses/manifest.json'), 'utf8')); }
  catch { /* validateNotices already explains this failure */ }
  const keyFile = path.join(root, '.indexnow-key');
  const key = fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : undefined;
  const files = walkFiles(dist), demoHashes = new Set(DEMO_MEDIA.map(m => m.sha256));
  let retiredValues: string[] = [];
  const retiredFile = path.join(root, '.gameforge/retired-brand-values.json');
  try {
    if (fs.existsSync(retiredFile)) {
      const values = JSON.parse(fs.readFileSync(retiredFile, 'utf8'));
      if (!Array.isArray(values) || !values.every(v => typeof v === 'string' && v.length)) throw new Error('Invalid retired values');
      retiredValues = values;
    }
  } catch { errors.push('Invalid retired brand/contact/integration record'); }
  for (const file of files) {
    const rel = path.relative(dist, file).replace(/\\/g, '/');
    if (!deploymentPathAllowed(rel, game, key)) errors.push(`${rel}: not an approved deployment resource`);
    let raw = fs.readFileSync(file);
    if (rel.startsWith('licenses/') && NOTICE_FILES.includes(path.basename(rel))) {
      if (noticeHash(raw.toString('utf8')) !== manifest[path.basename(rel)]) errors.push(`${rel}: altered legal notice`);
      continue; // Exact, intact legal notices are class A, never a branding leak.
    }
    if (demoHashes.has(hash(raw))) errors.push(`${rel}: upstream demonstration image fingerprint`);
    try {
      if (raw[0] === 0x1f && raw[1] === 0x8b) raw = gunzipSync(raw);
      else if (rel.endsWith('.br')) raw = brotliDecompressSync(raw);
    } catch { errors.push(`${rel}: invalid compressed public data`); }
    errors.push(...publicTextIssues(raw.toString('utf8'), rel, game, peers, retiredValues));
  }
  for (const name of NOTICE_FILES) if (!fs.existsSync(path.join(dist, 'licenses', name))) errors.push(`Missing distributed legal notice: ${name}`);
  try {
    const assets = JSON.parse(fs.readFileSync(path.join(root, '.gameforge/assets.json'), 'utf8'));
    if (JSON.stringify(assets.identity) !== JSON.stringify(assetIdentity(game))) errors.push('Brand assets were not regenerated for the current identity');
    for (const rel of BRAND_ASSETS) if (!fs.existsSync(path.join(dist, rel)) || hash(fs.readFileSync(path.join(dist, rel))) !== assets.assets[rel]) errors.push(`${rel}: missing/stale brand artwork`);
  } catch { errors.push('Missing/invalid local brand asset proof; run configure-game then build'); }
  try {
    const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    if (!home.includes(game.siteName)) errors.push('Homepage does not identify the configured site');
  } catch { errors.push('Missing homepage'); }
  try {
    const webManifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
    if (webManifest.name !== game.siteName || webManifest.short_name !== game.shortName) errors.push('Manifest brand differs from config');
  } catch { errors.push('Missing/invalid web manifest'); }
  return { passed: errors.length === 0, files: files.length, legalNotices: NOTICE_FILES.length, errors: [...new Set(errors)] };
}
