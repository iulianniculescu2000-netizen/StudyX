# 🗺️ StudyX — Inventar complet de funcții

> **Versiune:** 1.0.0
> **Tip:** Aplicație desktop (Electron + React + Vite + TypeScript) pentru studenți la medicină — grile, flashcarduri, notițe, asistent AI.
> **Actualizat:** octombrie 2026

Legendă status: ✅ Complet · ⚠️ Parțial / cosmetic · 🛠️ De aliniat

---

## 1. 📚 Quiz-uri / Grile (nucleul aplicației)

| Funcție | Status | Locație |
|---|---|---|
| Listă grile cu căutare (titlu/descriere/subiect) | ✅ | `src/pages/QuizList.tsx` |
| Creare grilă manuală (întrebări, opțiuni, explicații, tag-uri) | ✅ | `src/pages/QuizCreate.tsx` |
| Generare grile din text/AI | ✅ | `src/pages/quiz-create/sections.tsx` |
| Import grile (JSON/fișier) | ✅ | `src/components/ImportQuizButton.tsx` |
| Joc grilă (play) cu progres, scor, notițe per întrebare | ✅ | `src/pages/quiz-play/QuizPlayRefactored.tsx` |
| Rezultate grilă | ✅ | `src/pages/QuizResults.tsx` |
| Detalii grilă + căutare în întrebări | ✅ | `src/pages/QuizDetail.tsx` |
| Pin / Arhivare / Duplicare / Ștergere | ✅ | `src/store/quizStore.ts` |
| Operații bulk (ștergere/mutare multiplă) | ✅ | `src/store/quizStore.ts` |
| Imagini în întrebări (extracție din PDF) | ✅ | `src/components/QuizImage.tsx`, `src/lib/imageProcessing.ts` |
| Cleanup imagini orfane | ✅ | `src/store/quizStore.ts` |

## 2. 🗂️ Bibliotecă / Foldere

| Funcție | Status | Locație |
|---|---|---|
| Foldere + subfoldere reale recursive | ✅ (v1.0.5) | `src/store/folderStore.ts` |
| Mutare grile între foldere | ✅ | `src/store/quizStore.ts` |
| Personalizare folder (emoji, culoare) | ✅ | `src/lib/folderAppearance.ts` |
| Knowledge Vault (bibliotecă de documente) | ✅ | `src/pages/KnowledgeVault.tsx` |
| FolderView cu subfoldere | ✅ | `src/pages/FolderView.tsx` |

## 3. 🎴 Flashcarduri

| Funcție | Status | Locație |
|---|---|---|
| Hub flashcarduri | ✅ | `src/pages/FlashcardHub.tsx` |
| Creare/editare carduri (față/spate) | ✅ | `src/pages/Flashcard.tsx` |
| Sesiune de studiu flashcard | ✅ | `src/pages/FlashcardSession.tsx` |
| Imagini în flashcarduri (smart extraction, IndexedDB) | ✅ (v1.0.4/1.0.5) | `src/lib/flashcardImageStore.ts` |
| Generare flashcarduri din notițe (AI) | ✅ | `src/lib/ai/agent.ts` |

## 4. 📝 Notițe

| Funcție | Status | Locație |
|---|---|---|
| Editor notițe cu căutare | ✅ | `src/pages/Notes.tsx`, `src/store/notesStore.ts` |

## 5. 🔁 Repetiție spațiată / Review

| Funcție | Status | Locație |
|---|---|---|
| Daily Review (întrebări scadente) | ✅ | `src/pages/DailyReview.tsx` |
| Review Mode (întrebări slabe) | ✅ | `src/pages/ReviewMode.tsx` |
| Algoritm scadențe (`getDueQuestions`, `getWeakQuestions`) | ✅ | `src/store/statsStore.ts` |
| Studiu adaptiv | ✅ | `src/lib/adaptiveStudy.ts` |

## 6. 🤖 Asistent AI

