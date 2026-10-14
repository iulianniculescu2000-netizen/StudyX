# StudyX — ce mai avem de făcut (predare pentru un chat nou, 14 octombrie 2026)

Citește întâi [HANDOFF.md](HANDOFF.md) și [RAMAS-DE-FACUT-2026-10-13.md](RAMAS-DE-FACUT-2026-10-13.md) (reguli și hartă). Acest document spune ce s-a făcut pe 14 octombrie și ce rămâne. Începe cu `git log --oneline -20` și `git status --short`.

## 0. Reguli (neschimbate)
- **Nu există 1.1.** Tot ce s-a lucrat intră într-un **1.0.0 reconstruit** la final. Nu schimba versiunea, nu atinge `CURRENT_TOUR_VERSION`.
- **Nu publica, nu da push, nu pune tag** fără acordul explicit al proprietarului. Totul e comis doar local pe `studyx-1.0`.
- **Fără furnizori AI noi** (rămân Groq, Google Gemini, Mistral).
- **Chei AI:** nu le introduci tu în aplicație și nu citești `ai.json`. Proprietarul le pune singur în fereastra aplicației de test. O cheie Groq a fost lipită în chat pe 14 oct: trebuie ștearsă din consola Groq și înlocuită (în așteptare de la proprietar).
- **Nu porni nimic pe portul 5173 cât lucrează proprietarul** (el rulează `npm run electron:dev`; un Vite al meu pe 5173 i-a dat ecran alb). Pentru teste folosește alt port și, pentru Electron, `STUDYX_USER_DATA` pe un folder temporar. Datele reale din `%APPDATA%\StudyX` nu se ating.
- Întreabă înainte de rulări lungi. Capcană: în comenzile shell backslash-urile se pierd (`\n` devine rând nou): editează cu Edit/Write, nu cu patch-uri shell. Git nu are identitate setată: `git -c user.name=Iulia -c user.email=iulian.niculescu1000@gmail.com commit`.

## 1. Comis azi (cele mai noi primele)
| Commit | Ce face |
|---|---|
| `dda302e` | Card „Stare furnizori AI” în Setări › Inteligență artificială, modele retrase estompate cu comutare automată, mesaje clare pentru model indisponibil |
| `43edcf3` | „Vezi în carte” robust: găsește pasajul și fără AI (27% → 77%), reîncercare la limită de cereri, mesaje distincte |
| `809c6fd` | Interfața ierarhiei: „Cărțile de bază” (3 carduri), „Banca de materiale”, grup blocat în Biblioteca AI, citări „Carte”/„Material” în chat; citările vechi ale cărților de bază se deschid și după refacerea lor |
| `305d9a9` | Cărțile de bază se pregătesc singure la pornire (embeddings locale, fără API), sunt protejate (nu se șterg/mută) și au prioritate la căutare, cu antet `[CARTE DE BAZĂ]`/`[MATERIAL]` în context |
| `029dde0` | Vocabular comun: `src/lib/bookTier.ts` (book/bank/general) și `src/lib/bundledBooks.ts` (starea cărților) |
| `2ccdc82` | Extragere text cărți cu coloane detectate pe fiecare pagină; cuvinte rupte refăcute doar când forma există în carte; reclame scoase; `docs/EXTRAGERE-CARTI-RAPORT.md` |
| `eb32f41` | Grafică: aceeași atmosferă pe toate paginile, butoane unitare, stări goale cu ilustrație, panou de încredere compact, cifre consecvente pe Panou |
| `14ee6d7` | Prompturi: textul din documente e material, nu instrucțiuni |
| `a18924a` | „Vezi în carte” apare și la grilele fără explicație (toate cele din bănci); căutarea nu mai respinge pasajul din cauza formulelor de enunț |
| `de76969` | Explicația grilei păstrează cheia dar semnalează sincer când e discutabilă medical |
| `b3dc7a6` | Buton „Reindexează din textul curat” (acum cărțile se pregătesc singure) |

