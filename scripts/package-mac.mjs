// Builds Atelier.app for macOS (Apple silicon by default) into out/.
//
//   npm run dist:mac                 → out/Atelier-darwin-arm64/Atelier.app
//   ARCH=x64 npm run dist:mac        → Intel build
//
// On a Mac the app is then ad-hoc signed and zipped as out/Atelier-<version>-mac-<arch>.zip,
// the file the in-app updater looks for.
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const arch = process.env.ARCH || 'arm64';
// PLATFORM=linux builds the same bundle layout for Linux; used only to test packaging off a Mac.
const platform = process.env.PLATFORM || 'darwin';

execFileSync(process.execPath, [path.join(root, 'scripts/build-renderer.mjs'), '--production'], { stdio: 'inherit' });

const keep = [
  /^\/package\.json$/,
  /^\/src$/, /^\/src\/config\.mjs$/,
  /^\/src\/main(\/|$)/, /^\/src\/preload(\/|$)/, /^\/src\/shared(\/|$)/,
  /^\/src\/renderer$/, /^\/src\/renderer\/(index\.html|browser\.html|browser\.js|browser\.css|theme\.css|styles\.css)$/, /^\/src\/renderer\/dist(\/|$)/,
  /^\/node_modules(\/|$)/,
];

const [appDir] = await packager({
  dir: root,
  name: 'Atelier',
  executableName: 'Atelier',
  platform,
  arch,
  out: path.join(root, 'out'),
  overwrite: true,
  asar: true,
  prune: true,
  icon: path.join(root, 'build/icon.icns'),
  appBundleId: 'com.guitarherofree.atelier',
  appCategoryType: 'public.app-category.productivity',
  appVersion: pkg.version,
  buildVersion: pkg.version,
  appCopyright: `© ${new Date().getFullYear()} Freeman Edwards`,
  darwinDarkModeSupport: true,
  extendInfo: {
    LSMinimumSystemVersion: '12.0',
    NSHumanReadableCopyright: `© ${new Date().getFullYear()} Freeman Edwards`,
  },
  ignore: (file) => {
    if (!file) return false;
    if (file.endsWith('.map')) return true;
    return !keep.some((re) => re.test(file));
  },
});

const app = path.join(appDir, 'Atelier.app');
if (platform !== 'darwin') {
  console.log(`Built ${appDir} (test build)`);
  process.exit(0);
}
console.log(`Built ${app}`);

if (process.platform === 'darwin') {
  // Ad-hoc signature: Apple silicon requires a signature to run the app.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  const zip = path.join(root, 'out', `Atelier-${pkg.version}-mac-${arch}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip], { stdio: 'inherit' });
  console.log(`Zipped ${zip}`);
} else {
  console.log('Not on macOS: skipping signing and zipping (the GitHub Actions workflow does this on a Mac).');
}
