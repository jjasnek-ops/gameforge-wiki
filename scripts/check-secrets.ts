import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { secretFindings, sensitivePath } from './lib/security';
import { walkFiles } from './lib/walk';

const root = process.cwd(), staged = process.argv.includes('--staged');
const git = (args: string[]) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
let files: string[];
try {
  const gitRoot = git(['rev-parse', '--show-toplevel']).toString().trim();
  if (fs.realpathSync(gitRoot) !== fs.realpathSync(root)) throw new Error('Not a repository root');
  files = git(staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '--cached', '-z']).toString().split('\0').filter(Boolean);
} catch {
  if (staged) throw new Error('Staged scan requires a Git repository root');
  files = walkFiles(root, { skipDirs: ['node_modules', '.git', '.astro', '.wrangler', '.gameforge', 'dist', '.zcode'] }).map(f => path.relative(root, f));
  // Untracked private environment files are runtime inputs, never copy candidates.
  files = files.filter(f => !/(?:^|[\\/])(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(f) || /\.env\.(?:example|template)$/.test(f));
}
for (const name of ['game.config.json', 'facts.json', 'keywords.json']) if (!staged && fs.existsSync(name) && !files.includes(name)) files.push(name);
if (process.argv.includes('--dist')) files.push(...walkFiles(path.join(root, 'dist')).map(f => path.relative(root, f)));
files = [...new Set(files)];
const errors: string[] = [];
for (const rel of files) {
  if (sensitivePath(rel)) { errors.push(`${JSON.stringify(rel)}: forbidden sensitive filename`); continue; }
  const file = path.join(root, rel);
  if (!staged && !fs.existsSync(file)) continue;
  if (!staged && fs.lstatSync(file).isSymbolicLink()) { errors.push(`${JSON.stringify(rel)}: symbolic link cannot be scanned`); continue; }
  const raw = staged ? git(['show', `:${rel.replace(/\\/g, '/')}`]) : fs.readFileSync(file);
  if (raw.subarray(0, 8192).includes(0)) continue;
  for (const issue of secretFindings(raw.toString('utf8'))) errors.push(`${JSON.stringify(rel)}: ${issue}`);
}
if (errors.length) throw new Error(`Sensitive information check failed (values redacted):\n${errors.join('\n')}`);
console.log(`Sensitive information check passed: ${files.length} ${staged ? 'staged blobs' : 'files'}. Pattern checks do not prove absence of every possible secret.`);
