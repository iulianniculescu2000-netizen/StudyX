'use strict';
// Compararea versiunilor, tolerantă la prefix "v" și sufixe (ex. 2.3.2-beta.1 -> 2.3.2).

function parseVersion(value) {
  const core = String(value || '0.0.0').trim().replace(/^v/i, '').split(/[-+]/)[0];
  const parts = core.split('.').map((part) => {
    const n = parseInt(part, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

/** Negativ dacă a < b, 0 dacă egale, pozitiv dacă a > b. */
function compareVersion(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function isNewerVersion(local, remote) {
  return compareVersion(local, remote) < 0;
}

module.exports = { parseVersion, compareVersion, isNewerVersion };
