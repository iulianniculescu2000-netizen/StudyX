#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, '.update-config.json');
const PKG_FILE = path.join(ROOT, 'package.json');
const LOCAL_UPDATES_ROOT = path.join(ROOT, 'studyx-releases');
const UPDATES_OWNER = 'iulianniculescu2000-netizen';
const UPDATES_REPO = 'studyx-releases';
const UPDATES_BRANCH = 'main';
const RAW_BASE_URL = `https://raw.githubusercontent.com/${UPDATES_OWNER}/${UPDATES_REPO}/${UPDATES_BRANCH}`;
const RELEASE_BASE_URL = `https://github.com/${UPDATES_OWNER}/${UPDATES_REPO}/releases/download`;

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

function copyFileEnsured(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function readPkg() {
  return readJson(PKG_FILE, {});
}

function savePkg(pkg) {
  writeJson(PKG_FILE, pkg);
}

function bumpVersion(version, type) {
  const [major = 0, minor = 0, patch = 0] = String(version || '0.0.0').split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compareVersion(a, b) {
  const parse = (value) => String(value || '0.0.0').split('.').map((part) => Number(part) || 0);
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b);
  if (aMajor !== bMajor) return bMajor - aMajor;
  if (aMinor !== bMinor) return bMinor - aMinor;
  return bPatch - aPatch;
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

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function collectDistFiles() {
  const distDir = path.join(ROOT, 'dist');
  return walkFiles(distDir).map((relPath) => ({
    relPath: `dist/${relPath}`,
    absPath: path.join(distDir, relPath),
  }));
}

function findInstallerArtifact(expectedVersion = '') {
  const releaseDir = path.join(ROOT, 'release');
  if (!fs.existsSync(releaseDir)) return null;
  const candidates = walkFiles(releaseDir)
    .filter((file) => file.toLowerCase().endsWith('.exe'))
    .filter((file) => /studyx/i.test(path.basename(file)))
    .filter((file) => !/unins/i.test(path.basename(file)))
    .filter((file) => !expectedVersion || path.basename(file).includes(expectedVersion))
    .map((file) => {
      const absPath = path.join(releaseDir, file);
      return { relPath: file, absPath, size: fileSize(absPath) };
    })
    .sort((left, right) => right.size - left.size);
  return candidates[0] ?? null;
}

function githubRequest(method, endpoint, token, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'User-Agent': 'StudyX-Publisher/2.0',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch {
          if (res.statusCode >= 400) reject(new Error(data || `HTTP ${res.statusCode}`));
          else resolve({});
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('GitHub API timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function githubUser(token) {
  return githubRequest('GET', '/user', token);
}

function createRepo(token) {
  return githubRequest('POST', '/user/repos', token, {
    name: UPDATES_REPO,
    description: 'StudyX update manifests and binaries',
    private: false,
    auto_init: true,
  }).catch((err) => {
    if (String(err.message).includes('name already exists')) return { alreadyExists: true };
    throw err;
  });
}

function repoEndpoint(suffix) {
  return `/repos/${UPDATES_OWNER}/${UPDATES_REPO}${suffix}`;
}

function getRef(token) {
  return githubRequest('GET', repoEndpoint(`/git/ref/heads/${UPDATES_BRANCH}`), token);
}

function getCommit(token, sha) {
  return githubRequest('GET', repoEndpoint(`/git/commits/${sha}`), token);
}

function createBlob(token, content) {
  return githubRequest('POST', repoEndpoint('/git/blobs'), token, {
    content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64'),
    encoding: 'base64',
  });
}

function createTree(token, baseTreeSha, tree) {
  return githubRequest('POST', repoEndpoint('/git/trees'), token, { base_tree: baseTreeSha, tree });
}

function createCommit(token, message, treeSha, parentSha) {
  return githubRequest('POST', repoEndpoint('/git/commits'), token, {
    message,
    tree: treeSha,
    parents: [parentSha],
  });
}

function updateRef(token, commitSha) {
  return githubRequest('PATCH', repoEndpoint(`/git/refs/heads/${UPDATES_BRANCH}`), token, {
    sha: commitSha,
    force: false,
  });
}

async function runSetup() {
  console.log('\nStudyX Publisher setup\n');
  console.log('Create a GitHub Personal Access Token with repo access.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));
  const token = String(await ask('GitHub token: ')).trim();
  rl.close();

  if (!token) {
    console.error('Token missing.');
    process.exit(1);
  }

  const user = await githubUser(token);
  console.log(`Authenticated as ${user.login}`);
  writeJson(CONFIG_FILE, { token, owner: UPDATES_OWNER, repo: UPDATES_REPO });

  try {
    const repo = await createRepo(token);
    if (repo?.alreadyExists) console.log('Updates repo already exists.');
    else console.log(`Created https://github.com/${UPDATES_OWNER}/${UPDATES_REPO}`);
  } catch (err) {
    console.warn(`Repository creation skipped: ${err.message}`);
  }
}

async function loadToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const config = readJson(CONFIG_FILE, null);
  if (config?.token) return config.token;
  throw new Error('GitHub token missing. Run "node scripts/publish-update.cjs --setup" first.');
}

function buildManifest(version, changeMessage, distFiles, installer) {
  const changes = String(changeMessage || 'StudyX update')
    .split(' || ')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    version,
    latestVersion: version,
    releaseDate: new Date().toISOString().split('T')[0],
    changes: changes.length > 0 ? changes : ['StudyX update'],
    files: distFiles.map((file) => ({
      path: file.relPath,
      url: `${RAW_BASE_URL}/files/${file.relPath}`,
    })),
    ...(installer
      ? {
          installer: {
            fileName: path.basename(installer.relPath),
            url: `${RELEASE_BASE_URL}/v${version}/${path.basename(installer.relPath)}`,
            sha256: sha256(installer.absPath),
            size: installer.size,
          },
        }
      : {}),
  };
}

function syncLocalUpdatesRepo(version, manifest, distFiles, installer, history) {
  if (!fs.existsSync(LOCAL_UPDATES_ROOT)) return;

  const filesRoot = path.join(LOCAL_UPDATES_ROOT, 'files');
  const distRoot = path.join(filesRoot, 'dist');
  const installersRoot = path.join(filesRoot, 'installers');

  fs.rmSync(distRoot, { recursive: true, force: true });
  ensureDir(distRoot);

  for (const file of distFiles) {
    const targetPath = path.join(filesRoot, file.relPath);
    copyFileEnsured(file.absPath, targetPath);
  }

  if (installer) {
    const installerDir = path.join(installersRoot, version);
    ensureDir(installerDir);
    copyFileEnsured(installer.absPath, path.join(installerDir, path.basename(installer.relPath)));

    const latestYml = path.join(ROOT, 'release', 'latest.yml');
    if (fs.existsSync(latestYml)) {
      copyFileEnsured(latestYml, path.join(LOCAL_UPDATES_ROOT, 'releases', `v${version}`, 'latest.yml'));
    }
  }

  writeJson(path.join(LOCAL_UPDATES_ROOT, 'manifests', `${version}.json`), manifest);
  writeJson(path.join(LOCAL_UPDATES_ROOT, 'version.json'), {
    version,
    manifestUrl: `${RAW_BASE_URL}/manifests/${version}.json`,
  });
  writeJson(path.join(LOCAL_UPDATES_ROOT, 'version-history.json'), history);
}

async function runPublish(options) {
  const { bumpType, changeMessage, useCurrentVersion, skipBuild, metadataOnly } = options;
  const token = await loadToken();
  const pkg = readPkg();
  const oldVersion = pkg.version;
  const newVersion = useCurrentVersion ? oldVersion : bumpVersion(oldVersion, bumpType);

  if (!useCurrentVersion) {
    pkg.version = newVersion;
    savePkg(pkg);
  }

  if (!skipBuild) {
    try {
      execSync('npm.cmd run build', { cwd: ROOT, stdio: 'inherit' });
    } catch (err) {
      if (!useCurrentVersion) {
        pkg.version = oldVersion;
        savePkg(pkg);
      }
      throw err;
    }
  }

  let installer = findInstallerArtifact(newVersion);
  if (!installer) {
    try {
      execSync('npm.cmd run electron:build', { cwd: ROOT, stdio: 'inherit' });
      installer = findInstallerArtifact(newVersion);
    } catch (err) {
      console.warn('Installer build failed. Release will stay overlay-only.');
    }
  }

  const distFiles = metadataOnly ? [] : collectDistFiles();
  const manifest = buildManifest(newVersion, changeMessage, distFiles, installer);

  const ref = await getRef(token);
  const headSha = ref.object.sha;
  const commit = await getCommit(token, headSha);
  const baseTreeSha = commit.tree.sha;

  const history = readJson(path.join(ROOT, 'studyx-releases', 'version-history.json'), { versions: [] });
  const nextHistory = {
    versions: [
      ...history.versions.filter((entry) => entry.version !== newVersion),
      {
        version: newVersion,
        manifestUrl: `https://raw.githubusercontent.com/${UPDATES_OWNER}/${UPDATES_REPO}/${UPDATES_BRANCH}/manifests/${newVersion}.json`,
        releaseDate: manifest.releaseDate,
        description: changeMessage || `StudyX ${newVersion}`,
      },
    ].sort((left, right) => compareVersion(left.version, right.version)),
  };

  syncLocalUpdatesRepo(newVersion, manifest, distFiles, installer, nextHistory);

  const tree = [];
  if (!metadataOnly) {
    for (const file of distFiles) {
      const blob = await createBlob(token, fs.readFileSync(file.absPath));
      tree.push({ path: `files/${file.relPath}`, mode: '100644', type: 'blob', sha: blob.sha });
    }

    if (installer) {
      const blob = await createBlob(token, fs.readFileSync(installer.absPath));
      tree.push({
        path: `files/installers/${newVersion}/${path.basename(installer.relPath)}`,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }
  }

  const manifestBlob = await createBlob(token, Buffer.from(JSON.stringify(manifest, null, 2)));
  tree.push({ path: `manifests/${newVersion}.json`, mode: '100644', type: 'blob', sha: manifestBlob.sha });

  const versionBlob = await createBlob(token, Buffer.from(JSON.stringify({
    version: newVersion,
    manifestUrl: `${RAW_BASE_URL}/manifests/${newVersion}.json`,
  }, null, 2)));
  tree.push({ path: 'version.json', mode: '100644', type: 'blob', sha: versionBlob.sha });

  const historyBlob = await createBlob(token, Buffer.from(JSON.stringify(nextHistory, null, 2)));
  tree.push({ path: 'version-history.json', mode: '100644', type: 'blob', sha: historyBlob.sha });

  const newTree = await createTree(token, baseTreeSha, tree);
  const newCommit = await createCommit(token, `release: v${newVersion}\n\n${changeMessage}`, newTree.sha, headSha);
  await updateRef(token, newCommit.sha);

  console.log(`\nPublished StudyX v${newVersion}`);
  console.log(`Manifest: https://raw.githubusercontent.com/${UPDATES_OWNER}/${UPDATES_REPO}/${UPDATES_BRANCH}/manifests/${newVersion}.json`);
  if (installer) {
    console.log(`Installer: ${manifest.installer.url}`);
  } else {
    console.log('Installer: not published (overlay-only release)');
  }
}

const args = process.argv.slice(2);
if (args.includes('--setup') || args.includes('setup')) {
  runSetup().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  const useCurrentVersion = args.includes('--current') || args.includes('current');
  const skipBuild = args.includes('--skip-build');
  const metadataOnly = args.includes('--metadata-only');
  const bumpType = args.find((arg) => ['patch', 'minor', 'major'].includes(arg)) || 'patch';
  const ignoredArgs = new Set(['patch', 'minor', 'major', 'current']);
  const changeMessage = args.find((arg) => !ignoredArgs.has(arg) && !arg.startsWith('--')) || 'StudyX update';
  runPublish({ bumpType, changeMessage, useCurrentVersion, skipBuild, metadataOnly }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
