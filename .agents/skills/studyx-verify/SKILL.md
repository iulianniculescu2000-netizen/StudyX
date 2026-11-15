---
name: studyx-verify
description: Rutina de verificare StudyX înainte de „gata”: comenzi, test live pe profil izolat, ce porturi nu se ating, cum se raportează rezultatul. Folosește-l după orice schimbare de cod în StudyX.
---

# Verificare StudyX

1. **Comenzi (în ordine, toate trebuie curate):**
   - `npx tsc -p tsconfig.app.json --noEmit`
   - `npx eslint src --quiet`
   - `npx vitest run` (pentru o zonă: `npx vitest run src/lib/ai`)
   - `npm run security:scan`, `node scripts/verify-runtime.cjs`
2. Un test care pică o dată și trece a doua oară se rulează singur și se notează; nu se trece cu vederea.
3. **Live:** nu porni nimic pe portul **5173** (proprietarul rulează `electron:dev`). Folosește alt port pentru Vite. Pentru Electron: `STUDYX_USER_DATA` pe un folder temporar; nu atinge `%APPDATA%\StudyX`. Nu face seed în Electron real.
4. Pentru o schimbare vizibilă: verifică în ambele teme (deschis și închis) și pe lățime îngustă; `axe-core` pe paginile atinse (vezi skill-ul `studyx`).
5. **Chei AI:** nu le introduci tu și nu citești `ai.json`. Ce depinde de un furnizor real rămâne „neverificat cu cheie reală” în raport.
6. **Raportul final** spune exact ce s-a rulat, ce a trecut, ce NU s-a verificat (ex. „doar mock-uri, nu cheie reală”) și ce e comis local. Nu publica, nu da push.
7. Capcane shell: backslash-urile se pierd în `sed`/heredoc din Bash. Pentru regex-uri și `\n` scrie fișiere cu Write sau editează cu Edit și verifică după cu `tsc` + testul zonei.
8. **Store-uri din pagină (CDP / javascript):** `await import('/src/store/aiStore.ts')` poate crea o a doua instanță, goală. După un HMR, aplicația folosește `...aiStore.ts?t=…`. Ia URL-ul exact din `performance.getEntriesByType('resource')` (cu `performance.setResourceTimingBufferSize(10000)`, altfel lista se oprește la 250). O editare care ajunge la store-uri (de ex. `retriever.ts`, `curriculum.ts`) reîncarcă acum toată pagina (`profileStorage.ts`): nu e un bug, așa se evită store-urile goale care au lăsat copii orfane în index.
