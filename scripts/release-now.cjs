#!/usr/bin/env node
'use strict';
/**
 * release-now.cjs
 * Creates a GitHub Release in studyx-releases, uploads the installer,
 * then pushes version.json + manifest to the repo (no dist files).
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const VERSION = PKG.version;
const TAG = `v${VERSION}`;
const OWNER = 'iulianniculescu2000-netizen';
const REPO = 'studyx-releases';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
const RELEASE_BASE = `https://github.com/${OWNER}/${REPO}/releases/download`;

const CONFIG_FILE = path.join(ROOT, '.update-config.json');
const config = (() => { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return {}; } })();
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || config.token;

const CHANGES = (process.argv[2] || 'StudyX update').split(' || ').map(s => s.trim()).filter(Boolean);

if (!TOKEN) {
  console.error('ERROR: GitHub token missing. Add it to .update-config.json');
  process.exit(1);
}

function findInstaller() {
  const releaseDir = path.join(ROOT, 'release');
  if (!fs.existsSync(releaseDir)) return null;
  const files = fs.readdirSync(releaseDir)
    .filter(f => f.endsWith('.exe') && /studyx/i.test(f) && !/unins/i.test(f))
    .map(f => ({ name: f, abs: path.join(releaseDir, f), size: fs.statSync(path.join(releaseDir, f)).size }));

  // Prefer the installer whose filename matches the CURRENT package.json version.
  // Old builds left in release/ (from previous releases) can be LARGER than a
  // newer, better-optimized build — sorting by size alone silently picked a
  // stale installer and published it under the wrong version tag.
  const exact = files.find(f => f.name.includes(VERSION));
  if (exact) return exact;

  // Fallback (no exact-version match found): largest, as before.
  return files.sort((a, b) => b.size - a.size)[0] ?? null;
}

function sha256file(fp) {
  return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
}

function ghReq(method, endpoint, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com',
      path: endpoint,
      method,
      headers: {
        'User-Agent': 'StudyX-Publisher/3.0',
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...extraHeaders,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          else resolve(json);
        } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadAsset(uploadUrl, filePath, fileName) {
  // uploadUrl is like https://uploads.github.com/repos/.../releases/id/assets{?name,label}
  const base = uploadUrl.replace(/\{.*\}/, '');
  const url = new URL(`${base}?name=${encodeURIComponent(fileName)}`);
  const fileData = fs.readFileSync(filePath);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'User-Agent': 'StudyX-Publisher/3.0',
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileData.length,
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(json.message || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.setTimeout(900000, () => req.destroy(new Error('upload timeout'))); // 15 min for large files

    let sent = 0;
    const CHUNK = 1024 * 1024; // 1MB chunks for faster upload
    function sendNext() {
      const slice = fileData.slice(sent, sent + CHUNK);
      if (slice.length === 0) { req.end(); return; }
      req.write(slice);
      sent += slice.length;
      const pct = Math.round((sent / fileData.length) * 100);
      process.stdout.write(`\r  Uploading installer... ${pct}%`);
      setImmediate(sendNext);
    }
    sendNext();
  });
}

// Push a single file to the repo via Contents API
async function pushFile(repoPath, content, message) {
  // Get current SHA if file exists
  let sha;
  try {
    const existing = await ghReq('GET', `/repos/${OWNER}/${REPO}/contents/${repoPath}`);
    sha = existing.sha;
  } catch { /* file doesn't exist yet */ }

  return ghReq('PUT', `/repos/${OWNER}/${REPO}/contents/${repoPath}`, {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });
}

