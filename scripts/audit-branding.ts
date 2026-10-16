import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadGame, gameSchema } from './lib/gameforge';
import { readPublicJson } from './lib/security';
import { TEMPLATE_TERMS } from './lib/branding-policy';
import { auditBranding } from './lib/branding';
import { walkFiles } from './lib/walk';

const root = process.cwd(), game = loadGame(root);
fs.mkdirSync('.gameforge', { recursive: true });
if (process.argv.includes('--repository') || !game) {
  // Legacy apply-template also builds an exported source tree without .git.
  // This is still an inventory, never an independent-site production pass.
  const files = fs.existsSync('.git')
    ? execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
    : walkFiles(root, { skipDirs: ['node_modules', 'dist', '.git', '.astro', '.gameforge', '.cache', 'coverage'] }).map(f => path.relative(root, f).replace(/\\/g, '/'));
  const findings: Array<{ file: string; line: number; terms: string[]; class: string }> = [];
  const media: Array<{ file: string; sha256: string; bytes: number }> = [];
  for (const file of files) {
    const raw = fs.readFileSync(file);
    if (/\.(?:png|jpe?g|webp|svg|ico|ttf|otf)$/.test(file)) media.push({ file, sha256: createHash('sha256').update(raw).digest('hex'), bytes: raw.length });
    if (raw.subarray(0, 8192).includes(0)) continue;
    for (const [line, text] of raw.toString('utf8').split(/\r?\n/).entries()) {
      const terms = TEMPLATE_TERMS.filter(term => text.toLowerCase().includes(term.toLowerCase()));
      if (!terms.length) continue;
      const role = /(?:^|\/)LICENSE(?:\.txt)?$/.test(file) || /^licenses\//.test(file) ? 'A' : /^(?:public\/|src\/(?:pages|locales|content)\/|src\/config\/(?:landing|site))/.test(file) ? 'C' : 'B';
      findings.push({ file, line: line + 1, terms, class: role });
    }
  }
  const report = { mode: 'repository inventory, not a production pass', trackedFiles: files.length, findings, media };
  fs.writeFileSync('.gameforge/branding-repository.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`Source inventory: ${files.length} files, ${findings.length} locations. A=required notices, B=private implementation/docs, C=public reference fixtures. See .gameforge/branding-repository.json.`);
} else {
  const peers = process.argv.flatMap((arg, i) => {
    if (arg !== '--peer-config') return [];
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error('Required: --peer-config <path>');
    return [gameSchema.parse(readPublicJson(path.resolve(process.argv[i + 1]), 'peer config'))];
  });
  const report = auditBranding(root, game, peers);
  fs.writeFileSync('.gameforge/branding-report.json', JSON.stringify(report, null, 2) + '\n');
  if (!report.passed) throw new Error(report.errors.join('\n'));
  console.log(`Brand isolation passed: ${report.files} public resources, ${report.legalNotices} intact software/dependency notices. Brand identity: ${game.siteName}.`);
}
