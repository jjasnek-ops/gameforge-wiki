import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityValues } from './branding';
import { articles, loadGame, type GameConfig, loadFacts } from './gameforge';
import { rewriteSiteTs, rewriteLocaleJson, buildLocaleLabels, buildUiImports, buildUiMessagesEntries, UI_IMPORT_BLOCK_RE, UI_MESSAGES_BLOCK_RE, tsEscape, parseSiteTsIdentity, type SkinInput } from './apply-rewrites';

export function configureGame(root = process.cwd()) {
  const g = loadGame(root);
  if (!g) return;
  if (process.env.SITE_URL && process.env.SITE_URL.replace(/\/$/, '') !== `https://${g.domain}`) throw new Error('SITE_URL conflicts with game.config.json; update the config, not a second domain source');
  const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');
  const write = (f: string, value: string) => {
    const file = path.join(root, f);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file) || read(f) !== value) fs.writeFileSync(file, value, 'utf8');
  };
  const langs = g.featureFlags.multilingual ? g.supportedLanguages : [g.defaultLanguage];
  const input: SkinInput = {
    gameName: g.gameName, shortName: g.shortName, domain: g.domain, description: g.description,
    tagline: g.homepage.intro, legalNotice: `${g.siteName} is an independent fan site for ${g.gameName}. Not affiliated with the developer.`,
    themeHex: g.themeColor, platform: g.platform, genre: g.genre, developer: g.developer,
    releaseDate: g.releaseDate ?? '', officialUrl: g.officialUrl,
    locales: langs, categories: g.navigation, clearContent: false, clearLanding: false, homePreset: 'guides',
  };
  const original = read('src/config/site.ts');
  const old = parseSiteTsIdentity(original);
  const retiredFile = '.gameforge/retired-identities.json';
  const retired: string[] = fs.existsSync(path.join(root, retiredFile)) ? JSON.parse(read(retiredFile)) : [];
  if (old && old.gameName !== g.gameName) retired.push(old.gameName);
  if (old && old.domain !== g.domain) retired.push(old.domain);
  write(retiredFile, JSON.stringify([...new Set(retired)].filter(term => term !== g.gameName && term !== g.domain)) + '\n');
  let site = rewriteSiteTs(original, input);
  if (!site) throw new Error('site.ts rewrite contract changed');
  const blockStart = site.indexOf('export const site: SiteConfig');
  const prefix = site.slice(0, blockStart);
  site = prefix + site.slice(blockStart).replace(/name: '[^\n]*',/, () => `name: '${tsEscape(g.siteName)}',`)
    .replace(/contactEmail: '[^\n]*',/, () => `contactEmail: '${tsEscape(g.contactEmail ?? '')}',`)
    .replace(/  social: \{[\s\S]*?\n  \},/, () => `  social: {\n${[['official', g.officialUrl], ['discord', g.discordUrl], ['youtube', g.youtubeUrl], ['twitter', g.twitterUrl], ['reddit', g.redditUrl]].filter(([, value]) => value).map(([field, value]) => `    ${field}: '${tsEscape(value!)}',`).join('\n')}\n  },`)
    .replace(/  sameAs: \[[\s\S]*?\],\n/, '');
  // No publisher/contact metadata survives from a previous game.
  const objectStart = site.indexOf('export const site: SiteConfig');
  site = site.slice(0, objectStart) + site.slice(objectStart).replace(/  defaultAuthor: '[^\n]*',\n/g, '').replace(/  ogImageWidth:/, () => `  defaultAuthor: '${tsEscape(g.siteName)}',\n  ogImageWidth:`);
  write('src/config/site.ts', site);
  write('src/config/affiliates.ts', read('src/config/affiliates.ts').replace(/export const affiliates: AffiliateConfig = \{[\s\S]*?\n\};/, () => `export const affiliates: AffiliateConfig = ${JSON.stringify({ suggestions: g.advertising.suggestions }, null, 2)};`));
  const values = identityValues(g);
  const identityFile = '.gameforge/identity-values.json';
  const retiredValuesFile = '.gameforge/retired-brand-values.json';
  const previous: string[] = fs.existsSync(path.join(root, identityFile)) ? JSON.parse(read(identityFile)) : [];
  const priorRetired: string[] = fs.existsSync(path.join(root, retiredValuesFile)) ? JSON.parse(read(retiredValuesFile)) : [];
  write(retiredValuesFile, JSON.stringify([...new Set([...priorRetired, ...previous])].filter(v => v.length >= 8 && !values.includes(v))) + '\n');
  write(identityFile, JSON.stringify(values) + '\n');
  write('src/config/project.ts', `// Independent site; no template marketing routes.\nexport const landingLinkEnabled = false;\nexport const landingLink = { href: '/', label: '', ariaLabel: '' } as const;\nexport const zhLandingLink = { label: '', href: '/' } as const;\nexport const demoRootGateway = { target: '/', linkLabel: '', title: ${JSON.stringify(g.siteName)}, description: ${JSON.stringify(g.description)} } as const;\n`);
  if (fs.existsSync(path.join(root, 'public/_headers'))) write('public/_headers', read('public/_headers').replace(/# Deployment synchronization[\s\S]*?(?=# Ad unit pages)/, ''));

  write('src/config/navigation.ts', read('src/config/navigation.ts').replace(
    /export const NAVIGATION_CONFIG: NavigationItem\[\] = \[[\s\S]*?\];/,
    () => `export const NAVIGATION_CONFIG: NavigationItem[] = [\n${g.navigation.map(n => `  { key: '${n.key}', path: '/${n.key}', icon: '${n.icon}', isContentType: true },`).join('\n')}\n];`,
  ));
  const routing = read('src/i18n/routing.ts')
    .replace(/export const locales = \[[\s\S]*?\] as const;/, () => `export const locales = ${JSON.stringify(langs)} as const;`)
    .replace(/export const defaultLocale: Locale = '[^']+';/, () => `export const defaultLocale: Locale = '${g.defaultLanguage}';`)
    .replace(/export const LOCALE_LABELS: Record<Locale, string> = \{[\s\S]*?\};/, () => `export const LOCALE_LABELS: Record<Locale, string> = {\n${buildLocaleLabels(langs)}\n};`);
  write('src/i18n/routing.ts', routing);
  write('src/i18n/ui.ts', read('src/i18n/ui.ts').replace(UI_IMPORT_BLOCK_RE, () => `${buildUiImports([...new Set(['en', ...langs])])}\n`)
    .replace(UI_MESSAGES_BLOCK_RE, () => `const messages: Record<Locale, Record<string, unknown>> = {\n${buildUiMessagesEntries(langs)}\n};`));
  const c = hexHsl(g.themeColor);
  let dark = false;
  const css = read('src/styles/globals.css').split('\n').map(line => {
    if (/^\s*:root\s*\{/.test(line)) dark = false;
    if (/^\s*\.dark\s*\{/.test(line)) dark = true;
    const s = Math.max(0, c.s - (dark ? 5 : 0));
    const l = Math.max(0, Math.min(100, c.l - (dark ? 4 : 0)));
    return line.replace(/(--brand:\s*)[^;]+;/, `$1${c.h} ${s}% ${l}%;`)
      .replace(/(--brand-light:\s*)[^;]+;/, `$1${c.h} ${s}% ${Math.min(100, l + 10)}%;`)
      .replace(/(--brand-h:\s*)[^;]+;/, `$1${c.h};`).replace(/(--brand-s:\s*)[^;]+;/, `$1${s}%;`);
  }).join('\n');
  write('src/styles/globals.css', css);
  const published = articles(root).filter(a => a.data.draft !== true && !a.data.noindex);
  const facts = loadFacts(root);
  for (const lang of [...new Set(['en', ...langs])]) {
    const file = `src/locales/${lang}.json`;
    const seed = fs.existsSync(path.join(root, `.gameforge/ui-${lang}.json`)) ? read(`.gameforge/ui-${lang}.json`) : read('.gameforge/ui-base.json');
    const base = fs.existsSync(path.join(root, file)) ? read(file) : seed;
    const ui = JSON.parse(rewriteLocaleJson(input, lang, new Date().getUTCFullYear(), seed));
    const custom = JSON.parse(base);
    for (const field of ['search', 'shared', 'footer']) if (custom[field]) ui[field] = { ...ui[field], ...custom[field] };
    ui.site.name = g.siteName;
    ui.footer.copyrightText = `© ${new Date().getUTCFullYear()} ${g.siteName}`;
    ui.footer.playGame = `Play ${g.gameName}`;
    for (const n of g.navigation) {
      const label = lang === g.defaultLanguage ? n.label : custom.nav?.[n.key] ?? JSON.parse(seed).nav?.[n.key] ?? n.label;
      ui.nav[n.key] = label;
      const languageMarker = lang === g.defaultLanguage ? '' : ` (${lang})`;
      ui.overview[n.key] = {
        overviewTitle: `All ${g.gameName} ${label}${languageMarker}`,
        overviewDescription: ui.shared.defaultListDescription.replace('{title}', `${g.gameName} ${label}`).slice(0, 155) + languageMarker,
      };
    }
    // Explicitly translated home copy is content; never overwrite it during a build.
    if (lang !== g.defaultLanguage && g.translatedLanguages.includes(lang)) {
      const existing = JSON.parse(base);
      if (!existing.home || existing.home.hero?.description === g.homepage.intro) throw new Error(`Provide real localized home copy before declaring ${lang} translated`);
      ui.home = existing.home;
    } else {
      const active = g.navigation.filter(n => published.some(a => path.relative(path.join(root, 'src/content/wiki'), a.file).replace(/\\/g, '/').startsWith(`${lang}/${n.key}/`)));
      ui.home.meta = { title: g.siteName, description: g.description };
      ui.home.hero = { ...ui.home.hero, badge: g.platform, title: g.siteName, description: g.homepage.intro, ctaPrimary: ui.footer.playGame, ctaSecondary: active[0]?.label ?? '', videoId: '', stats: [] };
      ui.home.start.cards = active.slice(0, 4).map((n, i) => ({ number: String(i + 1).padStart(2, '0'), title: n.label, description: ui.overview[n.key].overviewDescription, icon: n.icon, href: `/${n.key}/` }));
      ui.home.popular.quickLinks = active.map(n => ({ label: n.label, href: `/${n.key}/` }));
      ui.home.explore.modules = g.homepage.modules.filter(m => active.some(n => n.key === m.category)).map((m, i) => ({ order: i, name: m.title, description: m.description, href: `/${m.category}/`, displayType: 'labeled-cards', highlights: [] }));
      ui.home.faq = { title: `${g.gameName} FAQ`, description: `Answers to common questions about ${g.gameName}. ${g.description}`.slice(0, 165), items: g.homepage.faq.map(({ question, answer }) => ({ question, answer })) };
      ui.home.closingCta = { title: '', description: '', primary: '', secondary: '' };
    }
    write(file, JSON.stringify(ui, null, 2) + '\n');
    fs.mkdirSync(path.join(root, 'src/content/wiki', lang), { recursive: true });
  }
  write('src/config/features.ts', `// Generated from game.config.json. Do not edit.\nexport const gameforgeEnabled = true;\nexport const features = ${JSON.stringify(g.featureFlags, null, 2)};\nexport const homepageInfo: { intro: string; heroImage?: string; heroAlt?: string; facts: Array<{label: string; value: string; sourceUrl: string}>; sourcesLabel: string } = ${JSON.stringify({ intro: g.homepage.intro, heroImage: g.homepage.heroImage, heroAlt: g.homepage.heroAlt, sourcesLabel: 'Sources', facts: g.homepage.facts.map(f => ({ label: f.label, value: f.value, sourceUrl: facts.find(s => s.id === f.sourceId)?.url ?? '' })) }, null, 2)};\nexport const indexedLanguages: string[] = ${JSON.stringify([g.defaultLanguage, ...g.translatedLanguages])};\nexport const templateCredit = ${JSON.stringify({ enabled: g.branding.showTemplateCredit, label: 'Built with GameForge Wiki', url: 'https://github.com/jjasnek-ops/gameforge-wiki' })};\n`);
  write('public/manifest.json', JSON.stringify({ ...JSON.parse(read('public/manifest.json')), name: g.siteName, short_name: g.shortName, description: g.description, theme_color: g.themeColor }, null, 2) + '\n');
  const vars = integrationVars(g);
  write('wrangler.toml', `# Generated from game.config.json. Public IDs only; no secrets.\nname = ${JSON.stringify(g.domain.replace(/\./g, '-'))}\ncompatibility_date = "2026-10-01"\npages_build_output_dir = "dist"\n\n[vars]\n${Object.entries(vars).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('\n')}\n`);
  write('public/ads.txt', (g.advertising.adsTxt.join('\n') || '# No authorized advertising sellers configured.') + '\n');
  write('.gameforge/site.json', JSON.stringify({ domain: g.domain, defaultLanguage: g.defaultLanguage, languages: langs, indexedLanguages: [g.defaultLanguage, ...g.translatedLanguages], testOnly: g.testOnly }) + '\n');
}
export function integrationVars(g: GameConfig): Record<string, string> {
  const f = g.featureFlags;
  const vars: Record<string, string> = {
    PUBLIC_SPONSOR_URL: f.affiliates ? g.advertising.sponsorUrl ?? '' : '', PUBLIC_SPONSOR_IMAGE_URL: f.affiliates ? g.advertising.sponsorImageUrl ?? '' : '',
    SITE_URL: `https://${g.domain}`, PUBLIC_GA_ID: f.analytics ? g.analytics.ga4 ?? '' : '',
    PUBLIC_CF_BEACON_TOKEN: f.analytics ? g.analytics.cloudflareBeaconToken ?? '' : '', PUBLIC_GSC_VERIFICATION: g.analytics.gscVerification ?? '',
    PUBLIC_ADSENSE_CLIENT: f.adsense ? g.advertising.adsenseClient ?? '' : '',
  };
  for (const pos of ['sticky', 'sidebar', 'incontent'] as const) vars[`PUBLIC_ADSENSE_SLOT_${pos.toUpperCase()}`] = f.adsense ? g.advertising.adsenseSlots[pos] ?? '' : '';
  for (const pos of ['SIDEBAR_300X250', 'INCONTENT_728X90', 'NATIVE_BANNER', 'SIDEBAR_160X300', 'SIDEBAR_160X600', 'STICKY_320X50']) vars[`PUBLIC_ADSTERRA_SLOT_${pos}`] = f.adsterra ? g.advertising.adsterraSlots[pos as keyof typeof g.advertising.adsterraSlots] ?? '' : '';
  for (const [key, field] of [['REPO', 'repo'], ['REPO_ID', 'repoId'], ['CATEGORY', 'category'], ['CATEGORY_ID', 'categoryId']] as const) vars[`PUBLIC_GISCUS_${key}`] = f.comments ? g.comments?.[field] ?? '' : '';
  return vars;
}
function hexHsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; }
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) configureGame();
