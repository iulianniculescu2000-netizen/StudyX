# Audit StudyX — 12 octombrie 2026

## Domeniu și metodă

Auditul acoperă starea locală actuală, inclusiv modificările deja prezente în directorul de lucru. Am folosit capturile semnalate de utilizatoare, citirea traseelor din React/Electron și a stocării, teste unitare și o sesiune Brave izolată, alimentată cu un profil de test. Nu am accesat profilurile reale, nu am trimis cereri către furnizori AI și nu am publicat o versiune. Constatările sunt marcate **Aplicație** (reproduse în interfața izolată), **Cod** (demonstrate prin traseu și teste) sau **Captură** (reproduse în imaginea furnizată, fără datele originale în mediul de test).

Capturi generate cu date sintetice: [cardul notiței, luminos](audit-assets/notes-card.png), [cardul notiței, întunecat](audit-assets/dark-notes-card.png), [întrebarea deschisă din notiță](audit-assets/single-question.png), [câmpul la focus, luminos](audit-assets/note-field.png) și [întunecat](audit-assets/dark-note-field.png). Capturile inițiale ale dialogului de bibliografie, citărilor AI, notiței din grilă și schemei de psoriazis au fost furnizate în conversație.

## Matricea fluxurilor

| Flux | Ce am urmărit | Stare și nivelul dovezii |
| --- | --- | --- |
| Profil și pornire | hidratare profil izolat, tutorial, navigare | **Aplicație:** pornire și 24 de rute, în ambele teme, fără erori JavaScript la încărcare. Nu s-a testat migrarea datelor reale. |
| Panou, grile, foldere, creare | rute, stări goale, intrare în sesiune | **Aplicație:** încărcare normală și îngustă; **Cod/test:** căutări fără chenar dublu și mesaje pentru ID-uri inexistente. Importul unor documente reale nu a fost reluat. |
| Rezolvare, rezultate, notițe | deschiderea întrebării exacte, salvare, reluare | **Aplicație:** linkul din notiță deschide numai întrebarea asociată; **Cod/test:** sesiunea de o întrebare nu modifică istoricul complet al grilei; răspunsurile pot actualiza statisticile pe întrebare. |
| Bibliografie și citări | „Deschide în carte”, pagină, fragment, dialog | **Cod/test:** sursele importate deschid textul indexat, manualele curriculare cititorul lor; modalul cu fragment își închide stratul înaintea cititorului. **Limită:** PDF-ul generic original nu este reținut de fluxul de import. |
| Chat AI și scheme | acțiuni, ajutor, prompt, randare/export | **Captură/Cod/test:** ajutorul blocat, schema cu rădăcină tăiată și randarea veche au fost corectate; **neverificat:** calitatea unui răspuns nou de la un furnizor real. |
| Flashcarduri, recapitulare, erori, simulare | rute și stări fără date, comenzi relevante | **Aplicație:** rutele se încarcă; **Cod:** verificare de acțiuni similare. Nu s-a executat o sesiune lungă completă în Electron. |
| Rezidențiat, statistici, realizări | rute și stări inițiale | **Aplicație:** se încarcă în ambele teme fără erori la pornire. Corectitudinea calculului pe volume reale nu a fost măsurată. |
| Setări și actualizări | ecran, verificări automate, legătura Electron | **Aplicație:** setările se încarcă; **Cod:** verificări de build/runtime. Instalarea unei actualizări nu a fost efectuată. |

## Constatări și corecții

Nu am confirmat un defect de nivel **critic** în fluxurile verificate. Prioritățile de mai jos reflectă impactul asupra folosirii curente, nu o evaluare a datelor sau funcțiilor care nu au fost executate cu fișiere reale.

