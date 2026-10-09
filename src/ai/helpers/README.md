# Trusa de ajutători AI (`src/ai/helpers/`)

Obiectiv: răspunsuri și materiale mai bune **fără tokeni în plus** (limite gratuite Groq/Gemini/Mistral).
Principiu: reguli deterministe locale unde se poate; LLM `light` doar când câștigul e clar și plafonat.

**Starea conectării** (verificată în cod la 2.3.2):

| Ajutător | Conectat în | Activ |
|---|---|---|
| `rewriteQuery` | `components/ai-chat/localAssist.ts` (`queryForRetrieval`) | doar cu AI local (flag `queryRewrite`) |
| `checkAnswer` | `localAssist.ts` (`checkAndComplete`), `ai/localCompletion.ts` | doar cu AI local (flag `answerChecklist`) |
| `shouldClarify` | `localAssist.ts` (`clarificationFor`) | implicit pornit (`clarifyGate`) |
| `neutralizeActionClaims` | `localAssist.ts` (`checkAndComplete`) | **mereu**, fără flag: scoate „am salvat/am creat” din răspunsurile chatului simplu |
| `looksTruncated` | `AIChatDrawer.tsx` (butonul „Continuă”) | mereu |
| `judgeFlashcards` | `lib/ai/localFlashcards.ts` | doar la flashcarduri pe modelul local |
| `judgeGrile`, `styleFragment`, `shouldSelfCritique`, rescrierile LLM, `buildQueryRewriteMessages` | — | **neconectate** (rămân disponibile) |

Tot ce e aici e pur (fără rețea, fără stores) și testat (`npx vitest run src/ai/helpers`). Importă din `src/ai/helpers` (index.ts).

Tokenii sunt estimați cu `estimateTextTokens` din `tokenBudget.ts` (3,2 caractere / token), iar bugetele sunt
verificate în teste.

## Flaguri de activare

`readHelperFlags()` citește `localStorage['studyx.aiHelpers']` (JSON parțial). Implicit **totul oprit**:

```js
localStorage.setItem('studyx.aiHelpers', JSON.stringify({ answerChecklist: true, clarifyGate: true }));
```

Flaguri: `queryRewrite`, `queryRewriteLlm`, `answerChecklist`, `clarifyGate`, `itemJudge`, `itemRewriteLlm`,
`styleAdapter`, `selfCritique`. Recomandare: le puneți și în setările AI, sub „Economie de tokeni”, după validare.

## Sumar

| Ajutător | Tip | Cost tokeni adăugat | Economie / beneficiu | Flag |
|---|---|---|---|---|
| `rewriteQuery` | local | 0 | regăsire mai bună RAG (abrevieri, sinonime, EN→RO, fără formule de comandă) | `queryRewrite` |
| `buildQueryRewriteMessages` | LLM light, doar la regăsire slabă | ~74 (cerere) + ~25 ieșire | evită un răspuns „nu am găsit” (care costă un apel întreg) | `queryRewriteLlm` |
| `checkAnswer` | local | 0 | prinde limbă greșită, citări false, repetiții; repară sedila gratuit | `answerChecklist` |
| `buildFixInstruction` | regenerare țintită | ~42 + răspunsul o dată | înlocuiește „regenerează tot” cu o corecție precisă | `answerChecklist` |
| `shouldClarify` | local | 0 | economisește un răspuns întreg (~300-900 tokeni) la mesajele fără subiect | `clarifyGate` |
| `judgeFlashcards` / `judgeGrile` | local | 0 | scor + listă de elemente slabe, fără LLM | `itemJudge` |
| `buildFlashcardRewriteMessages` / `buildGrilaRewriteMessages` | LLM light, doar elementele slabe | 35-62 sistem + ~40/element | reface doar 10-20% din set în loc să regenereze setul | `itemRewriteLlm` |
| `styleFragment` | local (prompt mai mic) | −437 din 746 tokeni (−58%) pe 6 moduri | înlocuiește `chatModeModule` + `EXAM_REASONING_RULES` | `styleAdapter` |
| `shouldSelfCritique` + `buildSelfCritiqueMessages` | LLM light, doar răspunsuri cu probleme | ~59 sistem + răspunsul o dată | a doua trecere rară și ieftină | `selfCritique` |