Verificat la `809c6fd`: tsc curat, ESLint 0, Vitest 2454 trecute, `security:scan` și `verify:runtime` ok; test live pe profil izolat: cărțile gata în 15 s fără nicio apăsare, pagina Rezidențiat și Biblioteca AI verificate vizual în ambele teme.

## 2. Tot ce s-a lucrat pe 14 octombrie e COMIS local (nimic necomis în afară de lucruri care nu sunt ale noastre)
Ultimele două commit-uri: `dda302e` (card „Stare furnizori AI”: ping real pe modele, cotă epuizată până la oră, modele retrase estompate cu comutare automată, mesaje clare pentru model indisponibil, descoperirea modelelor Mistral din `/v1/models`) și `43edcf3` („Vezi în carte” găsește pasajul și fără AI: 27% → 77% pe 22 de grile reale, reîncercare la limită de cereri, mesaje distincte „AI indisponibil acum” / „nu e în cărți”, chip „Potrivire găsită fără verificare AI”).
Verificat după ele: tsc curat, ESLint 0, Vitest 2493 trecute, `security:scan` și `verify:runtime` ok. Cu chei reale NU s-a testat nimic din ele (mock-uri). Necomise și **nu ale noastre**: `src/lib/searchIndex.ts`, `searchIndex.test.ts`, `.agents/` (nu le adăuga fără să afli ce sunt). Rapoarte: `docs/EXTRAGERE-CARTI-RAPORT.md`, `docs/EXPERIMENT-OCR-RAPORT.md`.

### Decizii/pași mici rămași de la agenți
- **Mistral descoperit din `/v1/models`** se doar afișează în card; alegerea lor cere lărgirea tipului `AIModel` și a lui `normalizeProviderModel` (`src/store/aiStore.ts`), care resetează orice ID necunoscut. Decide cu proprietarul.
- **Un 404 la o cerere reală** nu marchează încă modelul ca retras în card: există `markModelRetired`, dar calea de cereri din `src/lib/groqCore` nu l-a apelat. Se leagă cu o linie.
- **„Verifică acum”** consumă o cerere din cota zilnică a fiecărui model Gemini (~20/zi/model); nu rulează automat.
- **Lanțul real de furnizori:** furnizorul ales, apoi celelalte modele ale lui, apoi ceilalți furnizori cu cheie în ordinea Groq, Gemini, Mistral; după o trecere, aplicația rămâne 10 minute pe furnizorul care a răspuns (de aici impresia „trece mereu pe Groq”). Textul din card a fost corectat în acest sens.
- **„Vezi în carte” fără AI:** pe grile generice poate apărea un pasaj greșit, mereu cu eticheta „fără verificare AI”; dacă proprietarul îl vede ca zgomot, urcă `LOCAL_MIN_SCORE` (8) sau `LOCAL_MIN_TOP_IDF` (2,8) în `src/lib/bookAgent/index.ts`. Textul real al erorii 429 de la furnizori nu e verificat: trebuie văzut dacă `classifyAiError` îl recunoaște.