| Funcție | Status | Locație |
|---|---|---|
| Chat AI (drawer) cu thread conversațional | ✅ | `src/components/AIChatDrawer.tsx` |
| Streaming răspunsuri + markdown | ✅ | `src/ai/AIEngine.ts` |
| Detectare intenție (intent router) | ✅ | `src/lib/ai/intentRouter.ts` |
| Agent cu tool-uri (creare folder, generare pachet grile, flashcarduri, plan studiu, mutare/redenumire/ștergere, rezumat document) | ✅ | `src/lib/ai/agent.ts` |
| Undo pentru acțiuni agent + retry („mai încearcă") | ✅ (v1.0.5) | `src/lib/ai/agent.ts` |
| Generare hint / mnemonic / explicații opțiuni greșite | ✅ | `src/ai/AIEngine.ts` |
| Generare din „banca de greșeli" | ✅ | `src/ai/AIEngine.ts` (`generateFromMistakeBank`) |
| Plan de studiu (subfolder-aware) | ✅ | `src/lib/ai/agent.ts` |
| Procesare documente: PDF, DOCX, OCR | ✅ | `src/ai/pdfParser.ts`, `src/ai/docxParser.ts`, `src/ai/ocrParser.ts` |
| RAG: chunking, embeddings, vector store, retriever | ✅ | `src/ai/retriever.ts`, `src/ai/vectorStore.ts`, `src/ai/chunker.ts` |
| Provideri: Groq + Google Gemini + Mistral | ✅ | `src/lib/groq.ts` |
| Setări AI (chei API per-provider) | ✅ | `src/components/AISettings.tsx` |
| Rate limiting / governor cereri | ✅ | `src/lib/aiRequestGovernor.ts` |
| Generare în loturi (batch) | ✅ | `src/lib/ai/batchQuizGeneration.ts` |

## 7. 📊 Statistici & Analytics

| Funcție | Status | Locație |
|---|---|---|
| Stats overview, trend acuratețe, grafic activitate, heatmap, radar categorii | ✅ | `src/components/stats/` |
| Perspective AI (pregătire: acuratețe pe grilele rezolvate cu interval de nesiguranță, acoperire, ritm, goluri de cunoștințe) — doar din răspunsurile tale, fără scor prezis | ✅ | `src/components/analytics/AIPredictiveRefactored.tsx`, `src/lib/analyticsStats.ts` |

## 8. 🎮 Gamification

| Funcție | Status | Locație |
|---|---|---|
| Achievements (din statistici reale) | ✅ | `src/components/gamification/AIGamificationAchievements.tsx` |
| Challenges (zilnice/săptămânale) | ✅ | `src/components/gamification/AIGamificationChallenges.tsx` |
| Stats utilizator (puncte, nivel, streak) | ✅ | `src/components/gamification/AIGamificationStats.tsx` |
| Leaderboard → „Tu vs. Tine" | ✅ (rezolvat) — înlocuit cu comparație pe date reale (azi/ieri/media săptămânii/cel mai bun), fără competitori ficțiuni | `src/components/gamification/AIGamificationSelfComparison.tsx` |

## 9. 🏠 Dashboard & Navigare

| Funcție | Status | Locație |
|---|---|---|
| Dashboard (carduri stat, progres azi, AI study buddy) | ✅ | `src/pages/Dashboard.tsx` |
| Sidebar / Navbar / TitleBar (custom window controls) | ✅ | `src/components/` |
| Căutare globală (Cmd+K) | ✅ | `src/components/GlobalSearch.tsx` |
| Scurtături tastatură | ✅ | `src/components/KeyboardShortcuts.tsx` |
| Profiluri multiple (select/creare) | ✅ | `src/pages/ProfileSelect.tsx` |
| Welcome / onboarding | ✅ | `src/pages/Welcome.tsx` |

## 10. 🧰 Productivitate

| Funcție | Status | Locație |
|---|---|---|
| Focus Mode | ✅ | `src/store/focusModeStore.ts` |
| Tutorial / What's New tour | ✅ | `src/components/Tutorial.tsx`, `src/components/WhatsNewTour.tsx` |
| Notificări desktop | ✅ | `src/lib/desktopNotify.ts` |
| Study Coach | ✅ | `src/lib/studyCoach.ts` |

## 11. 💾 Date, backup, sistem

| Funcție | Status | Locație |
|---|---|---|
| Export / import backup | ✅ | `src/components/BackupExport.tsx` |
| Auto-backup | ✅ | `src/hooks/useAutoBackup.ts` |
| Stocare IndexedDB | ✅ | `src/lib/idb.ts` |
| Mod offline + service worker | ✅ | `src/lib/offline/`, `src/utils/serviceWorker.ts` |
| Health check pornire + rollback + guard sesiune | ✅ | `src/lib/startupHealthCheck.ts`, `src/lib/rollback.ts` |
| Optimizare performanță (device tier, motion adaptiv, memory profiler) | ✅ | `src/lib/deviceTier.ts`, `src/hooks/usePerformanceOptimizer.ts` |
| Auto-update (Electron updater, manifest GitHub) | ✅ | `electron/updater.cjs`, `src/components/UpdateModal.tsx` |

## 12. 🎨 UI / Accesibilitate

- Splash screen, animated background, magnetic buttons, premium select/tooltip — ✅
- ErrorBoundary global + per-rută — ✅
- Theme toggle (dark/light), skeleton loaders, toast notifications — ✅
- Componente accesibile + focus trap — ✅

## 13. 🧪 Testare / Build / Dev

- Vitest (unit) + smoke tests (boot, diagnostics, storage) — ✅
- Playwright (E2E) — ✅
- Lighthouse CI, bundle analyzer, security scan (secrete) — ✅
- Pipeline electron-builder + publish release — ✅

---

## 14. 🗓️ Organizare (plan de studiu)
- Pagina `/rezidentiat/organizare` (`src/pages/Organizare.tsx`, componente în `src/components/organizare/`): treceri, săptămâni, ritm și ghid.
- Logica și datele: `src/lib/organizare/engine.ts` (cu teste), `src/data/organizare/plan.json`; progres pe profil în `src/store/organizareStore.ts` (intră în backup).
- Legături către capitole, flashcarduri și specialități prin `organizare/appLinks.ts`; cele 39 de capitole vin din `src/lib/curriculum.ts`.

## 15. 🧱 Sistem de design
- Teme și tokeni: `src/theme/` (`ThemeContext`, `motion.ts`, `zLayers.ts`) și `src/index.css` (scara de umbre `--elev-0…4`, `--edge`, raze, blur).
- Componente comune: `components/ui` (PageHeader, EmptyState, PageSkeleton…) și `components/fx` (SegmentedTabs, ProgressBar…); mișcare adaptivă prin `hooks/useAdaptiveMotion`.
- Stil: sticlă și umbre fine (`glass-panel`, `fine-chip`, `fx-lift`, `fx-rise`); `src/components/ui/**` e ignorat de ESLint (folosește `--no-ignore`).

## 16. 🆕 Adăugiri recente (ramura `claude/relaxed-hypatia-eo6uiz`; verificate doar în teste/cloud, nu în Electron)

| Funcție | Detalii | Locație |
|---|---|---|
| Caiet de erori (`/erori`) | Greșelile rămân într-un caiet de recapitulat | `src/pages/ErrorNotebook.tsx`, `src/lib/errorNotebook.ts` |
| Simulare de examen (`/simulare`) | 1,2 min/grilă, închidere automată la expirare, rezultat pe discipline | `src/pages/ExamSimulation.tsx`, `src/lib/examSimulation.ts` |
| Cititor PDF cu pagini randate | Pagina cărții randată din PDF; IPC `organizare:read-pdf` (`electron/organizare.cjs`, `preload.cjs`); deschidere prin evenimentul `studyx:open-book` ascultat de `BookViewerHost` | `src/components/pdf/` |
| Citări AI cu pagini | Citările `[n]` poartă pagina tipărită (`printedPage`) | `src/components/ai-chat/citations.ts` |
| Reordonare pe coloane | Textul PDF din două coloane e citit în ordinea corectă | `electron/pdfReadingOrder.mjs` |
| Foldere Flashcarduri cu scope | `Folder.scope='flashcards'`: nu apar în bara laterală/Grile; subfolderul moștenește scope-ul; foldere vechi migrate automat la încărcarea profilului (doar foldere cu decks și fără grile, în afara Rezidențiat; mixtele/golurile rămân neatinse) | `src/lib/folderScope.ts`, `src/hooks/useFlashcardFolderMigration.ts` |
| Flashcarduri pe capitole | Grupare pe fold, ordine cronologică, „Cap. 8” (Kumar) | `src/lib/chapterDecks.ts`, `src/lib/flashcardTreeView.ts` |
| Selectori pe store | `useXStore((s) => s.câmp)` în loc de store întreg | pagini și componente |
| QuizPlay împărțit | Pagina e împărțită în module | `src/pages/quiz-play/` |
| Bare sticky plutitoare | Bare de acțiuni lipicioase, plutitoare | pagini de listă/studiu |
| Tranziții cu Suspense persistent | Pagina veche rămâne vizibilă până e gata cea nouă | `src/App.tsx`, `src/components/app/RouteShell.tsx` |
| Fără layout de telefon | `MobileNav` și rezerva de spațiu jos eliminate; fereastra Electron are `minWidth: 720` | `src/App.tsx` |

## 🆘 Ajutor în aplicație

| Funcție | Detalii | Fișiere cheie |
|---|---|---|
| Film de bun venit | 7 scene animate, rulează înaintea turului la prima pornire; reluabil din Setări | `src/components/film/` |
| Tur de bun venit | 13 pași, un pas „fă tu” | `src/tutorial/tours/onboarding.tsx` |
| Ghiduri pe pagini | Panou, Grile, Creare, Flashcarduri, Biblioteca AI, Chat, Rezidențiat, Organizare, Simulare, Caiet de erori, Setări | `src/tutorial/tours/`, `GUIDE_LIST` în `tourMeta.ts` |
| Butoane „?” | Răspuns scurt sau „Ghid pas cu pas”, lângă titluri și controale | `src/components/ui/HelpTip.tsx`, `src/tutorial/helpTips.ts` |

## ⚠️ Incomplete / De atenție

1. **✅ Versiune aliniată** — `version.json` = `package.json` = `1.0.0`; auto-update-ul citește repo-ul `studyx-releases`. Providerii AI: Groq, Google Gemini și Mistral.

2. **Suprapunere organizare** — `KnowledgeVault` / `FolderView` / `Notes` au funcționalități parțial suprapuse. Nimic stricat, dar zonă de simplificat.

---

## 🧭 Rute aplicație (HashRouter)

| Rută | Pagină |
|---|---|
| `/` | Dashboard |
| `/quizzes` | Listă grile |
| `/quiz/:id` | Detalii grilă |
| `/folder/:id` | Folder |
| `/create` | Creare grilă |
| `/play/:id` | Joc grilă |
| `/results/:id` | Rezultate |
| `/stats` | Statistici |
| `/review` | Review mode |
| `/erori` | Caiet de erori |
| `/simulare` | Simulare de examen |
| `/daily-review` | Review zilnic |
| `/vault` | Knowledge Vault |
| `/flashcards` | Hub flashcarduri |
| `/flashcards/session/:id` | Sesiune flashcard |
| `/notes` | Notițe |
| `/settings` | Setări |
| `/gamification` | Gamification |
| `/analytics` | Perspective AI |
| `/aproape-examen` | Aproape de examen |
| `/rezidentiat` | Rezidențiat (și `/rezidentiat/organizare`, `/rezidentiat/flashcarduri`, `/rezidentiat/:folderId`) |
