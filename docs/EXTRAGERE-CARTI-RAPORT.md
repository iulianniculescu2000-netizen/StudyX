# Extragerea textului din cărți: raport (14 oct 2026)

Textul cărților incluse (Kumar „K”, Lawrence „L”, Sinopsis „S”) se extrage pagină cu pagină din PDF-urile din `build/books` cu `scripts/extract-book-pages.mjs` (pdf.js) în `src/data/rezidentiat/library/*.pages.json` (array de stringuri, index = pagina din PDF − 1). Alimentează „Vezi în carte” (`bookPassage.ts`), agentul de carte, chatul AI și cititorul de capitole. Lungimile (391 / 345 / 118) și numerotarea paginilor sunt neschimbate.

## 1. Ce era greșit

1. **Mijlocul foii nu e culoarul.** Vechiul cod împărțea pagina la `lățime / 2`. În Kumar marginile nu sunt simetrice: coloana dreaptă începe la x≈281 pe o foaie lată de 577, adică înaintea lui `mijloc − 4` = 284,6. Toată coloana dreaptă (și rândurile ei) se lipea de coloana stângă, rând cu rând, după `y`. Exact asta e „pier buie utilizat…” de la Kumar p.75. Regula veche a pus fragmente în coloana greșită pe **252 din 391 pagini Kumar** (≈4 480 de fragmente), 181 din 345 la Lawrence, 69 din 118 la Sinopsis (pagini cu cel puțin un fragment pus greșit, măsurat cu aceeași detectare a culoarului ca extractorul nou).
2. **Fragmentele de spațiu (`" "`) erau aruncate**, deci „bifosfonați(vezi”, „Lancet2009” (56 de lipiri literă+an în Kumar).
3. **Titluri/tabele/legende pe lățime întreagă** se citeau ca și cum ar fi în coloana stângă, iar rândurile de tabel se amestecau cu coloanele de text.
4. **Cuvinte rupte la capăt de rând**: unele cu cratima citită de OCR ca „•”/„·” („zaha• rat”), altele ruperi fără cratimă („tre” + „buie”). Se lipeau doar cele cu forma întreagă atestată, dar paragraful era închis înainte de lipire (rând mai scurt ⇒ paragraf nou), deci „glucocor” / „ticoizilor” rămâneau în două paragrafe.
5. **Casetele de reclamă „Important! Platforma MG Rezidențiat…”** (4 pagini K, 16 L, 12 S) erau suprapuse peste text și se amestecau cu el („MG RezidenPlatforma rezidentiat.com oferă resursețiat – Grile Rezi…”).
6. Antetul literat al Sinopsisului („200 e S I N O P S I S D E M E D I C I N Ă”) rămânea în text; pictograma casetelor („li Cadranul 18.31”, „M Cadranul 18.30”) rămânea ca 1–2 litere.

## 2. Ce am schimbat în `scripts/extract-book-pages.mjs`

- **Culoar detectat pe fiecare pagină** (nu euristică globală): cel mai lat spațiu vertical aproape gol, căutat întâi pe liniile late (≥150 pt); apoi, dacă tabele/legende îl acoperă, după începuturile liniilor (două margini stângi clare); apoi pe fragmente mai scurte. Dacă pagina n-are culoar pe toată înălțimea (tabel pe lățime întreagă cu text deasupra/dedesubt), culoarul se caută separat pe zonele de text.
- **Benzi**: fragmentele care trec peste culoar (titluri, tabele, legende) taie pagina în benzi; în fiecare bandă se citește coloana stângă, apoi dreapta.
- **Tabele pe lățime întreagă** (3+ rânduri fără nicio linie de text cât o coloană, cu celule în ambele jumătăți) se citesc pe rânduri. Un tabel doar într-o coloană (cu text în cealaltă) rămâne în coloana lui, cu rândurile marcate ca tabel.
- **Fragmentele de spațiu se păstrează** (spațiere corectă).
- **Cuvinte rupte, fără ghicit**: lipire doar dacă forma întreagă apare în carte; cratimă la capăt de rând (inclusiv „•”/„·” citite greșit) dispare dacă forma întreagă e atestată, rămâne dacă e compus atestat („anti-inflamator”) sau necunoscut; ruperi în mijlocul rândului („pacie ntii”) doar dacă fiecare bucată apare o singură dată în carte, iar forma lipită de cel puțin două ori. Paragraful nu se mai închide la un rând doar puțin mai scurt sau la un cuvânt rupt; elementele scurte de listă rămân separate.
- **Reclame scoase**: fragmentele care sunt bucăți din textul fix al reclamei se recunosc, iar totul din dreptunghiul lor iese (0 pagini cu reclamă acum, față de 32).
- **Antete**: antetul literat Sinopsis și pictograma casetelor se scot; diacriticele rămân cu virgulă (ș/ț), la fel ca înainte.
- Scriptul exportă `extractFile`, `pageLines`, `organize`, `vocabulary` și rulează din CLI doar când e pornit direct. Variabila `STUDYX_PAGES_OUT=<folder>` scrie JSON-urile în alt folder.

## 3. Rezultate (eșantion + toată cartea)

Măsura: suprapunerea de trigrame de cuvinte cu `pdftotext` (citire automată pe coloane; referință imperfectă, ea însăși nu desparte cuvintele rupte și păstrează antetele), fără textul reclamelor. „Recall” = ce a găsit extractorul din referință; „precizie” = ce din extractor se află în referință (trigramele inventate de rândurile amestecate scad precizia). Eșantion: 36 pagini Kumar (p.74–77 + din 12 în 12), 35 Lawrence (p.31, 302, 303 + din 11 în 11), 30 Sinopsis (p.73, 111 + din 4 în 4), cu și fără coloane, cu tabele.

| Carte | Recall vechi → nou (eșantion) | Precizie veche → nouă (eșantion) | Recall toată cartea | Precizie toată cartea |
|---|---|---|---|---|
| Kumar | 0,895 → 0,928 | 0,899 → 0,936 | 0,889 → 0,933 | 0,893 → 0,942 |
| Lawrence | 0,914 → 0,916 | 0,927 → 0,930 | 0,936 → 0,944 | 0,949 → 0,957 |
| Sinopsis | 0,844 → 0,875 | 0,849 → 0,890 | 0,845 → 0,883 | 0,847 → 0,905 |

În eșantion: mai bune/la fel/mai slabe (recall ±1 punct): Kumar 14 / 14 / 8; Lawrence 18 / 10 / 7; Sinopsis 18 / 11 / 1. Paginile „mai slabe” sunt cele cu o casetă în mijlocul unui paragraf (Kumar p.99: caseta „Cadranul 23.1” stă între două capete de propoziție) sau cu tabel lat urmat de text (Lawrence p.201), vezi „Ce a rămas”. Scăderea de la Sinopsis p.111 vine din antetul scos (referința îl are).

Alte numere (toată cartea, vechi → nou): rupturi cu cratimă/„•” lăsate în text 108 → 49 (K), 30 → 23 (L), 35 → 14 (S); cuvinte rupte pe care le-am putut dovedi (bucăți rare + formă lipită atestată) 125 → 81 (K), 51 → 51 (L), 64 → 16 (S) (cele rămase sunt aproape toate în celule de tabel sau cu greșeli OCR în cuvânt, ex. „pacie,ntii”); litere + an lipite („Lancet2009”) 56 → 6 (K); pagini cu reclamă 32 → 0.

Exemple (înainte → după):

- Kumar p.75, vechi: «…prescris împreună cu metotrexat pentru a preveni pier buie utilizat în timpul sarcinii. Un istoric de screening, radiografia derea eficacității…» (rânduri din două coloane). Nou: «Metotrexatul rămâne medicamentul de baza în terapia AR, deși nu trebuie utilizat în timpul sarcinii. Un istoric de screening, radiografia toracică și un test IGRA…» și, în coloana dreaptă, «…pentru a preveni pierderea eficacității din cauza formării anticorpilor anti-medicament.»
- Kumar p.75, caseta: vechi «li Cadranul 18.31 Problemele clinice asociate folosirii glucocor … ticoizilor» → nou «Cadranul 18.31 Problemele clinice asociate folosirii glucocorticoizilor».
- Kumar p.50: «Lancet2009; 374:1351» → «Lancet 2009; 374:1351»; Kumar p.75: «bifosfonați(vezi p. 479)» → «bifosfonați (vezi p. 479)».
- Kumar p.57 (listă fără puncte): «…eșecului tratamentul cu fier oral sunt: lipsa complianței / pierderi continue de sânge / diagnostic incorect» rămâne listă de trei elemente (testul „sulfatul feros” și «Tratament» p.57 trec).
- Sinopsis p.111 / p.1 / p.14 etc.: «Platforma MG RezidenPlatforma rezidentiat.com oferă resursețiat – Grile Rezi oferă…» → text fără reclamă; «200 e S I N O P S I S D E M E D I C I N Ă» → scos.
- Lawrence: «obți- nerea» → «obținerea»; Kumar: «zaha• rat» → «zaharat».

Teste: `npx tsc -p tsconfig.app.json --noEmit` curat; `npx vitest run src/lib/bookPassage src/lib/bookAgent src/lib/bookText src/lib/bookPages src/lib/rezidentiatLibrary src/lib/ocrRepair src/test/RelevantDocPassage` trec (8 fișiere, 49 teste). Rulare completă `vitest run`: 299 fișiere trec; unul pică: `src/ai/studyPromptsRegressions.test.ts` („prompturile de grile…”), nelegat de cărți (lucrează alt agent pe prompturi).
Un singur test a trebuit ajustat: `bookAgent.test.ts › fără AI nu arată o potrivire slabă când cartea nu are subiectul (pneumonie comunitară)`. Alineatul «5. Tratament= analgezice, amoxicilină în doză mare este prima linie…» (otita medie, Sinopsis p.46) are acum paragraf propriu și trece pragul de rezervă (22) pe „amoxicilină” + „prima linie”. Aserțiunea: rezultatul e `null` sau nu e marcat „verificat” și nu pretinde pneumonie. Riscul real: fără cheie AI, „Vezi în carte” poate arăta o potrivire slabă; cu AI, judecătorul o respinge. De rediscutat pragul `FALLBACK_MIN_SCORE` (nu l-am atins).
`ocrRepair.ts` / `tidyBookText` nu depind de rupturile vechi: `tidyBookText` lipește oricum «literă-\n literă», iar dicționarul `ocrCorrections.json` e static și se construiește din `*.txt`, nu din `*.pages.json`.

## 4. Folderele proprietarului

Despre ce sunt: folderele `Desktop\Carti\Lawrence - capitole`, `Desktop\Carti\Sinopsis - capitole` și `Desktop\Rezidentiat\Carti\Kumar\Kumar - capitole` conțin fiecare „Capitole Intregi” + câte un folder pe capitol cu PDF-uri pe subcapitol. Nu am scris nimic acolo.

**Kumar** — folderul e exact împărțirea din plan: cele 179 de fișiere „pagina A-B” sunt aceleași cu `file` din `plan.json` (0 diferențe), iar A-B sunt deja pagini din PDF-ul compilat de 391 p (= numerotarea aplicației). Cele 16 capitole sunt singurele din aplicație. Paginile 1–4 ale PDF-ului nu sunt în plan nici în folder. Textul e același (suprapunere de cuvinte 0,97–1,00 pe cap. 18). Mapare: pagina n a PDF-ului „pagina A-B” = pagina A + n − 1 din PDF-ul compilat (cum scrie `bookPages.ts`). Nimic de schimbat.

**Lawrence** — folderul a fost făcut din „Lawrence RO - capitole rezi (extras, 414 p, neverificat)”, nu din PDF-ul de 345 p al aplicației; numele conțin **paginile tipărite**. Cele 17 capitole sunt aceleași. Mapare prin conținut (`node scripts/map-owner-folder.mjs lawrence`), tipărit → aplicație (diferență = tipărit − aplicație): cap.1 1–12→1–12 (0); cap.4 39–45→13–19 (26); cap.8 75–84→20–29 (55); cap.9 87–106→30–49 (57); cap.10 108–123→50–65 (58); cap.11 125–138→66–79 (59); cap.12 140–142→80–82 (60) și 151–164→83–96 (68); cap.13 167–168→97–98 (70), 172–174→99–101 (73), 179–191→102–114 (77); cap.14 193–199→115–121 (78), 204–214→122–132 (82); cap.15 216–219→133–136 (83), 222–225→137–140 (85), 228–240→141–153 (87); cap.16 242–255→154–167 (88); cap.17 257–275→168–186 (89); cap.20 317–324→187–194 (130), 333–342→195–204 (138); cap.26 520–527→205–212 (315), 534–541→213–220 (321); cap.27 548–583→221–256 (327); cap.28 585–633→257–305 (328); cap.29 635–674→306–345 (329). Planul e coerent cu această mapare (283 de topicuri L verificate: o singură diferență, «11. Leziunea meniscală» p.606–607 are pdf 277–279, iar maparea dă 278–279, adică o pagină în plus în plan).
Ce are folderul în plus: **69 de pagini care nu sunt în PDF-ul aplicației** (tipărite: cap.1: 13; cap.4: 46; cap.8: 85–86; cap.9: 107; cap.10: 124; cap.11: 139; cap.12: 143–150, 165–166; cap.13: 169–171, 175–178, 192; cap.14: 200–203, 215; cap.15: 220–221, 226–227, 241; cap.16: 256; cap.17: 276; cap.20: 325–332, 343–344; cap.26: 512–519, 528–533, 542–545, 547; cap.27: 584; cap.28: 634; cap.29: 675). Sunt ultimele pagini de capitol (întrebări/răspunsuri, ex. «RĂSPUNSURI ȘI EXPLICAȚII» cap.26) și pagini de conținut: anatomia esofagului, fiziologia gastrică, clasificarea și **tratamentul medical al ulcerului** (cap.13 p.169–171, 175–178), pagini din ficat și vascular. Niciun topic din plan nu le folosește. În sens invers, PDF-ul aplicației nu are nicio pagină care să lipsească din folder. Textul paginilor comune e echivalent (6,6–6,8 % cuvinte rare în ambele; nicio pagină cu lungime diferită cu >10 %), deci folderul **nu dă text mai curat**.

**Sinopsis** — sursa folderului: „Sinopsis RO - tematica (extras, 133 p, neverificat)” (118 p ale aplicației + copertă + 14 pagini de răspunsuri), cu paginile tipărite. Cele 6 capitole sunt aceleași (9 Dermatologie, 10 Pediatrie, 12 Ginecologie, 13 Obstetrică, 14 Psihiatrie, 15 Epidemiologie). Mapare (`node scripts/map-owner-folder.mjs sinopsis`): **aplicație = tipărit − 195** pentru 196–245 (aplicație 1–50) și **aplicație = tipărit − 222** pentru 273–340 (aplicație 51–118); capitolul 11 (246–272) lipsește din ambele. Toate cele 118 pagini ale aplicației apar în folder (potrivire ≥ 0,5 pe fiecare). În plus, folderul are „Răspunsuri la întrebări capitolele 1–15 - pagina 341–354” (14 pagini), care nu sunt în aplicație. PDF-ul de 133 p nu are reclamele; textul rămas e același cu al celui de 118 p.

**Concluzii pentru „extrage doar ce este relevant”:**
- Pentru Kumar și Sinopsis folderul nu aduce text mai bun și nu schimbă mulțimea de pagini relevante (Kumar: identic cu planul; Sinopsis: aceleași 118 pagini, plus răspunsurile).
- Pentru Lawrence, ce e de decis e invers: PDF-ul aplicației e un subset (345 din 414) față de ce a considerat proprietarul în folder. Dacă paginile 169–178 (ulcer) etc. sunt relevante, aplicația nu le are în PDF, în text și în căutare.
- Nu am recomandat folosirea folderului pentru extragere: aceeași calitate OCR, altă numerotare (tipărită) ⇒ risc pentru plan, citări și „Deschide în manualul PDF”.
- Dacă proprietarul vrea paginile lipsă: (1) cel mai simplu, un PDF „Lawrence RO - capitole rezi (414 p)” nou în `build/books` și refăcut planul (`pdf` ranges, `bookPages.ts › BOOK_FILES`, `topic.pdf`, `*.pages.json`) cu scriptul `map-owner-folder.mjs` (al treilea argument = JSON de ieșire) ca tabel de conversie; (2) sau doar text suplimentar: extras din folder într-un fișier `lawrence.extra.pages.json` cheiat pe pagina tipărită, folosit doar de căutare/chat, fără a atinge numerotarea aplicației. Nu am aplicat nimic.
- Pentru răspunsurile Sinopsis: un `sinopsis.answers.json` (14 pagini, tipărit 341–354) ar putea alimenta explicațiile, de decis separat.

## 5. Ce a rămas nerezolvat

- **Tabele cu celule pe mai multe rânduri**: se citesc rând cu rând (celula „Labetalol, nicardipină i.v. (doar în caz de…” se întrerupe pe rândurile următoare). Corect ar fi câte o coloană de celule, dar cere detectarea coloanelor tabelului. Rămâne text citibil, fără rânduri amestecate între coloanele de text.
- **Casete în mijlocul unui paragraf** (Kumar p.99 «Cadranul 23.1»): caseta e în coloana ei, iar propoziția continuă în coloana următoare, așa că textul casetei apare între cele două jumătăți.
- **Pagini cu tabel lat urmat de puțin text pe două coloane** (Lawrence p.201 jos): zona de text e prea scurtă pentru a-i găsi culoarul, deci rândurile ei rămân lipite pe orizontală.
- **Greșeli OCR din stratul de text al PDF-ului** (ex. „pentrn”, „detennină”, „REJINUT”, „pacie,ntii”, „TABELE 28-8” citit „-A BELUL”) nu se repară aici: se ocupă `ocrRepair.ts` (doar ce e sigur). „Reajus tarea” (bucăți atestate o singură dată, formă întreagă absentă) nu se lipește, ca să nu inventez cuvinte.
- Figurile/schemele produc linii-etichetă scurte care devin titluri `## …` false. Neschimbat față de înainte.

## 6. Cum se reia extragerea

```
node scripts/extract-book-pages.mjs            # toate cărțile, scrie direct în src/data/rezidentiat/library
node scripts/extract-book-pages.mjs K          # doar Kumar
node scripts/extract-book-pages.mjs K 74 77    # afișează în consolă paginile 74–77 (nu scrie)
STUDYX_PAGES_OUT=C:/temp/pagini node scripts/extract-book-pages.mjs   # scrie în alt folder (pentru comparații)
node scripts/map-owner-folder.mjs lawrence|sinopsis [folderCarti] [ieșire.json]   # maparea din secțiunea 4
```
După regenerare: `npx tsc -p tsconfig.app.json --noEmit` și `npx vitest run src/lib/bookPassage src/lib/bookAgent src/lib/bookText src/lib/bookPages`. Copiile `*.pages.json` de dinainte (cele din commit-ul precedent) sunt recuperabile din git (`git show HEAD:src/data/rezidentiat/library/kumar.pages.json`). Durata: ≈30 s pentru cele trei cărți. Reindexarea cărților incluse în aplicație pentru utilizatorii cu index vechi e separată (butonul din Rezidențiat).
