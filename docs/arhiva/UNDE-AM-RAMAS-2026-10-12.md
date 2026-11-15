# Unde am rămas: audit live și reparații (12-13 octombrie 2026)

Pentru tine sau pentru un chat nou. Starea proiectului: StudyX 1.0.0, branch `studyx-1.0`, **nimic dat în commit, nimic publicat**. Citește întâi secțiunile 1, 4 și 5.

## 1. Starea acum
| Verificare | Rezultat |
|---|---|
| `tsc -p tsconfig.app.json --noEmit` | curat |
| `eslint src --quiet` | curat |
| `scan-secrets`, `verify-runtime` | OK |
| `vite build` (în folder temporar) | compilează, include `sql-wasm.wasm` |
| Vitest complet | 2180 trecute, 1 sărit, 1 picat doar la rularea completă (vezi mai jos) |
| Consolă în browser | fără erori (avertismentul CSP `http://[::1]:*` a dispărut) |

- Testul picat: `AIGamification.test.tsx › shows today in the comparison…`. Singur trece (7/7). Textul lui depinde de „ieri”, iar rularea a trecut peste miezul nopții. Test fragil, nu bug de aplicație; merită ancorat la o dată fixă (`vi.setSystemTime`).
- În repo sunt ~364 de intrări necomise (229 modificate, 18 șterse, 117 noi). Majoritatea sunt munca ta dinainte; reparațiile de azi s-au adăugat peste ea.

## 2. Ce s-a făcut
Metodă: audit live cu 5 agenți de test (grile, flashcarduri și notițe, import PDF și chat AI, restul paginilor, grafică și animații), plus verificări în cod și chat AI real cu Groq. Apoi 8 agenți de reparare, cu fișiere atribuite strict fiecăruia.

### Integritatea datelor
- **Dubla salvare a unei sesiuni** (tastă + Enter la ultima întrebare din examen): `finishQuiz` are gardă de reintrare, iar tastatura ignoră repetările. Teste în `QuizPlay.test.tsx`.
- **„Repetă” / „Quiz din Greșeli” / „Recuperare” / „Examen adaptiv”** nu mai creează o grilă nouă la fiecare apăsare: `src/lib/generatedQuiz.ts` reutilizează o grilă per tip și păstrează id-urile întrebărilor neschimbate.
- **Ștergerea unui profil** curăță acum totul: `src/store/profilePurge.ts` (localStorage, memoria de chat, stocurile Organizare și tutorial, vectorii din IndexedDB) plus IPC nou `storage:delete-profile` în Electron. Autosave nu mai poate recrea cheile. Confirmarea spune explicit ce se șterge.
- **Statistici retrase** (după „Împarte pe capitole”) nu mai sunt numărate dublu în profilul AI și în rezultate.
- **Profilul AI:** subiectele nu mai sunt etichete tehnice (`rezidentiat`, `lawrence`), iar tendința „în scădere” cere minimum 10 răspunsuri.
- **Rezultate:** întrebările nevăzute după expirarea cronometrului au categoria „Fără răspuns”, nu mai apar ca greșite.
- **Editarea grilelor** importate fără descriere merge; descrierea e opțională, iar butoanele inerte spun de ce.

### Importuri
- **CSP:** `index.html` are `'wasm-unsafe-eval'` (Anki `.apkg` nu putea încărca wasm-ul) și nu mai are sursa invalidă `[::1]`. Testat cu un `.apkg` real în Vitest; în Electron nu s-a rulat.
- **CSV flashcarduri:** parser nou cu ghilimele, virgule, linii multiple și antet; numără liniile omise și le anunță. Pachetele CSV se numesc „Deck CSV · fișier”.
- **`penaltyMode`** se păstrează la importul JSON.
- **PDF:** literele grecești și simbolurile (β, ≥, ≤, →, ±, °, µ) nu se mai șterg din text.
- Grile text cu o singură variantă: avertisment clar. Bannerul „Cărțile tale” nu mai cere PDF-uri pentru cărțile încorporate. Capitolul 9 din Kumar are acum alias de titlu.

