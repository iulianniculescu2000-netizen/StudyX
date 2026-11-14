# Măsurarea căutării în cărți

Un set fix de întrebări cu pagina corectă cunoscută, ca orice schimbare în `src/ai/retriever.ts` să se vadă în cifre, nu doar „pare mai bine”.

- Întrebările: `src/ai/eval/bookSearchCases.ts` (52: 28 Kumar, 14 Lawrence, 10 Sinopsis). Paginile au fost verificate în textul cărții, nu luate din planul de capitole.
- Rularea: `npx vitest run src/ai/eval --reporter=verbose --silent=false` (circa 10 s, fără rețea, fără cheie AI).
- Ce măsoară: nucleul căutării din chat (`rankChunks` cu întâietatea cărților și pragul `filterRelevantChunks`), pe aceleași 5114 fragmente pe care le indexează aplicația (inclusiv paginile Lawrence din afara PDF-ului), cu vectorii locali. Nu măsoară răspunsul modelului.
- Un caz e „găsit” când un fragment din primele 5 stă pe una dintre paginile acceptate. Când răspunsul stă complet în două cărți, cazul le acceptă pe amândouă (`alt`).

## Rezultate (14 nov 2026)

| Tip de întrebare | Nr. | Pe primul loc | În primele 5 | MRR |
|---|---|---|---|---|
| direct (numește subiectul ca în carte) | 39 | 82% | 100% | 0,90 |
| abreviere (TEP, BCR, CID) | 3 | 67% | 100% | 0,83 |
| parafrază (alte cuvinte decât cartea) | 10 | 40% | 70% | 0,49 |
| **total** | 52 | 73% | 94% | 0,82 |

Înainte de lista „formulări de zi cu zi → termenul din cărți” (`LAY_TO_MEDICAL` în `medicalSynonyms.ts`), aceleași întrebări dădeau la parafrază 30% / 50% / 0,38 și în total 71% / 90% / 0,79.

Ratate acum:
- „Zahăr mic în sânge la un diabetic: ce îi dau?” (termenul „hipoglicemie” e adăugat, dar „diabetic” trage spre alte pagini)
- „Ce medicament dau ca să scadă amoniacul la un cirotic confuz?” (cere o deducție: encefalopatie portosistemică, lactuloză)
- „Operăm pietrele la fiere dacă pacientul nu are simptome?” (cartea: litiază veziculară asimptomatică)

## Ce s-a încercat și nu a ajutat
- Rescrierea locală a întrebării (`rewriteQuery`, oprită implicit): 43 găsite față de 42 pe setul de atunci, cu o întrebare mai bine și una mai prost clasată. Rămâne oprită.

## Cum se citește
- Căutarea e bună când întrebarea folosește cuvintele cărții și mai slabă la parafraze: e pe cuvinte (BM25), vectorul local nu înțelege sensul. Lista de formulări de zi cu zi ajută doar unde există un termen echivalent fără echivoc.
- Jumătate din cazurile de parafrază au fost scrise după ce s-au văzut primele rateuri, iar lista de formulări a fost completată cu ele în față: cifra de la parafrază e optimistă. Adaugă întrebări noi înainte să tragi concluzii fine.
- Grupa „abreviere” are 3 cazuri: arată direcția, nu un procent de încredere.
- Pragul din test (`FLOOR`) e rezultatul rotunjit în jos. Când cifrele urcă, urcă pragul și tabelul de aici; nu-l coborî ca să treacă testul.
