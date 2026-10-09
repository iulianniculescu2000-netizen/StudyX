const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf-8');
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureIncludes(filePath, fragment) {
  ensure(read(filePath).includes(fragment), `${filePath} nu conține fragmentul așteptat: ${fragment}`);
}

function ensureExists(relativePath) {
  ensure(fs.existsSync(path.join(root, relativePath)), `Lipsește fișierul critic: ${relativePath}`);
}

function main() {
  const pkg = JSON.parse(read('package.json'));

  ['build', 'lint', 'verify:runtime', 'verify:all'].forEach((scriptName) => {
    ensure(pkg.scripts?.[scriptName], `Script lipsă în package.json: ${scriptName}`);
  });

  [
    'electron/main.cjs',
    'electron/preload.cjs',
    'src/lib/groq.ts',
    'src/lib/aiRequestGovernor.ts',
    'src/store/diagnosticsStore.ts',
    'src/index.css',
    'src/pages/Settings.tsx',
  ].forEach(ensureExists);

  ensureIncludes('electron/preload.cjs', 'storageSave');
  ensureIncludes('electron/preload.cjs', 'storageLoad');
  ensureIncludes('electron/main.cjs', 'scheduleDailyReminder');
  ensureIncludes('electron/main.cjs', 'readDiskLastStudyDate');
  ensureIncludes('src/lib/groqCore/governors.ts', 'groqGovernor');
  ensureIncludes('src/store/diagnosticsStore.ts', 'events:');
  ensureIncludes('src/index.css', '.page-title');
  ensureIncludes('src/index.css', '.section-title');
  ensureIncludes('src/pages/Settings.tsx', 'Evenimente recente');

  console.log('verify-runtime: ok');
}

try {
  main();
} catch (error) {
  console.error('verify-runtime: failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
