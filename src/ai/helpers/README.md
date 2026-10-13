# Ajutători AI locali (`src/ai/helpers/`)

Reguli deterministe, fără rețea și fără stores, care îmbunătățesc chatul fără tokeni în plus.
Testele: `npx vitest run src/ai/helpers`. Ajutătorii care serveau modelul local (eliminat) au fost scoși.

| Ajutător | Conectat în | Activ |
|---|---|---|
| `rewriteQuery` (`queryRewrite.ts`) | `components/ai-chat/localAssist.ts` (`queryForRetrieval`) | doar cu flagul `queryRewrite` (oprit implicit) |
| `shouldClarify` (`clarifyGate.ts`) | `localAssist.ts` (`clarificationFor`) | implicit pornit (`clarifyGate`) |
| `neutralizeActionClaims` (`actionClaims.ts`) | `localAssist.ts` (`checkAndComplete`) | mereu: scoate „am salvat/am creat” din chatul simplu |
| `looksTruncated` (`answerChecklist.ts`) | `AIChatDrawer.tsx` (butonul „Continuă”) | mereu |

Flagurile (`queryRewrite`, `clarifyGate`) se citesc din `localStorage['studyx.aiHelpers']` (JSON parțial) prin
`resolveHelperFlags` din `helperSettings.ts`; o valoare scrisă explicit bate implicitul.