### Numere și flashcarduri
- „Greu” la flashcard revine în 10 minute și se readaugă o dată în sesiune; „Bine” = 1 zi, „Ușor” = 4 zile; SM-2 rămâne la fel după prima trecere.
- Duplicatele ascunse nu mai apar în sesiuni și scadente.
- Contoarele din Recapitulare, sidebar, `/review`, `/daily-review` și Dashboard folosesc aceeași listă (`src/lib/dueItems.ts`); „slab” = greșit cel puțin o dată și nestabilizat, fără plafon la 10. Sidebar-ul se redesenează doar când se schimbă numărul (selector primitiv).
- Ring-ul din sidebar: făcute azi / (făcute azi + scadente). Sesiunea zilnică e plafonată la 40.
- Prognoza și simularea folosesc aceeași deduplicare ca hub-ul Rezidențiat; „Date insuficiente” sub 30 de răspunsuri.
- Dashboard: „GRILE” numără și Rezidențiat, „0%” apare când sunt răspunsuri, timp de studiu formatat la fel peste tot. Folderele de flashcarduri nu se mai amestecă între scope-uri.

### Grafică și accesibilitate
- **Contrast:** accent mai închis (`#0071E3` / `#0A72E8`), `successFill`, `onFillText` pentru fundaluri colorate, gradiente hero întunecate, texte din tema întunecată pe `accentText`. Axe: 0 încălcări pe 10 rute în ambele teme.
- **Chat AI:** dialog accesibil (focus, trap, Esc, roluri). Mascota se retrage la margine când ar acoperi un control; butonul „sus” are 24 px distanță de ea.
- **Layout mic:** sub 900 px sidebar-ul se strânge singur (overlay cu scrim); taburile derulează cu fade; titlurile din Organizare nu se mai rup; dock-ul din sesiune e opac.
- Cititorul Bibliotecii AI respectă sidebar-ul. Previzualizarea întrebării și dropdown-ul de sortare au roluri și Esc. Tasta R din film merge cu orice focus.
- Cele 4 teste de design picate (umbre, rgba, cursoare) trec, fără să ridic plafoane.
- `/erori` are același fundal ca `/stats`; „Import grile” arată ca buton secundar; heatmap-ul umple cardul; lățimi de pagină aliniate la `max-w-4xl`.

### Curățenie și texte
- Cod mort scos (`AIEngine`, cod „compact”, helperi AI nefolosiți, resturi Ollama, `OpenAISettings`, `scripts/eval-local-model.mjs`, `src/ai/eval/`), plus 2 documente despre AI-ul local șters.
- Pluralele corecte (`src/lib/plural.ts`), „Resetează”, „Folder țintă”, titluri de pagină, verificare de dubluri la foldere, confirmare clară la ștergerea notițelor, mesaj „doar în aplicația desktop” la actualizări în browser.
- Redenumiri: `QuizPlayRefactored` șters, `AIGamification` și `AIPredictiveAnalytics` fără „Refactored”.
- `FEATURES.md` corectat.

## 3. Ce a rămas nereparat sau neverificat
**Neverificat în Electron real (cu `STUDYX_USER_DATA` izolat):** încărcarea wasm-ului Anki din `file://`, IPC-ul `storage:delete-profile`, deschiderea PDF-urilor din Organizare, backup, actualizări, installerul.
**Neverificat în browser după reparații:** mascota pagină cu pagină la 720/1024/1280 px (doar `/quizzes`), focusul după închiderea chatului, `useLauncherDock` pe toate paginile, `/erori` după schimbarea de shell, hero-urile cu gradiente mai întunecate.
**Netestat de agenții de audit:** ciorna din `/create` după reîncărcare, ștergerea în masă și drag and drop în foldere, „Examen adaptiv” cu AMÂNĂ/ANTERIOR/FOCUS/AUTO, tema luminoasă în sesiune, expirarea cronometrului de examen pe 16 minute reale, exporturi (dialog Electron), OCR, DOCX, import PDF prin `/create`, cititorul de pagini PDF, diagrame, citări și 429/offline în chatul AI. Chatul AI real a fost verificat: răspuns, comanda „fă-mi o grilă”.
**Reparate parțial:**
- Totalurile băncii Rezidențiat trebuie confirmate pe date reale (3859 în hub): hub-ul numără doar banca Rezidențiat, prognoza toate grilele.
- Confirmarea de ștergere de pe cardul de grilă (decalată cu 79 px în audit) nu s-a reprodus la 1280 px; poate apărea doar în timpul animației.
- Tururile de pagină care acoperă conținutul la prima vizită nu au fost atinse.
- Câteva pluraluri în etichete din afara listei (de ex. „1 parțiale” e reparat, restul nu a fost căutat exhaustiv).
- Text din alte locuri cu `theme.accent` direct pe tema întunecată în `ai-chat/*` și `QuizCard`.
- Cod fără proprietar: `src/lib/searchIndex.ts` (fișier necomis, folosit doar de testul lui) și dependența `minisearch`.

