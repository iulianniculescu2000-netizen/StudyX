'use strict';
/**
 * Verificările dinaintea publicării unei versiuni. Pur: citește fișiere, nu are rețea și nu scrie nimic.
 * Prinde greșelile care s-au mai întâmplat sau pot strica actualizarea: un installer vechi publicat sub versiunea nouă,
 * versiuni care nu se potrivesc între fișiere, un `latest.yml` care descrie alt installer decât cel urcat.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf-8'));

/** Valorile simple `cheie: valoare` de la începutul lui latest.yml (versiune, cale, sha512). */
function parseLatestYml(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(version|path|sha512):\s*(.+?)\s*$/);
    if (match && !(match[1] in out)) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function sha512Base64(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

/** `releaseDir`: unde sunt installerul, `.blockmap` și `latest.yml`. Întoarce `{ errors, warnings }`. */
function checkRelease({ root, releaseDir = path.join(root, 'release') }) {
  const errors = [];
  const warnings = [];
  const pkg = readJson(path.join(root, 'package.json'));
  const version = pkg.version;

  if (!/^\d+\.\d+\.\d+$/.test(version)) errors.push(`Versiunea „${version}” nu are exact trei segmente (electron-builder și updaterul nu acceptă altfel).`);

  // 1. Aceeași versiune în toate fișierele.
  try {
    const manifest = readJson(path.join(root, 'version.json'));
    if (manifest.version !== version) errors.push(`version.json are ${manifest.version}, package.json are ${version}.`);
    if (manifest.manifestUrl && !manifest.manifestUrl.endsWith(`/${version}.json`)) {
      errors.push(`manifestUrl din version.json nu duce la manifests/${version}.json.`);
    }
  } catch (error) {
    errors.push(`version.json nu poate fi citit: ${error.message}`);
  }
  try {
    const lock = readJson(path.join(root, 'package-lock.json'));
    const lockVersions = [lock.version, lock.packages?.['']?.version].filter(Boolean);
    if (lockVersions.some((value) => value !== version)) errors.push(`package-lock.json are ${lockVersions.join(' / ')}, package.json are ${version}.`);
  } catch (error) {
    warnings.push(`package-lock.json nu poate fi citit: ${error.message}`);
  }

  // 2. Installerul versiunii curente, fără înlocuitori.
  const installerName = `StudyX-Setup-${version}.exe`;
  const installerPath = path.join(releaseDir, installerName);
  if (!fs.existsSync(releaseDir)) {
    errors.push(`Nu există folderul ${releaseDir}.`);
    return { errors, warnings, version };
  }
  if (!fs.existsSync(installerPath)) {
    errors.push(`Lipsește ${installerName} din ${releaseDir} (Windows Defender poate să-l fi șters).`);
  }
  if (!fs.existsSync(`${installerPath}.blockmap`)) warnings.push(`Lipsește ${installerName}.blockmap: actualizările diferențiale nu vor merge.`);

  const stale = fs.readdirSync(releaseDir).filter((name) => /^StudyX-Setup-.*\.exe$/.test(name) && name !== installerName);
  if (stale.length > 0) warnings.push(`În ${releaseDir} sunt și alte installere (${stale.join(', ')}). Nu se urcă, dar șterge-le ca să nu se confunde.`);

  // 3. latest.yml descrie exact acest installer.
  const ymlPath = path.join(releaseDir, 'latest.yml');
  if (!fs.existsSync(ymlPath)) {
    errors.push('Lipsește latest.yml: updaterul nativ nu va găsi versiunea.');
  } else {
    const yml = parseLatestYml(fs.readFileSync(ymlPath, 'utf-8'));
    if (yml.version !== version) errors.push(`latest.yml are versiunea ${yml.version ?? '(lipsă)'}, nu ${version}.`);
    if (yml.path && yml.path !== installerName) errors.push(`latest.yml indică ${yml.path}, nu ${installerName}.`);
    if (yml.sha512 && fs.existsSync(installerPath) && yml.sha512 !== sha512Base64(installerPath)) {
      errors.push(`Hash-ul din latest.yml nu se potrivește cu ${installerName}: installerul a fost schimbat după build.`);
    }
    if (!yml.sha512) warnings.push('latest.yml nu are sha512: updaterul nu poate verifica installerul.');
  }

  // 4. Releaseul se publică în repo-ul pe care îl citește aplicația.
  const publish = [].concat(pkg.build?.publish ?? [])[0];
  if (!publish || publish.repo !== 'studyx-releases') warnings.push('build.publish din package.json nu indică repo-ul studyx-releases.');

  return { errors, warnings, version };
}

module.exports = { checkRelease, parseLatestYml };
