---
name: studyx-ui-live-shots
description: Cum faci capturi și clicuri reale pe o pagină StudyX când panoul de browser nu se poate afișa sau alte sesiuni editează în paralel (Vite fără HMR, cache separat, Electron minimal + Playwright prin CDP). Folosește-l pentru audit vizual pe teme, lățimi și axe.
---

# Capturi live stabile pentru StudyX

Când ai nevoie: panoul de browser e ascuns („session isn't open in any window”, capturile expiră) sau pagina se tot reîncarcă pentru că alte sesiuni editează fișiere (HMR face reload complet).

## 1. Vite fără HMR, cu cache propriu
Config în scratchpad, `vite.nohmr.config.mts` (extensia **.mts**: un `.ts` din afara repo-ului e încărcat ca CJS și `@tailwindcss/vite` pică; nici `import 'vite'` nu se rezolvă de acolo):
```ts
import base from 'C:/Users/Iulia/Desktop/TOT/StudyX/vite.config.ts'
export default {
  ...base,
  cacheDir: '<scratchpad>/vite-cache',          // OBLIGATORIU
  root: 'C:/Users/Iulia/Desktop/TOT/StudyX',
  server: { ...(base as { server?: object }).server, hmr: false, port: 5207, strictPort: true },
}
```
- **Capcană:** fără `cacheDir` propriu, configul diferit declanșează „Re-optimizing dependencies” în `node_modules/.vite`, comun cu `electron:dev` al proprietarului și cu Vite-urile altor sesiuni (risc de ecran alb la ei).
- Nu 5173. 5199/5200 pot fi ocupate de alte sesiuni: alege alt port.
- Fără HMR, modificările tale se văd după `page.reload()`.

## 2. Electron minimal + Playwright
`main.cjs` (în scratchpad, cu `package.json` `{"main":"main.cjs"}`), pornit cu `node_modules/.bin/electron <folder>` în fundal:
- `app.setPath('userData', %TEMP%/<nume-propriu>)` (nu atinge `%APPDATA%\StudyX`);
- `app.commandLine.appendSwitch('remote-debugging-port', '<port liber>')`: **9333 e folosit de testele de chat** ale altor sesiuni; verifică cu `curl http://127.0.0.1:<port>/json` că pagina e a ta;
- `new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })`, `loadURL('http://localhost:5207/#/ruta')`.

Driver: `chromium.connectOverCDP` din `file:///.../node_modules/playwright-core/index.mjs` (pe Windows importul ESM vrea `file:///`). Un script `run.mjs` care primește un fișier de pași (`export default async (page, shot) => …`) e cel mai comod; ascultă `console`/`pageerror` și tipărește erorile la final.

## 3. Ce merge bine în pași
- Profil nou (origine nouă): completează numele, „Intră în aplicație”, „Sari peste” filmul; turul se închide cu butonul „Închide turul” (poate fi de 2 ori în DOM: `.last()`).
- Lățime: `page.setViewportSize({ width: 390, height: 844 })`; tema: `page.emulateMedia({ colorScheme })` + `localStorage 'studyx-theme-mode'` + reload.
- Paginile derulează într-un container propriu, nu în `window`: găsește strămoșul cu `overflowY: auto` al `h1`-ului și folosește `scrollTo` pe el.
- axe: `<script src="/node_modules/axe-core/axe.min.js">` injectat, apoi `axe.run(document.querySelector('.route-scroll-host'))`.
- Capturile în scratchpad; pentru proprietar copiază doar cele relevante în folderul de note.

La final: oprește Electronul tău (`taskkill /PID`), serverul Vite și scoate configurația adăugată temporar în `.Codex/launch.json`.
