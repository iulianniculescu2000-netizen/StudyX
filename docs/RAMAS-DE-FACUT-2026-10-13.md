# StudyX — ce mai avem de făcut (predare pentru un chat nou, 13 octombrie 2026)

Citește întâi [HANDOFF.md](HANDOFF.md) (reguli, hartă, capcane). Acest document spune ce s-a făcut în sesiunea de azi și ce rămâne.

## 0. Decizii și reguli de azi
- **Nu există update 1.1.** Tot ce s-a lucrat intră într-un **1.0.0 reconstruit** la final. Nu schimba versiunea, nu adăuga slide-uri „Ce e nou în 1.1”, `CURRENT_TOUR_VERSION` rămâne neschimbat.
- **Nu publica, nu da push, nu pune tag** fără acordul explicit al proprietarului. Toate modificările de mai jos sunt comise doar local pe `studyx-1.0`.
- Proprietarul **nu vrea furnizori AI noi** (Cerebras, OpenRouter etc.: încercați în trecut, ineficienți). Rămân Groq, Google Gemini, Mistral.
- **„Vezi în carte” folosește exclusiv cele trei cărți incluse** (Kumar și Clark, Lawrence, Sinopsis). Documentele adăugate de student în Rezidențiat servesc doar pentru explicațiile din chatul AI.
- Datele reale din `%APPDATA%\StudyX` nu se ating și nu se citesc (nici `ai.json`: conține chei). Teste în Electron doar cu `STUDYX_USER_DATA` pe un folder temporar. Cheile AI le pune proprietarul singur în fereastra aplicației de test, nu în chat.
- Proprietarul a întrerupt de două ori rulări lungi sau cu aplicația pornită (Electron izolat pentru testul de import, suita completă). **Întreabă înainte de rulări lungi** și nu cere partajare de ecran: lucrează din terminal.

## 1. Ce s-a făcut azi (commit-uri locale, cele mai noi primele)
| Commit | Ce face |
|---|---|
| `3ae426c` | Cărțile incluse se indexează pentru chat din **textul curat** (`bundledBookText` în `src/lib/bookText.ts`), cu pagina din PDF la fiecare fragment |
| `e7b3295` | Sugestiile de după răspunsul din chat nu mai propun o „temă” fără legătură (`relatedCitationTopic`); seturile făcute din chat poartă numele subiectului (`chatQuizTitle`) |
| `c9a01b4` | Pauzele modelelor epuizate se păstrează la repornire; o cerere prea mare nu pune modelul în pauză; teste de scenarii (`src/lib/groqCore.quotaScenarios.test.ts`) |
| `04096f6` | Gemini 4 Argon adăugat (stabil pe pagina Google, 13 oct) |
| `e558612` | Fără „;” în explicațiile grilelor (`withoutSemicolons` în `src/helpers/quizAi.ts`) |
| `6edfa16` | **Agentul „Vezi în carte”** (`src/lib/bookAgent/`, `bookPassage.ts`, `bookKnowledge.ts`), fereastra cu evidențiere pe roluri |
| `892e600` | Cotă gratuită pe model, ritm pe furnizor (Mistral 1,1 s), erori Gemini citite, bug-ul `models/` din verificarea zilnică |
| `e44a436` | „Capcana de examen” nu se mai inventează; OCR „vitamina 8 12” |
| `a364d9d` | „Ce nu știu?” pornește de la subiecte slabe, nu de la categorii |
| `0f7509a` | Reparare OCR conservatoare (`src/lib/ocrRepair.ts`, `src/data/ocrCorrections.json`, generator `scripts/build-ocr-corrections.mjs`) |

### Cum funcționează noul „Vezi în carte”
1. **Înțelege:** dicționarul medical + localizator AI (termeni, cartea probabilă, capitole din plan; `bookAgent/prompts.ts`).
2. **Caută:** BM25 în `src/data/rezidentiat/library/*.pages.json` (text extras din PDF-uri, curat), cu capitolul și topicul din planul din Organizare (`bookKnowledge.ts`).
3. **Judecă:** AI-ul alege pasajul care susține răspunsul corect și marchează propozițiile cu roluri: `answer` (verde), `question` (albastru), `distractor` (portocaliu). Textul afișat rămâne cel din carte; citatele inventate se aruncă (`bookAgent/judge.ts`).
4. **Fără AI:** doar candidat cu scor ≥ 22; altfel „nu am găsit”. Limite de timp: localizator 15 s, judecător 40 s.

### Cum funcționează comutarea între modele și furnizori
Lanț: modelul ales → celelalte modele ale aceluiași furnizor → următorul furnizor (`buildProviderChain` în `src/lib/groqCore/providers.ts`). Un model cu cota epuizată e sărit până la reset (`quotaGuard.ts`, pauze salvate în `localStorage`); cheie respinsă sau cerere prea mare sar direct la alt furnizor. Cota Gemini gratuită e de 20 de cereri pe zi pe model.

