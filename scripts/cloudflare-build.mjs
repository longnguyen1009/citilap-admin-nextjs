import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// OpenNext recreates traced directory symlinks without specifying their type.
// Windows junctions avoid the administrator/Developer Mode requirement.
// Restrict this adjustment to this build process and generated output only.
if (process.platform === 'win32') {
  const original = fs.symlinkSync;
  const outputRoot = path.resolve('.open-next');
  fs.symlinkSync = function (target, destination, type) {
    const output = path.resolve(destination);
    const relative = path.relative(outputRoot, output);
    const resolvedTarget = path.resolve(path.dirname(output), target);
    if (!type && relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      && fs.statSync(resolvedTarget).isDirectory()) {
      return original(resolvedTarget, output, 'junction');
    }
    return original(target, destination, type);
  };
  syncBuiltinESMExports();
}
const require = createRequire(import.meta.url);
const entry = path.resolve(path.dirname(require.resolve('@opennextjs/cloudflare')), '../cli/index.js');
process.argv = [process.execPath, entry, 'build', ...process.argv.slice(2)];
await import(pathToFileURL(entry).href);
