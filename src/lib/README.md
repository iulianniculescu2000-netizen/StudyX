# Utility Libraries

Helpers used across the StudyX app. This file is only worth keeping if it stays
true — the previous version listed a `sm2Test.ts` that no longer exists, called
`generateClinicalCase()` unused when QuizCreate calls it, and carried a cleanup
list where nothing had been done.

## AI

| File | What it does |
|---|---|
| `groq.ts` | The AI API layer: chat, question generation, explanations, provider fallback. |
| `aiContext.ts` | Builds the user-context strings injected into prompts. |
| `aiRequestGovernor.ts` | Request queue, spacing and concurrency limits. |
| `jsonExtract.ts` | Pulls JSON out of model replies: survives a conversational preamble and recovers complete items from a reply truncated by `max_tokens`. |
| `ai/` | Higher-level AI features — the agent, quiz generation, the grile (question-bank) importer. See the files there. |

## Documents

| File | What it does |
|---|---|
| `pdfParser.ts` | PDF text extraction (pdf.js). |
| `docxParser.ts` | DOCX text extraction (mammoth). |
| `ocrParser.ts` | OCR for images (Tesseract.js). |
| `imageProcessing.ts` | Page rendering, captioned-image extraction, resizing. |

## Storage and scheduling

| File | What it does |
|---|---|
| `idb.ts` | Shared IndexedDB wrapper. |
| `flashcardImageStore.ts` | Flashcard images in IndexedDB, keyed `quizId:tag`; questions store an `idb:` pointer so quiz snapshots stay small. |
| `rollback.ts` | Snapshot taken before a content-pack install; restored from Settings → Date & Securitate. |
| `idleTaskScheduler.ts` | Defers non-critical work to idle time. |
| `asyncGuard.ts` | `createLatestOnlyRunner()` drops superseded async results. Used by the dashboard study buddy. |

## Progress and scoring

| File | What it does |
|---|---|
| `dashboardTrends.ts` | Week-over-week deltas for the dashboard cards. Returns `null` when there is no previous week, so no trend is shown rather than invented. |
| `gamificationProgress.ts` | Per-subject mastery and weekly question counts behind the gamification screen. |
| `adaptiveStudy.ts` | Builds review sets from the mistake bank. |
| `examSplit.ts` | Splits a bank into dated study sessions before an exam. |
| `deckKind.ts` | Single source of truth for "is this a flashcard deck or a quiz?". |

## Known gaps

- **Complete but unwired:** `AIEngine.explainWrongOptions()` (explains why each
  wrong option is wrong) and `groq.explainAnswerInline()` (streaming explanation
  that also flags a suspicious answer key). Both work; neither has a button.
  Wire them or delete them — don't leave them ambiguous.
