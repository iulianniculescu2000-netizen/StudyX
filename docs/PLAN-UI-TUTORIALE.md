# Plan de uniformizare UI și completare tutoriale

Data: 2026-10-11. Stare: plan rezultat din auditul codului actual, fără modificări de implementare. Înlocuiește ca referință de lucru planul istoric de tutoriale 2.3.0; aplicația actuală este 1.0.0.

## Obiectiv

Păstrăm direcția vizuală actuală, minimalistă și aerisită. Uniformizăm componentele cu același rol și facem ajutorul complet, contextual și ușor de găsit. Densitatea poate diferi justificat între un editor și un panou de sinteză.

## Constatări confirmate în cod

- Există 13 tururi spotlight și componente comune UI; problema este acoperirea și adoptarea parțială, nu lipsa infrastructurii.
- `src/store/tutorialStore.ts`: închiderea sau finalizarea onboardingului marchează toate tururile ca văzute. Mini-tururile nu mai pornesc automat pentru profilul respectiv.
- Lipsesc tururi dedicate pentru sesiunea de flashcarduri, rezolvarea grilelor și rezultate, recapitulare și sesiunea zilnică. Alte pagini au doar indicii scurte; inventarul va decide ce ajutor este potrivit pentru fiecare.
- Unele etape din creare grilă și chat sunt explicate în carduri centrate, fără a arăta controlul descris.
- Antetele, butoanele, cardurile și dialogurile sunt construite diferit pe pagini. De exemplu, GlassCard folosește implicit 24px, în afara setului 10/14/20/28; dialogul de resetare din Setări diferă de ModalShell inclusiv ca nivel de suprapunere.
- Testul de ancore verifică existența selectorului în cod, nu vizibilitatea pe ruta și în starea corectă. Testele motorului nu verifică spotlightul real.

Aceste observații provin din cod. Aspectul, severitatea vizuală și comportamentul real trebuie confirmate în browser și Electron izolat.

## Echipa și supravegherea

La fiecare lot de implementare folosim responsabilități distincte:

1. Coordonator: contextul proiectului, dependențe, alocarea fișierelor, integrare și raportarea limitărilor.
2. Agent UI: tokens, componente comune și migrarea paginilor; fundația se finalizează înainte ca alți agenți să o consume.
3. Agent tutoriale: acoperire, conținut, pornire/relansare și ancore, coordonate cu schimbările UI.
4. Agent verificare: review independent, regresii de comportament și verificare vizuală; nu validează exclusiv prin teste care repetă implementarea.

Maximum patru agenți activi simultan. Nu edităm în paralel același fișier; împărțim loturile și schimbăm rolurile când este necesar. Verificatorul transmite constatările coordonatorului înainte de integrare. Modificările locale deja existente sunt inventariate și păstrate.

## Etape și livrabile

### 1. Inventar în aplicație

Matrice pentru toate rutele și fluxurile: antet, carduri, butoane, formulare, dialoguri, stări goale/erori, ajutor disponibil și ancore. Capturi comparative în teme luminoasă/întunecată, 1366×768 și fereastră îngustă. Dashboard și Organizare sunt candidați de referință, validați prin comparația întregii aplicații.

Livrabil: listă de probleme cu captură, fișier, prioritate și criteriu de acceptare; diferențele intenționate sunt explicate.

### 2. Lot pilot și previzualizare

Stabilim variantele comune pentru antet, butoane, carduri, câmpuri și dialoguri pe baza elementelor existente. Pilot propus: lista de grile și trecerea spre alegerea modului de studiu, cu ghid contextual. Previzualizare înainte de extinderea schimbărilor mari de UI, conform preferințelor din HANDOFF.

Livrabil: comparație înainte/după și verificarea fluxului, fără redesign global.

### 3. Disponibilitatea tutorialelor