## 4. Decizii care sunt ale tale
1. **Hero compact în modul de studiu pe ferestre scunde.** La 1024×700 hero-ul ocupă ~400 px și bara de jos acoperă primele opțiuni. Propunere: la `max-height: 760px` ascunde metricile și comenzile secundare, păstrând titlul și progresul. Schimbare vizibilă, deci previzualizare înainte.
2. **„Greu” la flashcard și acuratețea globală.** Încă scade acuratețea ca o greșeală de grilă. Separarea cere un câmp nou în statistici (migrare).
3. **`aiStore.renameLibraryFolder` și `clearAIMemory`:** n-au UI. Le conectăm (redenumire folder în Bibliotecă, „Șterge memoria AI” în Setări) sau le scoatem.
4. **Cursor:** `trailEnabled` și `style` sunt salvate, dar n-au UI sau efect. Setare reală sau eliminare, cu migrare.
5. **Mod examen real** care implică focus: nu a existat niciodată.
6. **Pagina Notițe** nu permite creare sau editare (doar din sesiune) și „Pachet rapid” e un demo cu 6 carduri fixe. De decis dacă vrei creare manuală.
7. **`public/`:** `audit-screenshots/` (856 KB), `showcase-videos/` (3,3 MB), `studyx_animations_showcase.webm` (3,3 MB), `studyx_animations_preview.html`. `.gitignore` le ignoră în git, dar **Vite le copiază în build** (verificat). Mută-le în afara `public/` înainte de installer. `public/audio/` (400 KB, vocea filmului) e netrasabil în git: îl comiți?
8. **Restul cosmeticelor:** centrarea conținutului pe toată fereastra cu bara strânsă (acum e centrat în zona din dreapta barei).

## 5. Pași următori recomandați
1. **Fă un commit sau măcar un backup.** Toată munca e necomisă. Am salvat un backup înainte de reparații în folderul temporar al sesiunii (poate fi șters de sistem): `%LOCALAPPDATA%\Temp\claude\C--Users-Iulia-Desktop-TOT-StudyX\…\scratchpad\pre-fix-src-backup.tgz`, plus `pre-fix-tracked.patch` și `pre-fix-untracked.txt`. Copiază-l într-un loc sigur dacă vrei să poți reveni.
2. **Testează în Electron real, cu date izolate:** `$env:STUDYX_USER_DATA = Join-Path $env:TEMP 'studyx-test'` apoi `npm run electron:dev` sau `node scripts/qa-desktop.cjs`. Încearcă import Anki, ștergerea unui profil, backup și deschiderea unui PDF din Organizare.
3. **Decide punctele din secțiunea 4**, mai ales 1 și 7.
4. **Rulează agentul de grile pentru zonele netestate** (secțiunea 3) pe codul final.
5. Abia apoi: ridici versiunea, actualizezi „Ce e nou” și urmezi `RELEASE.md`. Nu lansa fără acordul tău explicit.

## 6. Ce să știi despre mediu
- Playwright nu are browsere instalate (agenții au folosit Edge, Brave sau Chromium din Electron). Serverul Vite poate asculta doar pe IPv6 (`http://[::1]:5173`); în browserul încorporat merge cu `localhost`.
- Serverul dev a căzut de câteva ori în timpul auditului; dacă o rulare pare blocată, repornește-l.
- Un agent a închis o dată `brave.exe` pentru a debloca o rulare: dacă ai avut ferestre Brave deschise, s-au închis.
- Cheia Groq de test a fost folosită doar în Setări › AI, în profilul de test din browser. A trecut prin chat: regenereaz-o din consola Groq dacă o folosești în altă parte.
- Raportul complet al auditului (probleme pe severitate, capturi) e în scratchpad: `RAPORT-AUDIT-StudyX-2026-10-12.md`; capturile agenților sunt în subfolderele `quiz`, `flash`, `pages`, `pdfchat`, `ui`, `g`.

