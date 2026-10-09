#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, '.update-config.json');
const ELECTRON_BUILDER_BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');

function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return config.token || '';
  } catch {
    return '';
  }
}

function run(command, env = {}) {
  execSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

function main() {
  const token = readToken();
  if (!token) {
    console.error('Missing GH_TOKEN/GITHUB_TOKEN or .update-config.json token.');
    process.exit(1);
  }

  console.log('\nPublishing StudyX release via electron-builder...\n');
  run('npm.cmd run generate-icon');
  run('npm.cmd run build');
  run(`"${ELECTRON_BUILDER_BIN}" --publish always`, {
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
  });
  run('node scripts/sync-updates-local.cjs');
  run('node scripts/publish-update.cjs current --skip-build --metadata-only "StudyX update"');
}

main();