| Prioritate | Constatare și reproducere | Dovezi și schimbare | Criteriu de acceptare / verificare |
| --- | --- | --- | --- |
| **Important** | În chat, „Deschide în carte” nu deschidea sursa pentru o citare dintr-un document importat. | **Captură + Cod.** Cererea presupunea doar codurile cărților curriculare. Fluxul acceptă acum citarea unei surse importate și deschide fragmentul indexat cu pagina; denumirea acțiunii este „Deschide sursa”. | Citarea unei surse importate deschide textul/pagina citată; citarea unui manual deschide manualul. Testele `sourceCitation` și `BookViewerHost`. |
| **Important** | Semnele `?` de lângă fragment și verificarea cu alt model nu afișau ajutorul. | **Captură + Cod/Aplicație.** Stilul global `.glass-panel` suprascria poziția portalului de ajutor; poziționarea fixă este explicită. Un buton `?` din sesiunea de grilă a deschis dialogul în browserul izolat. Același tipar a fost corectat la indicatorul global de încărcare. | Ajutorul se poate deschide peste chat și primește focus; testul `HelpTip` și proba din browser. |
| **Important** | Linkul din cardul unei notițe ducea la prezentarea întregii grile. | **Captură + Aplicație.** Acțiunea este acum „Deschide întrebarea” și folosește ID-ul întrebării. În browserul izolat, a doua întrebare s-a deschis singură, iar prima nu era prezentă. Un ID șters afișează o eroare explicită. | Orice card deschide exact întrebarea sa; revenirea/reîncărcarea nu transformă o sesiune de o întrebare într-un scor complet. Testele `Notes` și `QuizPlay`, capturile de mai sus. |
| **Important** | Virtualizarea recentă din detaliile unei grile apela patru React Hooks după ramurile de „se încarcă” și „grila lipsește”. La trecerea între stări, ordinea Hooks putea deveni invalidă. | **Cod/lint/Aplicație.** Am mutat Hooks înaintea ramurilor de ieșire, cu lista goală când grila nu există. În browserul izolat, ambele întrebări ale unei grile de test se afișează. | Trecerea de la încărcare la grilă păstrează ordinea Hooks; testul `QuizDetail hydration`, lint și proba din browser. |
| **Important** | Schema interactivă de psoriazis avea rădăcina tăiată și un dialog disproporționat. O randare asincronă veche putea apărea după schimbarea temei/codului. | **Captură + Cod/test.** Nodurile Mermaid cu etichete lungi primesc dimensiune după conținut; dialogul urmează proporțiile SVG; schema încorporată nu trunchiază termenii lungi; randarea veche este ignorată. | Etichetele sunt complete la deschidere și export, inclusiv după schimbarea temei; teste `diagram`, `mermaidRuntime`, `diagramOutcome` și probă pe o schemă reprezentativă. |
| **Important** | Clasificările cerute AI erau împinse către un mindmap radial aglomerat, inclusiv pentru forme clinice. | **Cod.** Regulile de prompt favorizează arbori de clasificare cu o rădăcină, ramuri distincte, cel mult 12 noduri și trei niveluri; helperul alege structură pentru clasificare, secvență sau decizie fără a inventa fapte. | O cerere de clasificare produce ramuri distincte cu etichete scurte și păstrează detaliile în note ori scheme suplimentare. Testele `diagramPlanning` și `promptKit`; validarea cu model real rămâne deschisă. |
| **Îmbunătățire** | Fragmentul din bibliografia grilei era text brut, cu despărțiri OCR și fără ierarhie. | **Captură + Cod/test.** Formatarea grupează paragrafe, titluri și liste, repară ruperile de rând și păstrează textul normalizat; dialogul nu blochează cititorul când este ales PDF-ul. | Aceleași informații pot fi citite pe secțiuni, cu cuvinte complete și scroll; testele `RelevantDocModal` și formatare. |
| **Îmbunătățire** | Câmpul „Notița mea” avea chenar și focus dublu, bara de autoevaluare îl putea acoperi, iar cardul notiței avea acțiuni lipite de text. | **Captură + Cod/Aplicație.** Câmpul are antet și zonă de scriere unice și este adus la mijlocul ferestrei la focus; cardul separă întrebarea, conținutul și acțiunile. Mai multe căutări cu fundal transparent au primit același tratament pentru stilul global al inputurilor. | Focusul este clar și apare un singur chenar; bara nu acoperă textul activ; verificare vizuală pe profil sintetic. |
| **Îmbunătățire** | Rândul unei surse din Biblioteca AI părea acționabil și în timpul indexării/erorii, fără răspuns util. | **Cod/test.** Acțiunea duce la explicația stării existente; `SourceRow.test` acoperă cazurile. | Clicul pe fiecare stare produce o indicație sau navigarea așteptată. |
| **Îmbunătățire** | Un tabel lat din răspunsul AI se mărea la orice clic pe celulă, împiedicând selectarea textului. Exportul PNG putea depăși limita canvasului cu marginile adăugate. | **Cod/test.** Mărirea se face prin butonul explicit; scala PNG include marginile în limita de 8192 px. | Textul din tabel poate fi selectat; PNG-ul rămâne în limita canvasului. Testul `diagramExport`. |

