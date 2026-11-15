# StudyX 1.0 — modificări și verificare locală

11 octombrie 2026. Versiunea aplicației rămâne 1.0.0. Fără push, tag sau publicare.

## Ce s-a implementat

- Film în șapte module încărcate la nevoie, aproximativ 65 s cu voce feminină română. Fișierele audio sunt locale, sunetul este oprit inițial. Un singur ceas coordonează textul, scenele și vocea. Pauză, reluare, alegerea scenei, tastatură și suspendare în ferestre ascunse; prezentare statică pentru mișcare redusă/economisire.
- Toate cele 13 ghiduri folosesc starea profilului: conținut gol/populat, documente pregătite/în lucru/cu erori, AI configurat, recapitulări, plan și Rezidențiat. „?” oferă explicații scurte și acces la ghid. Navigarea ghidurilor compară și parametrii paginii. Filmul precedă ghidul inițial.
- Panou cu accent pe activitatea zilei și intrări coordonate; răspunsuri cu iconițe și contur stabil; rezultate modulare cu scor central, animație unică și comparație între sesiuni comparabile.
- Importuri cu progres pe etape reale, erori persistente și reîncercare. Închiderea/anularea ignoră rezultatele întârziate; cererile deja pornite pot continua. Răspunsurile marcate manual sunt păstrate. Confirmări la salvarea grilelor.
- Prima pornire păstrează numele introdus în timpul splash-ului. Profilele Electron de test au și backupurile izolate, fără rotația backupurilor reale.

## AI: optimizări conservative

`src/ai/contextBudget.ts` centralizează bugetele, normalizarea prudentă și identitatea fragmentelor. Se elimină duplicate exacte numai când citarea este aceeași. Nu se elimină informații medicale doar pentru că seamănă. Markdown, formule, cod și structuri de text sunt păstrate. Plafoanele includ antetele și elipsa.

`src/lib/groqCore/studyPrompts.ts` pregătește instrucțiuni compacte, trimițând fiecare răspuns o singură dată. Explicațiile inline primesc toate variantele și toate marcajele corecte, nu doar prima variantă corectă. Se păstrează verificarea cheii, exprimarea incertitudinii, explicația distractorilor și contextul personal. Furnizorii, cheile, temperatura, streamingul și anularea cererilor rămân compatibile.

Pe un exemplu sintetic identic cu o singură variantă corectă, comparat cu implementarea inițială din HEAD:

| Prompt utilizator | Înainte (caractere) | După | Reducere |
| --- | ---: | ---: | ---: |
| Explicarea unui răspuns greșit | 1022 | 626 | 39% |
| Explicație inline | 1196 | 823 | 31% |

Acestea sunt măsurători de text pentru exemplul respectiv, nu tokeni facturați sau procente de economie totală. Numărul exact depinde de model, tokenizer, surse și istoric. Calitatea răspunsurilor cu furnizori reali nu a fost evaluată prin aceste teste: nu s-au folosit cheile și datele profilurilor reale pentru cereri de test.

## Verificări

- Build de producție și verificarea TypeScript: reușite.
- Lint: fără erori; trei avertismente existente în PremiumSelect/ThemedSelect.
- Scanarea secretelor și verificarea componentelor runtime: reușite.
- Suita completă: 2044 teste trecute, unul sărit; o verificare a razelor vizuale a semnalat o valoare nouă în afara tokenilor. Valoarea a fost corectată, iar toate cele 12 teste din fișier au trecut la reluare. Două fișiere sunt sărite de configurația existentă.
- 133 verificări țintite pentru film, ghiduri, importuri, Panou, rezultate, selecție și AI: trecute.
- Brave: 13 din 14 trasee au trecut la rularea completă. Testul de mutare folosea o întrebare cu o singură opțiune, clasificată ca flashcard. După corectarea fixture-ului într-o grilă validă, testul de mutare a trecut separat. Traseele includ creare/salvare/studiu/rezultat după repornire, ambele teme, tastatură, ferestre mici, navigare și film cu voce sincronizată.
- Electron live: pornire cu profil separat, redare MP3 locală, pauză, principalele pagini, persistență pe disc, backup izolat, versiunea actualizatorului și repornire: trecute.
- Aplicația Windows împachetată (`win-unpacked/StudyX.exe`, fără server de dezvoltare): aceleași verificări de voce, pauză, pagini, stocare, backup și repornire au trecut. Metadatele filmului sunt incluse și în bundle, pentru protocolul local `file://`.

Capturile și rapoartele regenerabile sunt în `.qa-results*`, `test-results` și `playwright-report`, excluse din Git. `scripts/qa-desktop.cjs` poate testa și aplicația împachetată prin `STUDYX_QA_EXECUTABLE`. Fiecare rulare folosește un director temporar distinct pentru date.

Vocea se regenerează cu `scripts/generate-intro-audio.py` și uneltele izolate `.venv-tools` (edge-tts și mutagen). Generarea folosește serviciul online de voce; redarea în aplicație folosește exclusiv fișierele locale. Nu există o dependență Python pentru utilizatorul aplicației.
