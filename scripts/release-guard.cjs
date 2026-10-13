#!/usr/bin/env node
'use strict';
/**
 * Garda dinaintea lansării: coerența versiunilor, installerul și latest.yml, apoi scanarea de secrete.
 * Rulează automat din release-now.cjs; se poate rula și singură: `npm run release:guard [folder-release]`.
 * Nu publică și nu scrie nimic.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { checkRelease } = require('./lib/releaseChecks.cjs');

const root = path.resolve(__dirname, '..');

function runGuard(releaseDir) {
  const { errors, warnings, version } = checkRelease({ root, releaseDir: releaseDir ? path.resolve(releaseDir) : undefined });
  const scan = spawnSync(process.execPath, [path.join(__dirname, 'scan-secrets.cjs')], { cwd: root, encoding: 'utf-8' });
  if (scan.status !== 0) errors.push(`Scanarea de secrete a găsit probleme:\n${(scan.stdout || scan.stderr || '').trim()}`);

  console.log(`\nGardă lansare StudyX ${version ?? ''}`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  for (const error of errors) console.log(`  x ${error}`);
  if (errors.length === 0) console.log('  ✓ Versiuni, installer, latest.yml și secrete în regulă.');
  return errors.length === 0;
}

if (require.main === module) process.exit(runGuard(process.argv[2]) ? 0 : 1);
module.exports = { runGuard };
