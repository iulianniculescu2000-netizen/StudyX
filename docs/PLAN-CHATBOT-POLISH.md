# Chatbot StudyX: analiză și direcție propusă

2026-10-11. Stare: analiză și previzualizare; nu implementare în chatbotul funcțional. Utilizatorul a cerut să discutăm înainte de schimbare.

## Ce avem acum

Pip este SVG în `src/components/Mascot.tsx`, cu idle/thinking/asleep, clipire, plutire, privire spre cursor, salut și gest la hover. Respectă modul calm. Mascota este folosită pe launcher, nu în conversația deschisă. Antetul și mesajele folosesc AIOrb, o identitate vizuală diferită.

Chatul are deja Chat/Studio, ecran complet, transparență configurabilă, mesaje cu markdown/citări/scheme, memorie și verificare cu alt model. Aceste funcții și structura datelor trebuie păstrate. `ChatHeader.tsx` arată permanent statusul Online; acesta nu dovedește disponibilitatea furnizorului.

## Direcție vizuală propusă

- Păstrăm Pip și accentul albastru StudyX; personajul continuă din launcher în antetul conversației.
- Un singur Pip animat vizibil; avatar mic static în mesaje.
- Stări reale: repaus/configurare necesară, așteptare, scriere, finalizare, oprire și eroare. Nicio promisiune de conectivitate fără verificare.
- Gesturi scurte, mai vizibile, și expresii clare, declanșate la tranzițiile stării, nu la fiecare token. Nu animăm continuu toate mesajele.
- Panou cu umbre stratificate, hairline luminos și suprafețe calme; composer și ierarhie mai clare, fără eliminarea controalelor existente.
- Reduced-motion și lite: expresii statice, fără plutire/urmărire cursor sau schimbări de scară persistente.

## Previzualizare înainte de implementare

`previews/ui-tutoriale/chatbot-concept.html`: cinci stări selectabile și dark/light, cu Pip fidel formei existente. Mesajele sunt ilustrative, fără apeluri AI sau acces la date. Companion: `polish.html`, pentru direcția umbrelor și a suprafețelor.

Aceste pagini sunt concepte. Nu înlocuiesc încă interfața aplicației. Evaluăm expresiile, densitatea, contrastul, umbrele și confortul în fereastră îngustă înainte de aplicare.

## Loturi ulterioare, după alegerea direcției

1. Model explicit al stării vizuale, derivat din loading/streaming/abort/error/configurare; teste pentru tranziții și retry.
2. Pip în antet, avatar coerent și gesturi finite; verificare reduced-motion/lite.
3. Finisaj panel/composer și ierarhie, păstrând Chat/Studio, citări, verificare și memorie.
4. Review independent și verificare în browser/Electron izolat, teme și fereastră îngustă. Nu lansăm schimbări pe baza unui screenshot singular.

Nu promitem efecte neurochimice. Criteriul este o interfață plăcută, coerentă și confortabilă în utilizare reală.
