import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
let root;
try {
  root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* Fresh independent directories are not Git repositories yet. */ }
if (root && fs.realpathSync(root) === fs.realpathSync(process.cwd())) {
  let configured = '';
  try { configured = execFileSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' }).trim(); } catch { /* no custom hooks */ }
  if (configured && configured !== '.githooks') console.warn('Existing hooksPath retained; run pnpm check-secrets --staged in your pre-commit hook. CI still scans tracked files.');
  else execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
}