## Uniformitate vizuală

Am parcurs 24 de rute la 1366×768 în ambele teme și șase rute principale la 720×600. Nu am observat overflow orizontal la nivelul paginii și nu au apărut excepții JavaScript în acest tur de încărcare. Acest control confirmă structura paginilor și stările inițiale, nu fiecare dialog sau conținut generat. Capturile inițiale ale utilizatoarei au relevat tocmai defecte ale conținutului dinamic, de aceea verificările țintite de mai sus au prioritate față de simpla încărcare a paginilor.

O căutare statică în `src` și `electron` după marcaje explicite `TODO`, `FIXME`, „not implemented” și handleri de clic goi nu a găsit o funcție declarată incompletă; defectele confirmate au fost în legătura dintre acțiune și destinație, în stratificarea dialogurilor și în prezentarea conținutului dinamic.

## Verificări și limite

- `npm run build` și TypeScript: **trec**; Vite avertizează asupra unor chunkuri mari.
- 123 de teste focalizate pe traseele modificate: **trec**. Suita completă, cu `TEMP`/`TMP` în `.qa-results/temp`: **240 fișiere trecute, 2 omise; 2.127 teste trecute, 2 omise, 0 eșecuri**. După acest tur a fost corectată ordinea Hooks în `QuizDetail`; testul nou de hidratare, cele 17 teste țintite ale căutării/materialelor, buildul și lint au trecut pe starea finală.
- Brave headless cu profil sintetic: rutele și temele de mai sus, plus navigarea notiță → întrebarea exactă: **trec**.
- ESLint: **0 erori**; trei avertismente mai vechi în `PremiumSelect`/`ThemedSelect` și un avertisment al React Compiler pentru `useVirtualizer` în `ErrorNotebook`. Scanarea secretelor și verificarea runtime: **trec**. Testele automate nu înlocuiesc un tur în aplicația Electron cu fișiere reale. Nu au fost folosite chei AI, PDF-uri personale sau profiluri reale.
- Vitest a întâlnit anterior `ENOENT` în directorul temporar al sandboxului; mutarea temporarelor în directorul proiectului a permis suita completă. Testul care creează un link simbolic de ieșire din rădăcina PDF este omis pe acest sandbox Windows: operația este respinsă cu `EPERM`; celelalte trei cazuri ale aceluiași fișier trec. Al doilea test omis este verificarea opțională a unui corpus generat față de examen. Acestea sunt limite de verificare, nu defecte confirmate ale StudyX.
- Testul pentru alegerea unui folder de materiale gol folosește acum un arbore temporar propriu. Înainte putea descoperi materialele create de alt test sub același `TEMP`; după izolarea fixture-ului, cele 17 verificări ale detectorului și ale căutării textului trec împreună. Aceasta corectează stabilitatea testelor, fără a schimba logica de selecție a folderului.

## Ordinea următoarelor validări

1. **Important — probe de acceptare în Electron:** cu un profil de test, importați un PDF și deschideți din chat sursa și pagina citată; verificați și manualul curricular. Acceptare: dialogul sursă este vizibil peste chat, titlul/pagina corespund citării, iar închiderea revine la conversație.
2. **Important — probă AI a schemelor:** cereți formele psoriazisului și încă o clasificare complexă, în ambele teme și la o fereastră îngustă. Acceptare: etichetele nu sunt tăiate, relațiile sunt corecte, toate faptele sunt păstrate, SVG și PNG corespund schemei afișate. O schimbare vizuală amplă ulterioară va avea previzualizare înainte de integrare.
3. **Important — sesiune completă și persistență:** răspundeți la o întrebare deschisă din notiță, apoi la o grilă completă și redeschideți aplicația. Acceptare: scorul grilei complete și istoricul nu sunt contaminate de exercițiul de o întrebare; notița și statisticile rămân disponibile.
4. **Îmbunătățire — regresie vizuală pe date variate:** fragmente OCR foarte lungi, tabele, liste, erori de indexare și scheme cu etichete medicale lungi. Acceptare: fără text tăiat, controale mascate sau acțiuni aparent inactive.

## Stare la final

Auditul a dus la corecțiile punctuale de mai sus, fără modificarea formatelor persistente, publicare sau apeluri reale către modele. Rulările finale și limitele lor sunt consemnate în secțiunea de verificări.
