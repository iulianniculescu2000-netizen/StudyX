const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const ignoredDirs = new Set([
  '.git',
  '.claude',
  '.cache',
  'node_modules',
  'dist',
  'release',
  'studyx-releases',
  'studyx-releases-temp',
  'playwright-report',
  'test-results',
]);

const ignoredFiles = new Set([
  '.env',
  '.env.local',
  '.update-config.json',
  '.update-hashes.json',
  'package-lock.json',
  'sesiune_mea.json',
]);

const binaryExtensions = new Set([
  '.bmp',
  '.docx',
  '.exe',
  '.ico',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.png',
  '.webp',
  '.zip',
]);

const rules = [
  {
    name: 'Groq API key',
    pattern: /\bgsk_[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    name: 'OpenAI/DeepSeek-style API key',
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    name: 'GitHub classic token',
    pattern: /\bghp_[A-Za-z0-9]{36,}\b/g,
  },
  {
    name: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  },
];

function isTextFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (binaryExtensions.has(extension)) return false;

  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(0)) return false;
    return buffer.length <= 5 * 1024 * 1024;
  } catch {
    return false;
  }
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (ignoredFiles.has(entry.name)) continue;
    if (isTextFile(fullPath)) files.push(fullPath);
  }

  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const findings = [];

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      const secret = match[0];
      const normalized = secret.replace(/^(gsk_|sk-|ghp_|github_pat_)/, '');
      if (/^(x+|X+|0+|1+|2+|3+|4+|5+|6+|7+|8+|9+)$/.test(normalized)) {
        continue;
      }
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        rule: rule.name,
        file: path.relative(root, filePath),
        line,
      });
    }
  }

  return findings;
}

function main() {
  const findings = walk(root).flatMap(scanFile);

  if (findings.length > 0) {
    console.error('Secret scan failed. Potential secrets found:');
    for (const finding of findings) {
      console.error(`- ${finding.rule}: ${finding.file}:${finding.line}`);
    }
    console.error('Rotate exposed keys, remove them from tracked files, then run npm run security:scan again.');
    process.exit(1);
  }

  console.log('security:scan ok');
}

main();