Măsurat pe `styleFragment` (tokeni modulul vechi → nou): explain 149→49, summarize 87→60, test 92→52,
diagram 92→45, mnemonic 153→56, grounded/exam 173→48. Atenție: fragmentul scurt pierde detalii (de exemplu
cele patru puncte ale `EXAM_REASONING_RULES`); câștigul de calitate trebuie verificat manual înainte de a-l
face implicit. Recomandat inițial doar pe modelul local și rutele `light`.

## 1. queryRewrite — `rewriteQuery(query, { lastRetrievalScore })`

- Scoate prefixe („te rog, explică-mi ce este…”), repară sedila, folosește `expandMedicalQuery` (abrevieri
  IMA/HTA/DZ… doar în majuscule pentru cele de 2 litere) și tabelul EN→RO (`EN_RO_TERMS`).
- Ieșire: `{ core, expansions, searchText, needsLlm }`. `needsLlm` e adevărat doar dacă scorul de regăsire de la
  prima încercare e sub 0,35 și întrebarea are ≥ 2 cuvinte de conținut.
- Varianta LLM: `buildQueryRewriteMessages(query)` pe ruta `light`, apoi `parseQueryRewriteReply(reply)`.
- **Integrare**: `src/ai/retriever.ts` → `retrieveRelevantChunks`, la începutul funcției (acolo unde se apelează
  acum `expandMedicalQuery`):
  `const q = flags.queryRewrite ? rewriteQuery(query, { lastRetrievalScore }).searchText : query;`
  Sau în `contextBuilder.ts` înainte de apelul la retriever. Retry LLM: dacă `needsLlm`, un singur
  `groqRequest({ light: true, messages: buildQueryRewriteMessages(query) })` și o a doua căutare.

## 2. answerChecklist — `checkAnswer(answer, { sourceCount })`

- Verifică: sedilă (autoreparată în `autoFixed`), limbă (markeri RO/EN, doar la ≥ 15 cuvinte), citări [n] față
  de `sourceCount` (inclusiv [1,2], [1-3]), listă > 12 elemente, ASCII art (mermaid exceptat), doze fără sursă sau
  avertisment, text tăiat, propoziții repetate, lungime.
- `needsRegeneration` doar pentru probleme grave (limbă, citări false, repetiție, gol). Dozele fără sursă sunt
  doar `warn` (se afișează o notă sau se declanșează `selfCritique`).
- Regenerare țintită: trimite `[istoric..., răspunsul, user: fixInstruction]` o singură dată, pe ruta normală.
- **Integrare**: `src/components/ai-chat/useChatMessages.ts`, după terminarea streamingului (momentul în care
  se salvează mesajul asistentului):
  `const check = flags.answerChecklist ? checkAnswer(text, { sourceCount: sources.length }) : null; if (check) text = check.autoFixed;`
  Pentru răspunsuri necitite în flux, o variantă mai ieftină e aplicarea `fixSedilla` pe fiecare chunk.

## 3. clarifyGate — `shouldClarify(message, { hasHistory, hasScopedSource, hasAttachment })`

- Conservator: cere clarificare doar dacă mesajul nu are niciun cuvânt de conținut (după scoaterea verbelor de
  comandă și a deicticelor) și nu există istoric, document țintă sau atașament. „Explică-mi asta” fără
  istoric → întrebare scurtă. „Ce este IMA?”, „DZ”, mesaje sociale, mesaje > 120 de caractere → trec.
- Răspunsul de clarificare se afișează direct ca mesaj al asistentului: **zero apeluri LLM**.
- **Integrare**: `src/components/ai-chat/useChatMessages.ts` → începutul funcției de trimitere a mesajului
  (înainte de `AIEngine`): `const gate = flags.clarifyGate ? shouldClarify(text, {...}) : null; if (gate?.clarify) return addAssistantMessage(gate.question!);`

## 4. itemJudge — `judgeFlashcards(cards)` / `judgeGrile(questions, style)`

- Flashcard: față autonomă (oglindă a `isSelfContainedFront`), față vagă („asta”, „textul”), lungimi, spate
  gol/ecou/prea lung/multi-fapt, sedilă.
