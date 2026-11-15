---
name: studyx
description: Regulile și capcanele proiectului StudyX (Electron + React/TypeScript, medicină, română). Folosește-l la orice lucru în acest repo: cod, interfață, tururi, prompturi AI, teste, verificare live și lansare. Pornește de aici înainte să atingi codul.
---

# StudyX: cum lucrăm aici

Citește întâi `docs/HANDOFF.md` (stare și hartă) și `RELEASE.md`. Comunicare în română, concis. Stil Apple, aerisit.

## Reguli care nu se negociază
- **Nu lansa** (release, tag, publicare, push) fără acordul explicit al proprietarului. Versiunea rămâne **1.0.0**: se face un rebuild al lui 1.0.0 la final (decizie 13 oct 2026), fără 1.1 și fără bump de `CURRENT_TOUR_VERSION`.
- **Previzualizare înainte de schimbări mari de UI.** Când vine o captură, e de obicei o problemă reală: verifică în aplicație, nu doar în cod.
- Datele sunt pe profil (`studyx-p-<id>-quizzes|folders|stats|notes|ai`). Nu schimba formatul fără migrare.
- **Electron folosește datele reale** (`%APPDATA%\StudyX`). Pentru teste: `$env:STUDYX_USER_DATA = Join-Path $env:TEMP 'studyx-test'`. Nu instala installerul pe calculatorul de lucru (același `appId` îl înlocuiește pe cel real).
- Nu instala plugin-uri sau cod din surse neverificate în numele proprietarului.
- Plafoane de design (`designTokens.test.ts`, `motionTokens.test.ts`): umbre prin `var(--elev-N)` (nu `boxShadow` inline nou, folosește `outline`), raze din {10, 14, 20, 28}, arcuri din `spring.*`, fără `@keyframes` infinit în afara blocului „lite”.

## Verificare (rulează înainte să spui „gata”)
```
npx tsc -p tsconfig.app.json --noEmit
npx eslint src --quiet
npx vitest run
npm run security:scan
node scripts/verify-runtime.cjs
```
- Un test care pică o dată și trece la a doua rulare nu e „în regulă”: rulează-l singur și notează-l.
- **Verifică în aplicația live**, nu doar prin teste. Accesibilitate: încarcă `axe-core` în pagină (`/node_modules/axe-core/axe.min.js` ca `<script src>`; `eval` e blocat de CSP) și rulează `axe.run` pe fiecare pagină, în tema deschisă **și** în cea închisă (`localStorage 'studyx-theme-mode' = 'dark'` + emulare `prefers-color-scheme`). Pe tururi/slide-uri rulează axe pe dialogul lor.
- În teste, `setup.ts` pornește timere false global: pentru `axe` folosește `expectNoA11yViolations` din `src/test/a11y.ts` (trece pe timere reale), iar pentru ceasul filmului stub-uiește `requestAnimationFrame`.
- Aplicația folosește `HashRouter`: `http://localhost:5173/#/ruta`. Animațiile din panoul de previzualizare avansează doar când ceri o captură.
- Consola: o eroare „order of Hooks” imediat după ce ai adăugat un hook e un artefact HMR; reîncarcă pagina și verifică din nou.

## Prompturi AI (reguli învățate din probleme reale)
- Cererile pe **subiect fix** folosesc `subject` (regula „SUBIECT OBLIGATORIU”): fără topicuri slabe și fără greșeli frecvente în prompt. Personalizarea (topicuri slabe) se aplică doar când nu există un subiect cerut.
- **Taie la numărul cerut** (`slice(0, count)`); modelul poate întoarce mai multe.
- „Fă quiz” dintr-un răspuns: răspunsul de pe ecran e singurul material de referință (`buildAnswerQuizRequest`), nu căutarea RAG pe textul cererii.
- Abrevierile ambigue (AR, SA, IC…) se explică modelului (`explainAbbreviations`).
- RAG-ul întoarce „cele mai apropiate” fragmente chiar dacă nu au legătură: nu grunda pe el un subiect liber. Un fragment-titlu nu e un fragment util (`pickRelevantDoc`).
- Textul din cărți are OCR imperfect (`a1ticulară`, `pentrn`): `tidyBookText` repară doar ce e sigur. Nu ghici cuvinte medicale.
- Fără cheie AI, funcțiile trebuie să cadă pe varianta locală, cu mesaj clar (nu eroare brută).
- Numai ș/ț cu virgulă (U+0219/U+021B) în textele noi.

## Tururi, ghiduri, micro-demo-uri
- Un pas de tur cu țintă care există doar în unele stări trebuie `optional: true`. Țintele sunt `data-tutorial="..."`.
- `repeatOnNewVersion: false` înseamnă că cine a văzut turul nu îl mai vede: noutățile ajung la utilizatorii existenți prin „Ce e nou”, nu prin tur.
- Micro-demo-urile (`src/components/micro/`) se desenează din ceasul filmului (`usePlayback`, `FilmTime`): fără cronometre proprii, fără animații independente; cu mișcare redusă arată cadrul final fix; conținutul e `inert` și povestea e în text (`transcript`). Un pas de tur primește demo-ul prin `Extra`; textul pasului trebuie scurt ca să încapă în card fără scroll.

## Capcane Windows și proiect
- `npm` pică cu `EBUSY` dacă rulează `electron:dev`; oprește-l. `electron-builder` se rulează cu `--config.directories.output=C:/Users/<tu>/studyx-build-<versiune>` (în `release/` pică cu `EPERM`).
- Scripturi de patch: scrie-le ca fișier. În heredoc-uri Python, `\b` devine backspace (folosește șiruri raw sau instrumentul Write); fișierele pot avea CRLF: citește cu `newline=''` și verifică fiecare înlocuire cu `assert`.
- React 19 + `react-hooks` v7: fără `setState` sincron în efecte, fără `Date.now()` în randare; un fișier cu componente exportă doar componente; un selector zustand nu întoarce o listă/obiect nou la fiecare citire.
- Git: dacă nu există identitate, `git -c user.name=... -c user.email=... commit`. Commit-uri mici, pe zone logice, cu mesaje în română.

## Lansare
`RELEASE.md` + `npm run release:guard` (versiuni coerente, installerul versiunii curente, `latest.yml` cu hash, secrete). Republicarea aceluiași număr de versiune nu declanșează actualizarea automată pentru cine are deja instalat: spune-i proprietarului înainte.