## 2. Ce rămâne de făcut (în ordinea recomandată)
1. **Verificare live a „Vezi în carte”, cu o cheie reală.** Cazul de testat: grila cu leflunomidă în artrita reumatoidă (Kumar p.74–76). Înainte de ultima reparație agentul a răspuns „nu am găsit”. De văzut și: culorile evidențierilor, legenda, derularea la prima evidențiere, durata (sub 15 s cu Groq).
2. **„Adaugă tot” în Rezidențiat:** după import, Kumar și Lawrence au rămas la „De adăugat”, deși Sinopsis a fost adăugat. Cauza nu e aflată. Plan: script Playwright pe profil nou și izolat (`Cum te cheamă?` → `#/rezidentiat` → „Adaugă tot”, măsoară durata și starea fiecărei cărți). Aplicația Electron cere `vite` pornit pe 5173 când nu e împachetată.
3. **Instalările existente păstrează indexul OCR al cărților incluse** (importate înainte de `3ae426c`). Variante: buton „Reindexează din textul curat” în `BookLibraryTools`, sau ștergere și readăugare. Atenție la costul de embeddings, dacă sunt prin API.
4. **Restul auditului de prompturi:** judecata medicală și în explicații (#3), apoi #5, #13, #16, #17, #19, #22–25 (detalii în transcriptul sesiunii: `C:\Users\Iulia\.claude\projects\C--Users-Iulia-Desktop-TOT-StudyX\278e1204-e9d6-4730-9f57-8becf57f3c37.jsonl`).
5. **Modul examinator** (chat care pune întrebări orale, cu raport final): amânat de proprietar pentru viitor.
6. **Verificări de conținut medical:** grila cu Hb 7,5 și „transfuzii urgente” are un răspuns corect discutabil.
7. **Furnizori:** Mistral dă „Rate limit exceeded” de la prima cerere pe cheia proprietarului (probabil cont/plan, de verificat în consola Mistral). `gemini-3.1-pro-preview` e încă în listă, dar pagina Google nu îi spune statusul. Pagina Groq listează `llama-3.3-70b-versatile` și `llama-3.1-8b-instant` ca producție, deși în cod notasem că au fost retrase pe 16 august: neverificat fără cheie.
8. **Reconstruirea 1.0.0:** build installer, `npm run release:guard` (pică până există installerul), test pe un calculator curat, test de actualizare. Republicarea aceleiași versiuni **nu** actualizează automat instalările existente de 1.0.0.

## 3. Starea verificărilor
- Ultima rulare completă, înainte de ultimele 4 commit-uri: tsc curat, ESLint 0 erori (9 avertismente), Vitest 2394 trecute, `security:scan`, `verify:runtime` și `qa:features` trecute.
- După ele: `src/lib`, `src/components`, `src/pages` (1613 teste) trec, tsc curat. **Rulează din nou suita completă** înainte de orice build.
- Necomise și **nu ale noastre**: `src/lib/searchIndex.ts` și `src/lib/searchIndex.test.ts` (existau înainte de sesiune; nu le adăuga la commit-uri fără să afli ce sunt).
- Fișierele `src/data/rezidentiat/library/*.txt` nu mai sunt importate la rulare; rămân pentru `scripts/build-ocr-corrections.mjs`.

## 4. Capcane întâlnite azi
- Editarea cu Python în heredoc strică `\b`, `\d`, `\n` din șiruri non-raw (apar caractere de control sau linii rupte). Pentru expresii regulate și șiruri cu backslash folosește unealta Edit sau un fișier `.py` cu șiruri raw, apoi rulează `eslint` (prinde `no-control-regex`).
- Electron nepachetat încarcă mereu `http://localhost:5173`: fără `vite` pornit apare pagină albă (`ERR_CONNECTION_REFUSED`). `scripts/qa-features.cjs` merge tot pe serverul de dezvoltare.
- Un profil nou cere pasul „Cum te cheamă?” înainte să existe `main`.
- Testele de caracterizare `groqCore.characterization.test.ts` și `groqFlashcards.test.ts` descriu acum comportamentul cu mai multe modele pe furnizor (de ex. 8 cereri la un 429 pe Groq cu model necunoscut).
- Ratchetele de design (`designTokens.test.ts`) resping `boxShadow` inline fără `var(--elev…)` și `rounded-[Npx]` în afara {10,14,20,28}.
- Panoul de diagnostic (Setări › Performanță › „Evenimente recente”) arată motivul real când un furnizor eșuează: primul loc de uitat la probleme de AI.
