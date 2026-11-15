---
name: studyx-chat-routing
description: Cum ajunge un mesaj din chatul AI la agent, la cartea de opțiuni sau la chat simplu, și cum eviți ca mesajele scrise de aplicație („explică această grilă”, debrief) să pornească generarea de grile. Folosește-l când adaugi un buton care trimite un prompt în chat sau schimbi detectarea comenzilor.
---

# Rutarea mesajelor în chat

Ordinea: `detectStudyRequest` (`src/lib/ai/optionRequest.ts`, cartea de opțiuni pentru „fă-mi N grile/flashcarduri”) → `looksLikeAgentCommand` (`src/lib/ai/agentCore/detection.ts`) → planificatorul LLM (`planAgentCommand`) → chat simplu cu `tutorContext`.

## Capcana
Cuvinte ca „grilă”, „fă-mi”, „schemă” dintr-un mesaj trimis de un buton al aplicației sunt luate drept comandă. Rezultat real (14 oct 2026): „Explică această grilă… fă-mi o schemă” a deschis cartea „Grile”, iar un debrief a primit „Despre ce grilă vrei rezumatul?”.

## Reguli
- Mesajele care vorbesc despre ceva existent trec prin `refersToCurrentStudyItem`: „această grilă”, „debrief”, „sesiunii”, „explică…grila” fără număr. Acolo nu se pornește agentul.
- Un prompt trimis de buton trebuie să fie **autonom**: chatul nu vede sesiunea. Debrief-ul include întrebările pierdute (răspunsul dat și cel corect); „explică” merge cu `quizContext`.
- Evită în textul butoanelor verbele-comandă (`fă`, `creează`, `generează`) și cuvintele „grilă/greșeli” când nu vrei agentul.
- Adaugi un buton nou: scrie testul în `src/lib/ai/commandDetectionRegressions.test.ts` (textul butonului → `looksLikeAgentCommand` fals, `detectStudyRequest` null). „Fă-mi 10 grile despre X” trebuie să rămână comandă.
- Modul Focus din grilă se oprește la ieșire (`QuizPlay` îl resetează la demontare): nu-l lăsa niciodată pornit pe alte pagini, pentru că ascunde bara laterală.
