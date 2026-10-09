# StudyX — stare curentă și predare (1.0.0, 2026-10-09)

Pentru cine (om sau chat nou) reia lucrul. Citește întâi secțiunile 0–2; restul e referință.

## 0. Unde suntem
- **StudyX 1.0.0 este forma finală**; versiunile anterioare (2.x) au fost beta și nu mai sunt întreținute. Linia de versiuni pornește de la 1.0.0.
- Cod: `iulianniculescu2000-netizen/StudyX` (public). Update-uri: `iulianniculescu2000-netizen/studyx-releases` (public; aplicația citește de acolo `version.json`, manifestele și releaseurile). Repo-urile vechi (`studyx-app`, `studyx-updates`) rămân doar ca arhivă.
- Android a fost eliminat definitiv. AI local (Ollama) a fost scos complet; furnizori AI: Groq, Google Gemini, Mistral, cu rezervă automată între ei.
- **Ajutor în aplicație (1.0):** film de bun venit (`src/components/film/`, 7 scene, rulează înaintea turului la prima pornire, reluabil din Setări), tur de bun venit de 13 pași, 13 ghiduri pe pagini (`src/tutorial/tours/`, listate în `GUIDE_LIST` din `tourMeta.ts` și în Setări › Ajutor), „Prezentarea StudyX 1.0” (`WhatsNewTour.tsx`) și butoane „?” (`HelpTip`, texte în `src/tutorial/helpTips.ts`; `PageHeader` primește `help` sau `tour`).
- **Installer:** NSIS în română (`package.json › build.nsis`, `build/installer.nsh`, imaginile din `build/*.bmp` se regenerează cu `python scripts/generate-installer-art.py`), cu pagini de bun venit, licență (`LICENSE.txt`), director, instalare și final.
- **Neverificat în Electron real cu date reale:** instalarea pe un calculator curat, actualizarea de la o versiune anterioară, filmul în fereastra Electron, reindexarea cărților din folderul de materiale, PDF-uri mari, „Verifică cu alt model” cu două chei reale.
- Cărțile (Kumar, Lawrence, Sinopsis) și băncile de grile din `src/data/rezidentiat/` sunt incluse în aplicație și în repo, la decizia explicită a proprietarului (repo public; are risc de drepturi de autor). `knowledge_db.jsonl` și `capitole_db.json` rămân ignorate (regenerabile).

## 1. Reguli care nu se negociază
- Datele aplicației sunt pe profil (`studyx-p-<id>-quizzes|folders|stats|notes|ai` în localStorage și în fișiere pe disc în Electron). Nu modifica formatul fără migrare.
- Nu lansa (release, tag, publicare) fără acordul explicit al proprietarului. `RELEASE.md` descrie pașii.
- Comunicare în română, concis. Stil Apple, minimalist, aerisit. **Previzualizare înainte de schimbări mari de interfață.** Când proprietarul trimite o captură, de obicei e o problemă reală: verifică în browser, nu doar în cod.
- Tokenii de design (`designTokens.test.ts`, `motionTokens.test.ts`) au plafoane care nu au voie să crească: umbre prin `var(--elev-N)`, raze din {10, 14, 20, 28}, arcuri din `spring.*` (`src/theme/motion.ts`), `@keyframes` infinit oprit în blocul „lite” din `index.css`.

## 2. Cum se verifică
`npx tsc -p tsconfig.app.json --noEmit` · `npx eslint src --quiet` · `npx vitest run` · `npx vite build` · `node scripts/scan-secrets.cjs` · `node scripts/verify-runtime.cjs`.
Starea la lansarea 1.0: tipuri curate, ESLint fără erori (4 avertismente `exhaustive-deps` în `PremiumSelect`/`ThemedSelect`), Vitest ~1960 trecute; `organizareReadPdf.test.ts` pică pe Windows cu `EPERM` (symlink), cunoscut.

## 3. Hartă rapidă
- **Tururi:** `src/tutorial/` (motor `TourEngine.tsx`, conținut în `tours/*.tsx`, metadate `tourMeta.ts`, indicii `helpTips.ts`), starea în `src/store/tutorialStore.ts` (`seen: profil → tur → versiune`). `CURRENT_TOUR_VERSION` relansează „Ce e nou” și tururile cu `repeatOnNewVersion`. Filmul se leagă de turul de bun venit: `TourEngine` nu desenează turul cât `welcomeFilm` nu e marcat văzut pentru profil.
- **AI:** `src/lib/groq.ts` + `src/lib/groqCore/` (cereri, retry, streaming, validare), `src/lib/ai/` (agent în `agentCore/`, scheme zod, citări), chat în `src/components/AIChatDrawer.tsx` și `ai-chat/`, RAG în `src/ai/`.
- **Pagini:** `src/pages/` (marile pagini sunt împărțite în foldere: `quiz-play/`, `quiz-create/`, `flashcard-hub/`, `flashcard-session/`, `knowledge-vault/`, `review-mode/`), Rezidențiat în `src/components/residency/` și `src/lib/rezidentiat*`, plan în `src/components/organizare/`.
- **Electron:** `electron/main.cjs` (fereastră, IPC), `updater.cjs` (update din `studyx-releases`), `organizare.cjs` (citire PDF/materiale), `pdf-worker.cjs`.

