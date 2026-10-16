import { loadGame } from './lib/gameforge';
import { publishNotices } from './lib/branding';
if (loadGame()) publishNotices(process.cwd());
