'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const UPDATES_ROOT = path.join(ROOT, 'studyx-releases');
const REPO = 'iulianniculescu2000-netizen/studyx-releases';
const BRANCH = 'main';
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const RELEASE_BASE_URL = `https://github.com/${REPO}/releases/download`;
const TODAY = new Date().toISOString().split('T')[0];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function walkFiles(baseDir, relDir = '') {
  const currentDir = path.join(baseDir, relDir);
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relPath = path.join(relDir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(baseDir, relPath));
    else files.push(relPath.replace(/\\/g, '/'));
  }
  return files;
}

function copyFileEnsured(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function findInstallerArtifact(version) {
  const releaseDir = path.join(ROOT, 'release');
  if (!fs.existsSync(releaseDir)) return null;

  const candidates = walkFiles(releaseDir)
    .filter((file) => file.toLowerCase().endsWith('.exe'))
    .filter((file) => /studyx/i.test(path.basename(file)))
    .filter((file) => !/unins/i.test(path.basename(file)))
    .filter((file) => path.basename(file).includes(version))
    .map((file) => {
      const absPath = path.join(releaseDir, file);
      return { relPath: file, absPath, size: fileSize(absPath) };
    })
    .sort((left, right) => right.size - left.size);

  return candidates[0] ?? null;
}

function main() {
  if (!fs.existsSync(UPDATES_ROOT)) {
    console.log('studyx-releases folder not found, skipping local sync.');
    return;
  }

  const pkg = readJson(path.join(ROOT, 'package.json'), {});
  const version = pkg.version || '1.0.0';
  const distDir = path.join(ROOT, 'dist');
  const latestYmlPath = path.join(ROOT, 'release', 'latest.yml');
  const installer = findInstallerArtifact(version);

  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('dist is missing. Run a production build first.');
  }
  if (!installer) {
    throw new Error(`Installer for ${version} is missing. Run npm run electron:build first.`);
  }
  if (!fs.existsSync(latestYmlPath)) {
    throw new Error('release/latest.yml is missing. Run npm run electron:build first.');
  }

  const distFiles = walkFiles(distDir).map((relPath) => ({
    path: `dist/${relPath}`,
    url: `${RAW_BASE_URL}/files/dist/${relPath}`,
  }));

  const filesRoot = path.join(UPDATES_ROOT, 'files');
  const distMirrorRoot = path.join(filesRoot, 'dist');
  const installersRoot = path.join(filesRoot, 'installers', version);
  const releasesRoot = path.join(UPDATES_ROOT, 'releases', `v${version}`);

  fs.rmSync(distMirrorRoot, { recursive: true, force: true });
  ensureDir(distMirrorRoot);
  ensureDir(installersRoot);
  ensureDir(releasesRoot);

  for (const file of walkFiles(distDir)) {
    copyFileEnsured(path.join(distDir, file), path.join(distMirrorRoot, file));
  }

  copyFileEnsured(installer.absPath, path.join(installersRoot, path.basename(installer.relPath)));
  copyFileEnsured(latestYmlPath, path.join(releasesRoot, 'latest.yml'));

  const manifestPath = path.join(UPDATES_ROOT, 'manifests', `${version}.json`);
  const existingManifest = readJson(manifestPath, {});
  const nextManifest = {
    ...existingManifest,
    version,
    latestVersion: version,
    releaseDate: TODAY,
    files: distFiles,
    installer: {
      fileName: path.basename(installer.relPath),
      url: `${RELEASE_BASE_URL}/v${version}/${path.basename(installer.relPath)}`,
      sha256: sha256(installer.absPath),
      size: installer.size,
    },
  };

  const historyPath = path.join(UPDATES_ROOT, 'version-history.json');
  const existingHistory = readJson(historyPath, { versions: [] });
  const versions = Array.isArray(existingHistory.versions) ? existingHistory.versions : [];
  const nextHistory = {
    versions: [
      ...versions.filter((entry) => entry && entry.version !== version),
      {
        version,
        manifestUrl: `${RAW_BASE_URL}/manifests/${version}.json`,
        releaseDate: nextManifest.releaseDate,
        description: nextManifest.description || `StudyX ${version}`,
      },
    ].sort((left, right) => String(left.version).localeCompare(String(right.version), undefined, { numeric: true })),
  };

  writeJson(manifestPath, nextManifest);
  writeJson(path.join(UPDATES_ROOT, 'version.json'), {
    version,
    manifestUrl: `${RAW_BASE_URL}/manifests/${version}.json`,
  });
  writeJson(historyPath, nextHistory);

  console.log(`studyx-releases synced for v${version}.`);
}

main();
