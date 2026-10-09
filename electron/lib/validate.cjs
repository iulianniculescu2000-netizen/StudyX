'use strict';

/**
 * profileId/namespace: string non-gol, de lungime rezonabilă. Caracterele neobișnuite NU se resping: `storage:save/load`
 * le înlocuiesc cu `_` (așa a funcționat mereu), iar respingerea lor ar face inaccesibile datele existente ale unui profil.
 */
function isSafeStorageId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

module.exports = { isSafeStorageId };