## 3. Ce rămâne de făcut (în ordine)
1. ~~Finalizează și comite cardul de furnizori și „Vezi în carte” robust~~ (făcut, vezi punctul 2).
2. **Test cu cheie reală în chat** (proprietarul pune cheia în fereastra de test; tu nu o introduci): „Întreabă din cărți” în Rezidențiat, citările „Carte”/„Material”, „Vezi în carte” pe grila cu leflunomidă (referință: «Tratamentul de fond, de referință în poliartita reumatoidă…», răspuns Metotrexat → Kumar p.75, ~8 s cu AI). Repetă testul și cu cheie Gemini/Mistral pentru cardul de stare. Scripturi de test refolosibile: `scratchpad` din sesiunea veche nu mai există; rescrie un script Playwright Electron (`_electron.launch` cu `STUDYX_USER_DATA`), vezi `scripts/qa-features.cjs`.
3. **Verificare vizuală rămasă:** secțiunea „Banca de materiale” cu materiale reale și pagina Rezidențiat pe lățime îngustă; butoanele (regula „litere normale”) pe `QuizCard`, flashcarduri, `BackupExport`.
4. **Decizii de la proprietar:**
   - Lawrence: cele 69 de pagini lipsă din PDF-ul aplicației (folderul lui vine dintr-un PDF de 414 p). Recomandare: fișier de text suplimentar, doar pentru căutare/chat, fără să atingă numerotarea. Detalii în `docs/EXTRAGERE-CARTI-RAPORT.md`.
   - Sinopsis: cele 14 pagini de răspunsuri (recomandare: nu).
   - OCR nou pentru cărți: **nu** (experiment: 10,8% cuvinte necunoscute față de 11,1% la textul actual, cu doze și virgule zecimale greșite). Variantă ieftină: extinde `src/data/ocrCorrections.json` cu cele mai frecvente erori din text.
5. **Restul auditului de prompturi:** lista veche (#5, #13, #16, #17, #19, #22–25) s-a pierdut odată cu transcriptul; doar #3 (judecata medicală în explicații) și regula „context = material” sunt făcute. Fă un audit nou, arată lista înainte să modifici.
6. **Furnizori (de verificat cu chei):** Mistral dă „Rate limit exceeded” de la prima cerere: probabil planul gratuit neactivat (verificare telefon + acceptarea datelor; limitele se văd la admin.mistral.ai/plateforme/limits). Gemini: „acest model nu e disponibil” (probabil `gemini-3.1-pro-preview`, preview). Aliasurile `mistral-*-latest` nu sunt confirmate în documentație; doar un ping real le confirmă.
7. **Conținut medical de verificat:** grila cu Hb 7,5 și „transfuzii urgente”; explicația AI la leflunomidă („hidroxiclorochina nu e DMARD eficient”) e discutabilă.
8. **Modul examinator** (chat cu întrebări orale): amânat de proprietar.
9. **Rebuild 1.0.0:** `npm run electron:build`, `npm run release:guard`, test pe calculator curat, test de actualizare. Republicarea aceluiași număr de versiune NU actualizează automat instalările existente de 1.0.0 (spune-i proprietarului). Aplicația instalată la proprietar e probabil încă 1.0.0 vechi: nu vede nimic din cele de mai sus până la rebuild. Fără push/publicare fără acord.

## 4. Starea tehnică în scurt
- PDF-urile cărților sunt în installer (`extraResources`, `process.resourcesPath/books`; rădăcina `studyx:bundled`), deci se deschid fără niciun folder. Doar sincronizarea Capitolelor ține de folderul de materiale.
- Căutarea în Rezidențiat: bonus ×1,25 și cotă minimă 2–3 locuri pentru cărți (`src/ai/retriever.ts`). Cărțile se indexează cu embeddings locale (vector 256), deci căutarea pe cărți e mai lexicală (BM25); la interogări cu vector API (768) fragmentele locale primesc automat toată ponderea lexicală.
- Textul cărților: `src/data/rezidentiat/library/*.pages.json` (index = pagina din PDF-ul integrat; nu schimba numerotarea). Regenerare: `node scripts/extract-book-pages.mjs`; `STUDYX_PAGES_OUT` scrie în alt folder.
- Panoul de diagnostic (Setări › Performanță › „Evenimente recente”) arată motivul real când un furnizor eșuează.
- Ratchete de design (`designTokens.test.ts`): `boxShadow` inline doar cu `var(--elev…)`, raze din {10,14,20,28}. Plafoane de lungime a prompturilor în `promptKit.test.ts` (cresc doar cu justificare).
- Folderele proprietarului (doar citire): `C:\Users\Iulia\Desktop\Carti\Lawrence - capitole`, `...\Sinopsis - capitole`, `C:\Users\Iulia\Desktop\Rezidentiat\Carti\Kumar\Kumar - capitole`.
