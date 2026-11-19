// Runs the end-to-end walkthrough against a throwaway data folder.
//   npm run test:e2e        (on Linux it uses xvfb-run when available)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-e2e-'));
const media = path.join(tmp, 'media');
fs.mkdirSync(media, { recursive: true });
// A few stand-in work samples.
const colors = [['#8e4a2b', 'Listening Lattice'], ['#4f6b35', 'Field Notes I'], ['#3f5d78', 'Night Tuning'], ['#9b6a12', 'Harmonic Garden']];
for (const [i, [c, label]] of colors.entries()) {
  const out = path.join(media, `${label}.png`);
  const r = spawnSync('convert', ['-size', '800x600', `gradient:${c}-#f4f1ea`, '-gravity', 'center', '-pointsize', '48', '-fill', '#ffffff', '-annotate', '0', label, out]);
  if (r.status !== 0) fs.copyFileSync(path.join(root, 'build/icon.png'), out);
  if (i === 3) fs.writeFileSync(path.join(media, 'Harmonic Garden (excerpt).mp3'), Buffer.alloc(2048));
}
fs.writeFileSync(path.join(media, 'CV 2026.pdf'), '%PDF-1.4\n% stand-in\n');

const env = {
  ...process.env,
  ATELIER_E2E: '1',
  ATELIER_USER_DATA: path.join(tmp, 'data'),
  ATELIER_UPDATE_API: 'http://127.0.0.1:47131',
  ATELIER_E2E_MEDIA: media,
  ATELIER_E2E_OUT: path.join(tmp, 'out'),
  ATELIER_SCREENSHOT_DIR: path.join(root, 'test/.tmp/shots'),
};
// ATELIER_E2E_APP=/path/to/packaged/binary runs the walkthrough against a packaged build.
const packaged = process.env.ATELIER_E2E_APP;
if (packaged) env.ATELIER_E2E_DRIVER = path.join(root, 'test/e2e/driver.mjs');
let cmd = packaged || electron;
let args = packaged ? [] : [root];
if (process.platform === 'linux') {
  args = ['--no-sandbox', '--disable-gpu', ...args];
  if (!process.env.DISPLAY) { args = ['-a', '-s', '-screen 0 1600x1000x24', cmd, ...args]; cmd = 'xvfb-run'; }
}
const r = spawnSync(cmd, args, { env, stdio: 'inherit', timeout: 15 * 60 * 1000 });
console.log(`Screenshots: ${env.ATELIER_SCREENSHOT_DIR}`);
process.exit(r.status ?? 1);
