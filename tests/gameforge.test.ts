import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gameSchema, planKeywords, evidenceErrors, sourceSchema } from '../scripts/lib/gameforge';
import { integrationVars, configureGame } from '../scripts/lib/configure-game';
import { indexableLocalePage } from '../src/lib/gameforge-indexing';

const fixture = JSON.parse(fs.readFileSync(path.resolve('fixtures/games/roblox/game.config.json'), 'utf8'));
const game = gameSchema.parse(fixture);
const keyword = { topicName: 'Beginner Guide', category: 'guides', keyword: 'test beginner', slug: 'beginner', intent: 'learn basics', priority: 1, evidenceStatus: 'pending', pageType: 'beginner-guide' };
const source = sourceSchema.parse({ id: 'official', url: 'https://fixture.example/official', title: 'Test fixture', kind: 'official', verified: true, verifiedAt: '2026-01-01', version: 'fixture-1', notes: 'Fictional fixture only' });
const publicArticle = { evidenceStatus: 'verified', reviewedBy: 'Fixture reviewer', reviewedAt: '2026-01-02', gameVersion: 'fixture-1', sourceIds: ['official'] };

describe('GameForge input and publishing safety', () => {
  it('compiles repeatedly without touching the interface, and retires old identities after a rebrand', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameforge-config-'));
    try {
      for (const rel of ['src/config/site.ts', 'src/config/navigation.ts', 'src/i18n/routing.ts', 'src/i18n/ui.ts', 'src/styles/globals.css', 'src/locales/en.json', 'public/manifest.json']) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(rel, path.join(dir, rel));
      }
      fs.mkdirSync(path.join(dir, '.gameforge'));
      fs.copyFileSync('src/locales/en.json', path.join(dir, '.gameforge/ui-base.json'));
      fs.copyFileSync('fixtures/games/roblox/facts.json', path.join(dir, 'facts.json'));
      fs.writeFileSync(path.join(dir, 'game.config.json'), JSON.stringify(game));
      configureGame(dir);
      const first = fs.readFileSync(path.join(dir, 'src/config/site.ts'), 'utf8');
      configureGame(dir);
      expect(fs.readFileSync(path.join(dir, 'src/config/site.ts'), 'utf8')).toBe(first);
      expect(first).toContain('export interface SiteConfig');
      expect(first).toContain('export const site: SiteConfig');
      const next = { ...game, gameName: 'Fixture Second Game', siteName: 'Fixture Second Wiki', domain: 'second-fixture.example', description: 'An explicitly fictional second game used only for template rebrand regression tests.', homepage: { intro: 'Fictional second-game configuration for a rebrand regression test.', facts: [], faq: [], modules: [] } };
      fs.writeFileSync(path.join(dir, 'game.config.json'), JSON.stringify(next)); configureGame(dir);
      expect(fs.readFileSync(path.join(dir, 'src/locales/en.json'), 'utf8')).not.toContain(game.gameName);
      expect(JSON.parse(fs.readFileSync(path.join(dir, '.gameforge/retired-identities.json'), 'utf8'))).toContain(game.domain);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
  it('only indexes translated home and real collection pages; fixed English legal pages stay English', () => {
    expect(indexableLocalePage('/ja/', 'ja', 'en', ['en'], ['guides'])).toBe(false);
    expect(indexableLocalePage('/ja/', 'ja', 'en', ['en', 'ja'], ['guides'])).toBe(true);
    expect(indexableLocalePage('/ja/about/', 'ja', 'en', ['en', 'ja'], ['guides'])).toBe(false);
    expect(indexableLocalePage('/ja/guides/', 'ja', 'en', ['en'], ['guides'])).toBe(true);
  });
  it.each(['https://bad.example', 'bad.example/path', 'bad.example/', 'bad.example:8080', 'bad.example?x=1', '../escape'])('rejects invalid domain %s', domain => expect(gameSchema.safeParse({ ...fixture, domain }).success).toBe(false));
  it('rejects path traversal and reserved route categories', () => {
    expect(gameSchema.safeParse({ ...fixture, navigation: [{ key: '../codes', label: 'x' }] }).success).toBe(false);
    expect(gameSchema.safeParse({ ...fixture, navigation: [{ key: 'landing', label: 'x' }] }).success).toBe(false);
  });
  it('rejects duplicate locales and navigation', () => {
    expect(gameSchema.safeParse({ ...fixture, supportedLanguages: ['en', 'en'] }).success).toBe(false);
    expect(gameSchema.safeParse({ ...fixture, navigation: [...fixture.navigation, fixture.navigation[0]] }).success).toBe(false);
  });
  it('filters unrelated terms and merges explicit synonyms', () => {
    const plan = planKeywords([keyword, { ...keyword, keyword: 'synonym', canonicalKeyword: keyword.keyword }, { ...keyword, relevant: false }], game);
    expect(plan.keywords).toHaveLength(1); expect(plan.merged).toEqual(['synonym']);
  });
  it('fails ambiguous synonyms instead of silently merging distinct intents', () => expect(() => planKeywords([keyword, { ...keyword, intent: 'different' }], game)).toThrow('Conflicting synonym intent'));
  it('fails route collisions before writing', () => expect(() => planKeywords([keyword, { ...keyword, keyword: 'other' }], game)).toThrow('Slug collision'));
  it('rejects unknown category and language', () => {
    expect(() => planKeywords([{ ...keyword, category: 'unknown' }], game)).toThrow('Unknown category');
    expect(() => planKeywords([{ ...keyword, locale: 'es' }], game)).toThrow('Unknown locale');
  });
  it('allows verified, version-matched and human-reviewed material', () => expect(evidenceErrors(publicArticle, [source])).toEqual([]));
  it('blocks missing, disputed, unverified and mismatched sources', () => {
    expect(evidenceErrors(publicArticle, [])).not.toEqual([]);
    expect(evidenceErrors({ ...publicArticle, evidenceStatus: 'disputed' }, [source])).not.toEqual([]);
    expect(evidenceErrors(publicArticle, [{ ...source, verified: false }])).not.toEqual([]);
    expect(evidenceErrors(publicArticle, [{ ...source, version: 'other' }])).toContain('Source version differs from gameVersion');
  });
  it('never treats community rumors as sufficient proof', () => expect(evidenceErrors(publicArticle, [{ ...source, kind: 'community' }])).toContain('Community claims need corroboration'));
  it('requires a reviewer and valid chronology', () => {
    expect(evidenceErrors({ ...publicArticle, reviewedBy: '' }, [source])).not.toEqual([]);
    expect(evidenceErrors({ ...publicArticle, reviewedAt: '2025-01-01' }, [source])).toContain('Review must follow source verification');
  });
  it('disables ads/comments/analytics even when optional public IDs are present', () => {
    const configured = gameSchema.parse({ ...fixture, analytics: { ga4: 'G-TEST123' }, advertising: { adsenseClient: 'ca-pub-123' } });
    const vars = integrationVars(configured);
    expect(vars.PUBLIC_GA_ID).toBe(''); expect(vars.PUBLIC_ADSENSE_CLIENT).toBe(''); expect(vars.PUBLIC_GISCUS_REPO).toBe('');
  });
  it('requires image alt and caps homepage modules', () => {
    expect(gameSchema.safeParse({ ...fixture, homepage: { ...fixture.homepage, heroImage: '/images/hero.webp', heroAlt: undefined } }).success).toBe(false);
    expect(gameSchema.safeParse({ ...fixture, homepage: { ...fixture.homepage, modules: Array.from({ length: 9 }, () => ({ category: 'guides', title: 'x', description: 'x' })) } }).success).toBe(false);
  });
  it('rejects future dates and invalid calendar dates', () => {
    expect(sourceSchema.safeParse({ ...source, verifiedAt: '2999-01-01' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, verifiedAt: '2026-02-30' }).success).toBe(false);
  });
});
