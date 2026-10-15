import { validateEvidence } from './lib/gameforge';
validateEvidence(process.cwd());
console.log('Evidence gate passed (upstream fixtures exempt; configured sites enforced).');
