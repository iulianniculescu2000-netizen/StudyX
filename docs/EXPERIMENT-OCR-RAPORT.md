# Experiment: OCR nou (tesseract.js, `ron`) vs. stratul de text existent al cărților (14 oct 2026)

Doar măsurare. Nu s-a modificat nimic din `src/**`, `src/data/**`, `package.json`. Scripturile și datele experimentului sunt în scratchpad (`...\scratchpad\ocr-exp\`: `select.mjs`, `run-ocr.mjs`, `analyze.mjs`, `crop.mjs`, `analysis3.json`, `timing3.json`).

## 1. Metodă
- 20 de pagini, alese deterministic din `*.pages.json` (euristici: lungime, proporție de cifre, linii de listă, densitate de diacritice; fără pagini din primele 5 / ultimele 3).
- Randare din PDF cu pdfjs-dist 6.4 + canvas-ul lui (`@napi-rs/canvas`) la 300 DPI (~2400x3230 px). Nu există `pdftoppm` aici.
- OCR: tesseract.js 7.0.0 în Node, limba `ron`, PSM 3 (segmentare automată, tratează coloanele), 1 worker, secvențial (timp real, fără paralelism).
- **Descărcat:** `ron.traineddata`, 3 051 219 B (~2,9 MB), de tesseract.js din CDN-ul lui implicit (jsdelivr, pachetul `@tesseract.js-data/ron`, modelul `4.0.0_best_int`; dimensiunea corespunde). Cache: `scratchpad\ocr-exp\cache\`. Nimic altceva nu s-a descărcat.
- A = textul curent din `*.pages.json`; B = OCR nou (diacriticele sedilă ş/ţ normalizate la virgulă doar pentru comparație); C = `pdftotext -enc UTF-8 -layout` (e același strat OCR din PDF, deci C ≈ A „brut”, fără reparațiile din extractor).
- Lexicon: cuvintele din cele 3 cărți (A) care apar de ≥3 ori, **fără cele 20 de pagini de probă** (17 317 cuvinte); `ocrCorrections.json` nu a adăugat nimic nou (valorile erau deja în lexicon). Limită: lexiconul vine din A, deci un cuvânt greșit dar frecvent în A e „cunoscut”; iar „necunoscut” include și termeni medicali rari legitimi (de aceea ~11% la toate variantele; contează diferențele, nu nivelul).

## 2. Paginile (numărul = pagina din PDF, 1-based)
| Carte | Pagini (tip) |
|---|---|
| Kumar (7) | 103 și 300 (text dens, 2 coloane), 16 și 247 (tabele), 203 (liste/algoritm), 76 și 258 (diacritice multe; 76 = tabel DMARD) |
| Lawrence (7) | 84 și 250 (dens), 55 și 227 (tabele), 186 (listă), 54 și 60 (diacritice) |
| Sinopsis (6) | 41 (dens), 91 și 95 (tabele), 15 (listă), 36 și 109 (diacritice) |

## 3. Rezultate (total pe cele 20 de pagini, cuvinte de ≥3 litere)
| Măsură | A (curent) | B (OCR nou) | C (pdftotext) |
|---|---|---|---|
| Cuvinte | 8 790 | 8 754 | 9 017 |
| Necunoscute (față de lexicon) | 974 = **11,1%** | 947 = **10,8%** | 1 219 = 13,5% |
| „Lipite” (necunoscut = 2 cuvinte cunoscute) | 131 | 136 | 145 |
| „Rupte” (2 cuvinte adiacente = unul cunoscut) | 4 | 0 | 7 |
| Necunoscute care devin cunoscute prin restabilirea diacriticelor | 40 | 31 | 43 |
| ș/ț cu virgulă | 1 246 | 902 | 5 |
| ş/ţ cu sedilă | 0 | 369 | 1 255 |
| ă â î | 2 595 | 2 611 | 2 624 |

- Stratul PDF brut (C) folosește aproape exclusiv sedila (ş/ţ); extractorul/repararea din A le-a normalizat deja la virgulă. B folosește tot sedila în ~29% din cazuri, deci ar cere normalizare.
- Rata cuvintelor necunoscute pe pagină (A / B / C): K103 10,1/9,8/13,7; K300 5,8/6,3/8,7; K16 17,8/12,7/19,0; K247 11,8/12,5/14,6; K203 5,7/6,7/7,6; K76 10,6/7,7/12,6; K258 6,5/6,3/9,5; L84 7,1/6,2/8,6; L250 15,3/14,6/18,5; L55 19,2/28,0/20,8; L227 22,1/18,1/23,0; L186 10,6/13,3/17,7; L54 11,9/11,3/12,6; L60 10,9/9,7/12,3; S41 14,2/13,2/16,2; S91 14,1/13,1/15,6; S95 6,6/6,6/8,7; S15 7,4/7,8/9,9; S36 9,6/11,4/13,7; S109 20,3/20,4/21,7.
- Concordanța A–B (LCS pe cuvinte): text dens/liste 92–98% (K103 95,7; K300 97,4; K203 98,3; K258 98,3; L54 96,4; L60 96,5; S15 98,2); **pagini cu tabele 46–72%** (K16 48,7; L227 45,8; L55 60,8; K247 68,5; S91 71,6; K76 61,7; S95 96,2) — ordinea celulelor diferă și B pierde coloane (L227: 407 cuvinte în B vs 725 în A; L55: 207 vs 290). (Concordanța cu C e scăzută pe pagini dense, 51–70%, doar fiindcă `-layout` intercalează coloanele.)
- Diferențe locale A↔B (spații de 1–3 cuvinte, 266): A necunoscut / B cunoscut: **91**; A cunoscut / B necunoscut: **45**; ambele cunoscute: 85; ambele necunoscute: 45.

## 4. Exemple concrete (A → B). ✔ = verificat pe imaginea paginii; ○ = verdict din lexicon + context, neverificat vizual
1. K258 „sindrom **Marian**” → „Marfan”: B corect ✔ (greșeală A între două cuvinte „cunoscute”, deci nedetectabilă cu lexicon).
2. K76 „**7,5**-10 mg” (metotrexat) → B „1,5-10 mg”: **A corect, B greșit** ✔ (doză!).
3. L84 „invazia **nimorii**” → „tumorii”: B corect ✔.
4. L84 „**penim** a obține” → „pentru”; „**diagnos r ticului**” → „diagnosticului”; „**senmificative**” → „semnificative”; „**ffiră**” → „fără”: B corect ○.
5. K300 „nu **prezintfi** risc” → „prezintă”; K247 „**Vlrsta**” → „Vârsta”, „**spltalizărli**” → „spitalizării”: B corect ○.
6. K76 „**concern itent**” → „concomitent”: B corect ○.
7. L250 „**duete**” (de 4 ori) → „ducte”: B corect ○.
8. K300 „**foiați**” → „folați”: B corect ○.
9. K300 „**diabet zaharat**” (A, corect) → „diabetzaharat”; „aspirină în” → „aspirinăîn”; L84 „pentru a” → „pentrua”: **B lipește cuvinte** (în text dens, regulat) ○.
10. K203 „**pacienților**” → B „pacienilor” (ț pierdut); L84 „histologică” → „lustologică”: **B greșit** ○.
11. K300 „**asemenea**” → B „asemeriea”: B greșit ○.
12. K300 „**61,1** la pacienții” → B „611”; K247 „1,2 g” → „12”: **B pierde virgula zecimală** (în 5+ cazuri pe K16/K247/K300) ○ (nu l-am verificat vizual pe 61,1, dar K76 de mai sus arată că cifrele lui B nu sunt de încredere).
13. L227/L55 (tabele): B pierde coloane întregi ○.

## 5. Timp
- B: OCR 6,4 s/pagină (medie, 1 worker) + 1,0 s randare = **~7,4 s/pagină** ⇒ 854 pagini ≈ **105 min** pe un singur worker; cu 2–4 workeri ≈ 25–55 min (necomprobat). Confidența medie raportată de tesseract: 89,5.
- C: `pdftotext` pe toată cartea 5–17 s (nesemnificativ).
- Pentru comparație: stratul A există deja, cost zero la rulare.

## 6. Concluzie
**Înlocuirea (B în locul lui A): NU.** B nu e mai bun global: 10,8% vs 11,1% necunoscute e practic egal, iar B are defecte pe care A nu le are: cuvinte lipite în text dens, ț/diacritice pierdute, **virgule zecimale și cifre din doze greșite**, coloane de tabel pierdute, și folosește sedilă. Pe un text medical, cifrele greșite sunt cel mai rău tip de eroare.

**Votul pe cuvânt între A și B, pe toate cuvintele: NU** (cu doi sistemi nu ai cine să decidă când ambele sunt „cunoscute”; exemplele 2, 9, 10 arată că B greșește chiar acolo).

**Corecții doar pentru cuvintele necunoscute din A: DA, dar câștig mic.** Regulă sigură: se aliniază A cu B pe cuvinte; dacă un cuvânt din A este necunoscut (nu e în lexicon ≥3), cuvântul aliniat din B este cunoscut, are doar litere, distanța de editare ≤2 și nu e în zona de tabel/cifre ⇒ se ia B. În probă asta ar corecta până la ~91 din 8 790 cuvinte (~1%; în ~370 000 de cuvinte ale cărților, ordinul de 3–4 mii de cuvinte, o parte fiind variante legitime rare, deci estimarea e un plafon) și ar fi ratat greșeli de tip „Marian” (A cunoscut). Cost: ~105 min o singură dată, offline, la construirea cărților (nu la utilizator), plus ~3 MB de date `ron` la build și un script de aliniere; risc mic dacă se aplică doar regula de mai sus. Variantele rapide existente (`ocrCorrections.json`, extinderea lui cu cele mai frecvente erori din A) acoperă probabil o bună parte din același câștig la cost zero; recomand întâi aceea, iar OCR-ul nou doar dacă proprietarul vrea ultimul 1%.

## 7. Limite ale experimentului
Un singur model (`best_int`) și PSM 3; nu s-au încercat PSM 1/4, preprocesare (binarizare), `preserve_interword_spaces` sau modelul `best` neîntreg, care ar putea reduce lipirile. Eșantion de 20 pagini; verificare vizuală pe imagine doar pentru 4 exemple (1, 2, 3 și confirmările din 4 parțial); restul pe lexicon + context. Lexiconul nu detectează greșeli în care A produce un alt cuvânt real.