Separăm terminarea onboardingului de starea celorlalte ghiduri; păstrăm suprimarea prezentării de noutăți pentru utilizatorul nou ca regulă separată. Evităm o avalanșă de tururi printr-o invitație contextuală discretă. Reluarea rămâne disponibilă din pagină și Setări. Stabilim tratamentul profilurilor existente înainte de modificarea stării persistate; nu resetăm toate ghidurile global.

Livrabil: teste pentru profil nou/existent, închidere anticipată, reluare și schimbare profil. Închiderea onboardingului nu declară parcurs un ghid nevăzut.

### 4. Acoperirea fluxurilor de studiu

Prioritate: sesiune flashcarduri; alegerea modului și rezolvarea grilei; interpretarea rezultatelor; recapitulare și sesiune zilnică. Ghiduri scurte, aproximativ 3–5 pași, adaptate stării goale/populate. Apoi Notițe, Statistici, foldere și recuperare; unele pot fi suficient explicate prin ajutor contextual.

Îmbunătățim ghidurile existente pentru creare, chat și rezultatul generării. Un pas arată controlul real sau explică explicit o acțiune; nu pornește automat generări AI ori operații care modifică datele utilizatorului.

### 5. Uniformizare pe loturi

Ordine: componente comune → pagini de navigare/biblioteci → creare și setări → sesiuni și rezultate → dialoguri și stări secundare. Același rol are aceleași dimensiuni, spațieri și feedback. Respectăm tokens existenți, temele, reduced-motion și modul lite. Plafoanele testelor de design nu cresc.

### 6. Verificare și predare

După fiecare lot: teste focalizate, review independent, capturi și parcurgerea fluxurilor atinse. La final: tipuri, lint, teste, build, verificări runtime și secrets potrivit HANDOFF; QA Electron cu `STUDYX_USER_DATA` izolat.

Parcurgem fiecare ghid din pagină și din Setări, înainte/înapoi/închidere/relansare, cu profil gol și populat, tastatură, ambele teme și fereastră îngustă. Verificăm vizibilitatea și unicitatea țintelor, focusul, suprapunerile, scrollul și navigarea înapoi. Pentru pașii interactivi, focusul trebuie să permită controlul evidențiat.

Livrabil: raport cu verificări trecute, probleme rămase și limitări explicite. Nicio publicare sau lansare fără instrucțiune explicită.

## Verificare inițială

Rulare focalizată pe ancore, definițiile tururilor, motor, help tips și tokens: 4 fișiere trecute, 51 teste trecute; 2 suite nu au putut fi încărcate din cauza ENOENT pentru fișiere temporare ale mediului sandbox. Acest rezultat nu confirmă motorul sau help tips și nu reprezintă QA vizual. Problema mediului de test trebuie rezolvată înainte de validarea implementării.

## Reguli de integrare

- Înțelegem ruta, starea profilului și funcția înainte de schimbare.
- Fiecare lot are responsabil unic, criterii explicite și verificator independent.
- Nu integrăm cu erori cunoscute în fluxurile atinse; o verificare blocată este raportată ca blocată.
- Nu modificăm formatele datelor fără migrare și nu atingem datele reale în teste.
- Nu promitem absența absolută a greșelilor; prevenim și detectăm problemele prin schimbări mici, review și verificare reală.

## Lot verificat — 11 octombrie 2026
Review independent integrat: marker comun între TourEngine și useFocusTrap pentru Tab/Escape peste dialoguri; eliminate șase definiții page-* nefolosite după deduplicare; corectat textul destinației din ghidul Rezidențiat. Contextul /create cu edit și folder este păstrat.
Validare: 24/24 teste în createContext, residencyContext, helpTips, TourEngine și useFocusTrap; lint focalizat trecut. Suita completă și QA Electron izolat nu sunt confirmate de acest lot.
Conceptul chatbot are cinci stări și gesturi finite mai vizibile. Implementarea chatbotului rămâne separată de previzualizare, conform cererii de analiză înainte de integrare.
