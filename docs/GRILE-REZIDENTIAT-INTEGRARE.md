# Integrarea proiectului „Grile rezidentiat” în StudyX

Doar pentru **firul de Rezidențiat** (stilul `residency`); firul de facultate (`simple`) rămâne neschimbat. În aplicație intră reguli, parametri agregați și cod. Cărțile, grilele reale și paginile lor nu se copiază în repo.

## Ce avea deja StudyX
- Format de examen (5 variante A–E, enunț cu „:”, abrevieri explicate) și două piste: `residency` / `simple` (`src/lib/ai/examStyle.ts`, `RESIDENCY_STYLE_RULES`).
- Mecanismele de distractori în prompt (`RESIDENCY_DISTRACTOR_CRAFT`), ponderile „ce pică” pe teme pentru Organizare (`src/lib/organizare/examWeights.ts`), scripturile de import (`scripts/build-exam-weights.py`, `scripts/import-banca-grile.mjs`).
- Verificator medical pe alt furnizor decât cel care a generat (`src/ai/medicalJudge.ts`) și scorul de conformitate pe formă (`src/lib/ai/examConformance.ts`).

## Ce lipsea (față de proiectul-sursă)
| Din sursă | În StudyX |
|---|---|
| Plan pe grilă (nr. de corecte 25/56/19, metoda de distractori 48/30/22), tras de cod | **adăugat**: `src/lib/ai/examBlueprint.ts`, în prompt ca „PLAN PE ÎNTREBĂRI” |
| Litera cheii la CS după profilul real (11/20/30/25/15), exact pe lot | **adăugat**: `rebalanceKeyLetters` în `src/lib/ai/examForm.ts` |
| Controale de formă („semne de generat”: trimiteri la sursă, opțiuni-paragraf, glosă doar la cheie, antiteze, lungime uniformă) | **adăugat**: `findFormIssues` / `polishGeneratedQuestions`, rulate pe ambele căi de generare înaintea verificatorului |
| Construcția din text (enunț = titlul unității, chei literale, subset din listă, distractori de pe pagină) | **adăugat**: `RESIDENCY_GROUNDED_BUILD_RULES`, doar cu context |
| Verificator care nu vede cheia | **adăugat**: `blindVerify` în `src/ai/medicalJudge.ts`, după judecător, pe alt furnizor când există a doua cheie; doar la Rezidențiat; scoate grila al cărei răspuns diferă de cheie, deschis la erori. Testat cu modele simulate, nu cu chei reale |
| Plauzibilitatea distractorilor, poarta de citire pe imaginea paginii | nefăcut |
| Ponderi pe capitole pentru o simulare de 200 de grile; pagini fierbinți la alegerea paginilor de generat | nefăcut: nu există încă un constructor de simulare în Rezidențiat |

## Textele cărților (Kumar, Lawrence, Sinopsis)
- Textul din aplicație (`src/data/rezidentiat/library/*.pages.json`) e aceeași extragere pagină cu pagină ca în proiectul-sursă (aceleași pagini 391/345/118), dar curățat (diacritice cu virgulă, cuvinte nedespărțite, fără filigran): rămâne baza.
- Proiectul-sursă are în plus „unitățile speciale”: text din imagini pe care PDF-ul din aplicație îl pierde (etichete de scheme și algoritmi, legende, titluri de cadrane, note de subsol, casete „De reținut”). 670 din 1451 lipseau din aplicație.
- `scripts/build-book-figures.py` le aduce în `src/data/rezidentiat/library/figures.json` (561 de completări pe 347 de pagini, după filtrul de vocabular care scoate resturile OCR), iar `loadBookPages` le lipește la finalul paginii sub „Din figuri și casete:”. Intră astfel în căutare, chat, citări și cititor. Regenerare: `python -X utf8 scripts/build-book-figures.py "<folder Grile rezidentiat>"`.
- Neintrate: cărțile întregi (`*_full.jsonl`, 1568 de pagini Kumar) și imaginile paginilor; examenul urmează capitolele din tematică, deja în aplicație.

## Reguli păstrate
- Verificatorii rămân pe alt furnizor decât generatorul și nu se mută pe Copilot.
- Filtrul de formă respinge doar greșeli sigure; nu golește niciodată un lot. Lipsa din lot o completează mecanismul existent de completare (`fillShortfall`).
- Reordonarea nu atinge grilele cu opțiuni care depind de ordine („ambele”, „toate”, „B și C”).

## Pași următori (decizia proprietarului)
1. Încercarea verificatorului orb cu chei reale: costă un apel în plus pe lot, iar rata de dezacord a unui model-rezolvitor nu e măsurată.
2. Constructor de simulare Rezidențiat cu ponderile pe specialități (Cardiologie ~21 din 200, Ortopedie ~9 etc.).
3. Metrici noi în `scoreExamConformance` (mediana enunțului în cuvinte, dispersia lungimii opțiunilor, cheia vs distractori); cer recalibrarea pragurilor testelor existente.