## 7. Deciziile din secțiunea 4 (13 oct 2026)
1. **Hero compact:** la `max-height: 760px`, metricile (în afară de cronometrul din modul cu timp sau examen), butoanele Auto și Taste și iconița de titlu se ascund, iar progresul și Amână/Focus stau pe același rând. Verificat în browser la 1024×700 (prima opțiune se vede) și la 1280×900 (neschimbat). Fișier: `SessionHero.tsx`.
2. **„Greu” la flashcard:** rămâne ca eșec de recuperare, ca în SM-2. Nu adăugăm câmp nou în statistici, deci nu e nevoie de migrare.
3. **Bibliotecă și memorie AI:** `renameLibraryFolder` are acum creion de redenumire pe rândul folderului (nu și pe rădăcina Rezidențiat). `clearAIMemory` are rând „Memoria AI” în Setări › Inteligență artificială, cu confirmare la a doua apăsare, doar pentru profilul activ.
4. **Cursor:** `trailEnabled` și `style` scoase; `cursorStore` trece la versiunea 2 și păstrează doar `enabled`.
5. **Mod examen real cu focus:** nu se face, nu e cerut de nicio parte a aplicației.
6. **Notițe:** rămân notițe legate de întrebări (un text liber ar cere model nou de date). „Pachet rapid” (6 carduri demo) a fost scos din Flashcarduri.
7. **`public/`:** artefactele de dezvoltare sunt acum în `dev-artifacts/` (ignorat în git, în afara build-ului); scripturile de audit scriu acolo. `public/audio/` (vocea filmului) trebuie comis: aplicația îl folosește.
8. **Centrarea cu bara strânsă:** rămâne cum e (conținutul se centrează în zona din dreapta barei).

## 8. Laptop: 1536×864 la 125% (13 oct 2026)
Laptopul de lucru are ecranul 1920×1080 scalat la 125%, adică 1536×864 pixeli CSS; fereastra maximizată are 1536×816, din care 38 sunt bara de titlu. Pragurile „scund” de până acum (720/760 px) nu se aplicau niciodată aici, deci laptopul vedea aspectul de ecran înalt.
- Verificat în Electron real, cu date izolate, la maximizat, 1280×720 și 1100×650: fără scroll orizontal, `window-state.json` și maximizarea sunt corecte; problema era densitatea, nu redimensionarea ferestrei.
- **Sesiune de grile:** pragurile din `SessionHero.tsx` urcă la 860 px (același prag „compact” ca `useViewportProfile`, TitleBar și Sidebar); pe laptop dispar metricile, Auto, Taste, iconița, subtitlul și chip-ul repetat, iar progresul stă lângă Amână/Focus. Se văd două opțiuni la prima vedere, nu una.
- **Sidebar:** pe ferestre compacte, subsolul trece pe două rânduri (Setări, apoi Aspect + actualizări + Restrânge doar ca iconițe), deci încap încă 2 intrări (Rezidențiat, Flashcarduri) fără derulare. Fișier: `SidebarFooter.tsx`.
- **Neverificat:** filmul de bun venit la 900×600 (butoanele ferestrei se apropie de „Sari peste”, iar conținutul se taie), `npx playwright install chromium` (descărcarea a expirat; folosim Edge/Brave prin `STUDYX_TEST_BROWSER`).

## 9. Teste vizuale cu Brave (13 oct 2026)
`npx playwright test --project=visual` (dev server pornit sau pornit automat) rulează `tests/visual/routes.visual.spec.ts` în Brave (`C:/Program Files/BraveSoftware/...`, sau `STUDYX_TEST_BROWSER`), pentru că Chromium nu se poate descărca aici. 6 rulări (tema luminoasă și cea întunecată × 1536×816, 1280×720, 1024×700), câte 9 rute, la 125% (`deviceScaleFactor`). Verifică: fără scroll orizontal, fără erori în consolă, axe WCAG 2 A/AA fără încălcări (la 1536 px). Capturile se salvează în `.qa-results-visual/` (ignorat în git). Durează ~4 minute. Rezultat curent: 6 trecute, 0 încălcări axe.

## 10. Restul problemelor (13 oct 2026)
- **Filmul de bun venit:** overlay-ul lasă 48 px sus pentru butoanele ferestrei, iar scena se micșorează după înălțime (`clamp(140px, min(43vh, 100dvh − 420px), 350px)`); la 900×600 încape fără derulare internă. Verificat în Electron.
- **Accent pe tema întunecată:** `theme.accentText` în `QuizCard` (creion), `ChatHeader`, `ChatMemoryPanel`, `ChatMessageBubble` (citare activă).
- **Focus după închiderea chatului:** revenea pe `body` (focusul era încă în sertarul care ieșea); acum revine pe „Deschide chatul AI”. Verificat cu tastatura reală.
- **Confirmarea de ștergere de pe card:** reprodus la 1024 px (cardul `overflow-hidden` se derula intern cu ~65 px când confirmarea primea focus); acum `overflow-clip` și `p-4`.
- **Test fragil `AIGamification`:** dată fixă cu `vi.setSystemTime`.
- **Rămas pentru tine:** `src/lib/searchIndex.ts` + testul lui + `minisearch` (necomise, nefolosite): ștergerea a fost blocată ca ireversibilă; le ștergi tu sau îmi dai acordul.
