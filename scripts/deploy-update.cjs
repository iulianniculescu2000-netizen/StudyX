#!/usr/bin/env node
/**
 * scripts/deploy-update.cjs
 *
 * Automatizează complet publicarea unui update StudyX pe GitHub.
 *
 * Utilizare:
 *   node scripts/deploy-update.cjs <versiune> "Descriere 1" "Descriere 2" ...
 *
 * Exemplu:
 *   node scripts/deploy-update.cjs 2.0.3 "Fix imagini quiz" "Animații flashcard îmbunătățite"
 *
 * Cerințe:
 *   - GITHUB_TOKEN setat în fișierul .env.local (în rădăcina proiectului)
 *     Format: GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
 *   - Sau setat ca variabilă de mediu: set GITHUB_TOKEN=ghp_...
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT   = path.join(__dirname, '..');
const REPO   = 'iulianniculescu2000-netizen/studyx-releases';
const BRANCH = 'main';
const TODAY  = new Date().toISOString().split('T')[0];

// ── Parse arguments ───────────────────────────────────────────────────────────
const [,, version, ...changes] = process.argv;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('\n❌  Versiune invalidă sau lipsă.\n');
  console.error('   Utilizare:');
  console.error('   node scripts/deploy-update.cjs 2.0.3 "Descriere 1" "Descriere 2"\n');
  process.exit(1);
}

const changeList = changes.length > 0 ? changes : ['Actualizare StudyX v' + version];

// ── Load GITHUB_TOKEN ─────────────────────────────────────────────────────────
let GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  try {
    const envPath = path.join(ROOT, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^GITHUB_TOKEN=(.+)$/m);
    if (match) GITHUB_TOKEN = match[1].trim();
  } catch {}
}

if (!GITHUB_TOKEN) {
  console.error('\n❌  GITHUB_TOKEN nu este setat!\n');
  console.error('   Creează fișierul .env.local în rădăcina proiectului cu:');
  console.error('   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx\n');
  console.error('   Obții token-ul de pe: https://github.com/settings/tokens');
  console.error('   Permisiuni necesare: repo (Full control)\n');
  process.exit(1);
}

// ── GitHub REST API ───────────────────────────────────────────────────────────
function githubRequest(method, repoPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const reqPath = `/repos/${REPO}/contents/${repoPath}`;
    const req = https.request({
      hostname: 'api.github.com',
      path: reqPath,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'StudyX-Deploy/1.0',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => (raw += d));
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API ${res.statusCode} (${method} ${repoPath}): ${json.message || raw.slice(0, 200)}`));
          } else {
            resolve(json);
          }
        } catch {
          resolve(raw);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** Get SHA of existing file (returns null if file doesn't exist yet) */
async function getFileSha(repoPath) {
  try {
    const result = await githubRequest('GET', repoPath, null);
    return result.sha || null;
  } catch {
    return null;
  }
}

/** Upload a local file to GitHub (create or update) */
async function uploadLocalFile(repoPath, localFilePath, commitMessage) {
  const content = fs.readFileSync(localFilePath);
  const b64 = content.toString('base64');
  const sha = await getFileSha(repoPath);
  await githubRequest('PUT', repoPath, {
    message: commitMessage,
    content: b64,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });
}

/** Upload a text string to GitHub (create or update) */
async function uploadText(repoPath, text, commitMessage) {
  const b64 = Buffer.from(text, 'utf-8').toString('base64');
  const sha = await getFileSha(repoPath);
  await githubRequest('PUT', repoPath, {
    message: commitMessage,
    content: b64,
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  });
}

// ── Main deploy flow ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(64));
  console.log(`  🚀  StudyX — Deploy Update v${version}`);
  console.log('═'.repeat(64));
  console.log(`\n  Schimbări: ${changeList.join(' | ')}`);
  console.log(`  Data: ${TODAY}`);
  console.log(`  Repo: ${REPO}\n`);

  // ── Step 1: Bump version in package.json ───────────────────────────────────
  console.log('① Actualizare versiune în package.json...');
  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;
  if (oldVersion === version) {
    console.log(`   Versiunea este deja ${version} — continuăm fără modificare.`);
  } else {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    console.log(`   ${oldVersion} → ${version} ✓`);
  }

  // ── Step 2: Build ──────────────────────────────────────────────────────────
  console.log('\n② Build (npm run build)...');
  try {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
    console.log('   Build complet ✓');
  } catch {
    console.error('\n❌  Build eșuat! Verifică erorile de mai sus.');
    // Revert version bump on failure
    if (oldVersion !== version) {
      pkg.version = oldVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      console.error('   Version reverted to', oldVersion);
    }
    process.exit(1);
  }

  // ── Step 3: Verify build output ────────────────────────────────────────────
  const FILES = [
    { local: path.join(ROOT, 'dist', 'assets', 'index.js'),  remote: 'files/dist/assets/index.js' },
    { local: path.join(ROOT, 'dist', 'assets', 'index.css'), remote: 'files/dist/assets/index.css' },
  ];

  for (const f of FILES) {
    if (!fs.existsSync(f.local)) {
      console.error(`\n❌  Fișier lipsă: ${f.local}`);
      console.error('   Build-ul nu a produs output-ul așteptat.');
      process.exit(1);
    }
    const size = (fs.statSync(f.local).size / 1024).toFixed(0);
    console.log(`   ${path.basename(f.local).padEnd(12)} ${size} KB ✓`);
  }

  // ── Step 4: Build version.json manifest ────────────────────────────────────
  console.log('\n③ Generare version.json...');
  const manifest = {
    version,
    releaseDate: TODAY,
    changes: changeList,
    files: FILES.map(f => ({
      path: f.remote.replace('files/', ''),
      url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${f.remote}`,
    })),
  };
  console.log('   ' + JSON.stringify(manifest).slice(0, 100) + '...');

  // ── Step 5: Upload to GitHub ───────────────────────────────────────────────
  console.log('\n④ Upload pe GitHub...');
  const commitMsg = `release: v${version}`;

  for (const f of FILES) {
    const label = path.basename(f.local).padEnd(14);
    process.stdout.write(`   ${label} → uploading... `);
    await uploadLocalFile(f.remote, f.local, commitMsg);
    console.log('✓');
  }

  // Upload version.json LAST — this is what the installed app polls
  process.stdout.write('   version.json   → uploading... ');
  await uploadText('version.json', JSON.stringify(manifest, null, 2) + '\n', commitMsg);
  console.log('✓');

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(64));
  console.log(`\n  ✅  Update v${version} publicat cu succes pe GitHub!\n`);
  console.log('  Aplicațiile instalate vor detecta update-ul la');
  console.log('  următoarea verificare (butonul din bara laterală).\n');
  console.log('  URL manifest:');
  console.log(`  https://raw.githubusercontent.com/${REPO}/main/version.json\n`);
  console.log('═'.repeat(64) + '\n');
}

main().catch(err => {
  console.error('\n❌  Eroare la deploy:', err.message);
  process.exit(1);
});
