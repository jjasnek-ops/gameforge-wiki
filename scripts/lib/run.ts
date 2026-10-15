import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
export function runScript(root: string, script: string, args: string[] = []) {
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), path.join(root, script), ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONUTF8: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed (${result.status})`);
}
export function runPnpm(root: string, args: string[]) {
  // npm_execpath is the running pnpm JS entry point when available. All args
  // remain separate; never interpolate a domain/path into a shell command.
  const cli = process.env.npm_execpath;
  const command = cli?.match(/\.[cm]?js$/) ? process.execPath : process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  const argv = cli?.match(/\.[cm]?js$/) ? [cli, ...args] : ['pnpm', ...args];
  const result = spawnSync(command, argv, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && command.endsWith('.cmd'), env: { ...process.env, PYTHONUTF8: '1' } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed (${result.status})`);
}
