import { configureGame } from './lib/configure-game';
import { loadGame } from './lib/gameforge';
import { runScript } from './lib/run';
configureGame();
if (loadGame()) runScript(process.cwd(), 'scripts/gen-assets.ts');