async function main() {
  console.log(`\n🚀 StudyX v${VERSION} — preparare release GitHub\n`);

  const installer = findInstaller();
  if (!installer) {
    console.error('ERROR: Nu am găsit installerul. Rulează mai întâi: npx electron-builder');
    process.exit(1);
  }
  console.log(`✓ Installer: ${installer.name} (${(installer.size / 1024 / 1024).toFixed(1)} MB)`);

  // 1. Check if release already exists — delete and recreate
  let existingRelease = null;
  try {
    existingRelease = await ghReq('GET', `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
    console.log(`  Release ${TAG} existent — șterg și recreez...`);
    await ghReq('DELETE', `/repos/${OWNER}/${REPO}/releases/${existingRelease.id}`);
  } catch { /* no existing release, fine */ }

  // Also delete the tag if it exists
  try { await ghReq('DELETE', `/repos/${OWNER}/${REPO}/git/refs/tags/${TAG}`); } catch {}

  // 2. Create GitHub Release
  console.log(`\n📦 Creez GitHub Release ${TAG}...`);
  const releaseBody = CHANGES.map(c => `• ${c}`).join('\n');
  const release = await ghReq('POST', `/repos/${OWNER}/${REPO}/releases`, {
    tag_name: TAG,
    name: `StudyX ${VERSION}`,
    body: releaseBody,
    draft: false,
    prerelease: false,
  });
  console.log(`✓ Release creat: ${release.html_url}`);

  // 3. Upload installer
  console.log(`\n⬆️  Upload installer...`);
  const asset = await uploadAsset(release.upload_url, installer.abs, installer.name);
  console.log(`\n✓ Installer urcat: ${asset.browser_download_url}`);

  // 3b. Metadata electron-updater. Without latest.yml the app's native update
  // check fails with a 404 on every launch and only the fallback updater works;
  // the blockmap is what lets a future release download just the changed blocks.
  for (const extra of ['latest.yml', `${installer.name}.blockmap`]) {
    const abs = path.join(ROOT, 'release', extra);
    if (!fs.existsSync(abs)) {
      console.warn(`  ⚠ ${extra} lipsește din release/ — îl sar (updater-ul nativ va cădea pe fallback).`);
      continue;
    }
    await uploadAsset(release.upload_url, abs, extra);
    console.log(`✓ ${extra} urcat`);
  }

  // 4. Build manifest (metadata-only — no dist files)
  const installerUrl = `${RELEASE_BASE}/${TAG}/${installer.name}`;
  const manifest = {
    version: VERSION,
    latestVersion: VERSION,
    releaseDate: new Date().toISOString().split('T')[0],
    changes: CHANGES,
    files: [], // overlay-less: packaged build gets full installer
    installer: {
      fileName: installer.name,
      url: installerUrl,
      sha256: sha256file(installer.abs),
      size: installer.size,
    },
  };

  // 5. Update version.json in repo
  console.log(`\n📝 Actualizez metadate în repo...`);
  await pushFile('version.json', JSON.stringify({
    version: VERSION,
    manifestUrl: `${RAW_BASE}/manifests/${VERSION}.json`,
  }, null, 2), `release: bump version.json to ${VERSION}`);
  console.log('✓ version.json actualizat');

  // 6. Write manifest file
  await pushFile(`manifests/${VERSION}.json`, JSON.stringify(manifest, null, 2),
    `release: add manifest v${VERSION}`);
  console.log(`✓ manifests/${VERSION}.json adăugat`);

  // 7. Update version-history.json
  let history = { versions: [] };
  try {
    const hFile = await ghReq('GET', `/repos/${OWNER}/${REPO}/contents/version-history.json`);
    history = JSON.parse(Buffer.from(hFile.content, 'base64').toString('utf-8'));
  } catch {}
  history.versions = [
    ...history.versions.filter(e => e.version !== VERSION),
    {
      version: VERSION,
      manifestUrl: `${RAW_BASE}/manifests/${VERSION}.json`,
      releaseDate: manifest.releaseDate,
      description: CHANGES.join(' · '),
    },
  ].sort((a, b) => {
    const pa = a.version.split('.').map(Number);
    const pb = b.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] - pb[i]; }
    return 0;
  });
  await pushFile('version-history.json', JSON.stringify(history, null, 2),
    `release: update version-history for ${VERSION}`);
  console.log('✓ version-history.json actualizat');

  // 8. Also sync local studyx-releases folder
  const localUpdates = path.join(ROOT, 'studyx-releases');
  if (fs.existsSync(localUpdates)) {
    fs.writeFileSync(path.join(localUpdates, 'version.json'), JSON.stringify({
      version: VERSION,
      manifestUrl: `${RAW_BASE}/manifests/${VERSION}.json`,
    }, null, 2), 'utf-8');
    fs.mkdirSync(path.join(localUpdates, 'manifests'), { recursive: true });
    fs.writeFileSync(path.join(localUpdates, 'manifests', `${VERSION}.json`), JSON.stringify(manifest, null, 2), 'utf-8');
    console.log('✓ Repo local sincronizat');
  }

  console.log(`
╔══════════════════════════════════════════════════════╗
║  ✅  StudyX v${VERSION} publicat cu succes!             ║
╚══════════════════════════════════════════════════════╝

• GitHub Release: ${release.html_url}
• Installer: ${installerUrl}
• Manifest: ${RAW_BASE}/manifests/${VERSION}.json

Utilizatorii cu aplicația instalată vor primi notificarea
de update automat la ~10 secunde după deschiderea aplicației.
`);
}

main().catch(err => {
  console.error('\n❌ Eroare:', err.message);
  process.exit(1);
});