- Grilă: număr de variante (5 reziden­țiat, 4 simplu, 5 la multiplu), 1 corectă la complement simplu, 2-4 la
  multiplu, `multipleCorrect` coerent, variante duplicate, „toate/niciuna de mai sus”, indiciu de lungime
  (singura corectă e cea mai lungă), variantă de altă lungime/formă, cuvinte absolute, enunț scurt/lung,
  lipsă explicație. Țintele de lungime vin din `CONFORMANCE_TARGETS`/`EXAM_STYLE_META` (fără duplicare).
  Notă: „distractori din aceeași categorie” nu se poate verifica fiabil fără LLM; euristica `shape-outlier`
  prinde doar diferențele mari de lungime/formă.
- Rescriere LLM: `buildFlashcardRewriteMessages(cards, judgement)` / `buildGrilaRewriteMessages(...)` trimit
  **doar** elementele slabe (max 8 / 6), apoi `parseFlashcardRewrite` / `parseGrilaRewrite` validează
  (indexuri cerute, număr de variante neschimbat) și `applyGrilaRewrite` păstrează poziția variantelor
  corecte: rescrierea nu poate schimba cheia.
- **Integrare**: `src/lib/ai/flashcardAuthor.ts` → `generateFlashcardDeck`, după `cleanAndDedupe(...)`:
  `const j = flags.itemJudge ? judgeFlashcards(cards) : null;` (apoi rescriere opțională cu `requestStructured({ light: true })`).
  Pentru grile: `src/lib/ai/chapterQuizGeneration.ts` / `batchQuizGeneration.ts`, după parsarea răspunsului:
  `judgeGrile(questions, style)` și filtrarea/rescrierea `weakIndexes`.
- Observație: `isSelfContainedFront` din `flashcardAuthor.ts` ar trebui mutată într-un modul pur
  (`src/lib/ai/flashcardRules.ts`) și importată din ambele locuri, ca să dispară oglinda.

## 5. styleAdapter — `styleFragment({ mode, level })`

- Moduri: explain, simple, summarize, review (recapitulare rapidă), test, mnemonic, diagram, exam. Niveluri:
  începător / mediu / avansat, din `levelFromAccuracy(acuratețe%)`. `detectStyleMode(mesaj)` alege modul din
  cuvinte-cheie (null dacă nu e clar).
- **Integrare**: `src/ai/promptKit.ts` → `composeChatSystemPrompt`, la linia care adaugă `chatModeModule(mode)`:
  `flags.styleAdapter ? styleFragment({ mode: styleModeFor(mode), level }) : chatModeModule(mode)`
  (fișierul e ocupat de alți agenți acum; aplicați după ce se liberează).

## 6. selfCritique — `shouldSelfCritique(answer, check)`

- Rulează doar dacă `checkAnswer` a găsit probleme grave sau doze fără sursă și răspunsul are ≤ 900 de
  tokeni. Cost: ~59 tokeni de sistem + răspunsul o dată (fără istoric), pe ruta `light`.
- Ieșirea modelului: `OK` (păstrează) sau răspunsul corectat; `parseSelfCritiqueReply` ignoră „corecturile” cu
  mai puțin de jumătate din lungime (rezumate în loc de corectate).
- **Integrare**: `src/components/ai-chat/useChatMessages.ts`, imediat după `checkAnswer`:
  `if (shouldSelfCritique(text, check).run) { const out = parseSelfCritiqueReply(text, await requestLight(buildSelfCritiqueMessages(text))); }`
  Pentru ordinea de aplicare: `fixSedilla` (gratuit) → `checkAnswer` → (dacă e cazul) `selfCritique` →
  regenerare țintită doar dacă tot are erori.

## Ce NU face trusa

- Nu verifică corectitudinea medicală (pentru asta rămân `medicalJudge`, `crossCheck`, `verifyClinicalAnswer`).
- Euristicile de limbă și doze sunt prudente; pot omite cazuri (preferăm false negative în locul regenerărilor
  inutile care consumă tokeni).
- Calitatea reală a rescrierilor LLM și a fragmentelor `styleFragment` nu poate fi testată fără model: testele
  verifică doar structura, bugetul și siguranța aplicării.
