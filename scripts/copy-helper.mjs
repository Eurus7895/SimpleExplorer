// Post-build step: copy extras/shellhelp.exe into dist/simpleexplorer/extras/
// so the packaged app finds the helper next to the main exe. Idempotent —
// silently skips when the helper hasn't been built yet (so `npm run build`
// keeps working on machines without MSVC).

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = 'extras/shellhelp.exe';
const DEST = 'dist/simpleexplorer/extras/shellhelp.exe';

if (!existsSync(SRC)) {
  console.log(`[copy-helper] ${SRC} not present — skipping. Build it once with MSVC; scripts/run.ps1 automates from there.`);
  process.exit(0);
}
mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SRC, DEST);
console.log(`[copy-helper] ${SRC} -> ${DEST}`);
