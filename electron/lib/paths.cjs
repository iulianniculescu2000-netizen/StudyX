'use strict';
const path = require('path');

/** True dacă `child` este exact `root` sau se află sub el (cu separator; insensibil la majuscule pe Windows). */
function isPathInside(root, child, platform = process.platform) {
  const norm = (p) => {
    const n = path.resolve(p);
    return platform === 'win32' ? n.toLowerCase() : n;
  };
  const r = norm(root);
  const c = norm(child);
  return c === r || c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

module.exports = { isPathInside };
