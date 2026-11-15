'use strict';

/**
 * Învelește `ipcMain` astfel încât NICIUN handler să nu ruleze pentru un expeditor neîncrezător. Se creează o singură dată
 * și se dă tuturor funcțiilor `register*IPC`, deci niciun canal nu poate rămâne descoperit.
 *  - `handle`: apelul respins aruncă o eroare (invoke-ul din pagină se respinge, fără să rămână agățat);
 *  - `on` / `once`: apelul respins e ignorat.
 * Se loghează un singur avertisment scurt, doar cu numele canalului (fără conținutul cererii).
 *
 * @param {{ handle: Function, on: Function, removeListener: Function, removeHandler?: Function }} ipcMain
 * @param {(event: unknown) => boolean} isTrusted
 * @param {(message: string) => void} [warn]
 */
function createSecureIpc(ipcMain, isTrusted, warn = (m) => console.warn(m)) {
  const reject = (channel) => {
    try { warn(`[StudyX][IPC] Apel respins pe "${channel}": expeditor neîncrezător.`); } catch { /* ignore */ }
  };
  const trusted = (event) => {
    try { return Boolean(isTrusted(event)); } catch { return false; }
  };
  return {
    handle(channel, handler) {
      return ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event)) {
          reject(channel);
          throw new Error('Apel IPC respins: expeditor neîncrezător.');
        }
        return handler(event, ...args);
      });
    },
    on(channel, listener) {
      return ipcMain.on(channel, (event, ...args) => {
        if (!trusted(event)) return reject(channel);
        return listener(event, ...args);
      });
    },
    once(channel, listener) {
      // Un apel respins nu consumă „o singură dată”: ascultătorul rămâne pentru expeditorul real.
      const wrapped = (event, ...args) => {
        if (!trusted(event)) return reject(channel);
        ipcMain.removeListener(channel, wrapped);
        return listener(event, ...args);
      };
      return ipcMain.on(channel, wrapped);
    },
    removeHandler: (channel) => ipcMain.removeHandler(channel),
  };
}

module.exports = { createSecureIpc };
