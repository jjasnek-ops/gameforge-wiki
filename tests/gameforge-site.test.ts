import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { articles, evidenceErrors, loadFacts, loadGame, validateEvidence, PAGE_TYPES } from '../scripts/lib/gameforge';

describe('portable game site contracts', () => {
  it('keeps the nine supported page types', () => expect(PAGE_TYPES).toHaveLength(9));
  it('never accepts an unverified public article', () => {
    expect(evidenceErrors({ draft: false }, [])).toContain('evidenceStatus must be verified');
    expect(evidenceErrors({ draft: true }, [])).toEqual([]);
  });
  it('validates the active configuration and every public source', () => {
    const game = loadGame();
    validateEvidence(process.cwd(), game);
    if (game) {
      expect(new Set(game.navigation.map(n => n.key)).size).toBe(game.navigation.length);
      const facts = loadFacts(process.cwd());
      for (const a of articles(process.cwd())) expect(evidenceErrors(a.data, facts)).toEqual([]);
    } else {
      expect(fs.existsSync('scripts/create-game.ts')).toBe(true);
    }
  });
  it('retains search, static Pages output and the mature content components', () => {
    for (const file of ['BossStatCard', 'CodesTable', 'TableOfContents']) expect(fs.existsSync(path.join('src/components/article', `${file}.astro`))).toBe(true);
    expect(fs.readFileSync('astro.config.ts', 'utf8')).toContain("output: 'static'");
    expect(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.postbuild).toContain('pagefind --site dist');
  });
});