## 4. Capcane (Windows și proiect)
- `npm` pică cu `EBUSY` dacă rulează `electron:dev`: oprește-l înainte de update. Dacă testele pică cu `LRUCache is not a constructor`, rulează `npm install`.
- `allowScripts` din `package.json` fixează versiuni exacte (electron, core-js…): aliniază-le după update.
- **`electron/main.cjs` fixează `userData` la `%APPDATA%\StudyX`: orice rulare Electron fără suprascriere atinge datele reale.** Pentru teste: `$env:STUDYX_USER_DATA = Join-Path $env:TEMP 'studyx-test'` (cale absolută) apoi `npm run electron:dev`, sau rulează `win-unpacked\StudyX.exe` cu aceeași variabilă. Nu instala installerul pe calculatorul de lucru doar ca să-l încerci: același `appId` înlocuiește instalarea reală.
- Installerul se construiește cu `npx electron-builder --config.directories.output=C:/Users/<tu>/studyx-build-<versiune>`; `npm run electron:build` pică în `release/` cu `EPERM` (Windows Defender).
- **Scripturi de patch:** ghilimelele și backslash-urile se strică în `node -e`; heredoc-urile cu apostrofuri pot eșua prin instrumentul Bash. Scrie scriptul ca fișier și rulează-l. Fișierele din repo pot avea CRLF: citește cu `newline=''`, normalizează la `\n` înainte de înlocuiri și verifică fiecare înlocuire cu `assert` (o înlocuire multi-linie fără verificare poate să nu se aplice, tăcut).
- **Vitest:** `src/test/setup.ts` instalează **timere false global**; testele cu server HTTP real sau cod cu `setTimeout` cer `vi.useRealTimers()` / `vi.advanceTimersByTimeAsync`. Fișierele de test care importă `node:*` cer `// @ts-expect-error` (tipurile `node` nu sunt în `tsconfig.app`).
- **TypeScript/React:** `erasableSyntaxOnly` interzice parameter properties; `react-hooks` v7 interzice `setState` sincron în efecte, `Date.now()` în randare și reasignări în randare; un fișier cu componente exportă doar componente (`react-refresh`); un selector zustand nu întoarce niciodată o listă/obiect nou la fiecare citire (buclă infinită, vezi `ReviewMode`).
- `.glass-panel` setează `position: relative` și își impune fundalul; în modul `lite` (implicit în headless) `backdrop-filter` e dezactivat global.
- **Previzualizare în browser:** panoul nu desenează frame-uri până nu ceri o captură (animațiile par blocate); folosește `ref` din `find`/`read_page`, nu coordonate. Aplicația folosește `HashRouter`: navighezi cu `http://localhost:5173/#/ruta`. Pentru animații complete setează `document.documentElement.dataset.performance = 'full'` (altfel rulează în modul `lite`).
- Hărțile mari de stare se pot citi din consolă importând modulul din URL-ul real (`performance.getEntriesByType('resource')`), nu dintr-un URL inventat (alt exemplar al store-ului).
- Commit-uri locale: dacă git nu are identitate, `git -c user.name=StudyX -c user.email=studyx@local.dev commit …`.

## 5. Lansare
Vezi `RELEASE.md`. Pe scurt: ridici versiunea (3 segmente), actualizezi „Ce e nou”, verifici, construiești installerul în afara proiectului, rulezi `node scripts/release-now.cjs "<schimbări separate prin ' || '>"` cu `GH_TOKEN` temporar, apoi împingi codul și eticheta.

## 6. Preferințe ale proprietarului
Română, concis; stil Apple, aerisit, cu detalii fine; previzualizare înainte de schimbări mari de UI; nu lansează versiuni fără să spună; îi plac organizarea clară (disciplină → specialitate) și comportamentul „inteligent” (iconițe, plasări automate, sugestii de folder). Preferă să discute ideile mari înainte să le implementăm.
