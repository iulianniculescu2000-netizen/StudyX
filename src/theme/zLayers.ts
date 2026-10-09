/**
 * Referință pentru straturile z-index REALE din aplicație (inventar făcut prin
 * `z-[` / `zIndex` în src). Valorile din cod NU sunt înlocuite cu aceste
 * constante — ele documentează ordinea existentă, ca să alegi o valoare
 * coerentă când adaugi un strat nou.
 *
 * Reguli de folosire pentru cod nou:
 *  - conținut obișnuit (carduri, bare lipicioase, meniuri locale): `content`
 *  - modale de pagină: `modal` (+1 pentru panou); modal deasupra altui modal: `modalNested`
 *  - dialoguri de confirmare și lightbox-uri: peste tot ce e dedesubt (`confirm`, `imageViewer`)
 *  - tururile ghidate și „Ce e nou” rămân deasupra oricărui dialog
 */
export const Z_LAYERS = {
  /** Straturi locale în interiorul unui container (z-10 … z-50, zIndex 0–2): carduri, antete lipicioase, dropdown-uri inline, sidebar (50). */
  content: { min: 0, max: 50 },
  /** Tooltip-ul din sidebar (Tip). */
  sidebarTooltip: 600,
  /** Buton „înapoi sus” și bara de progres din QuizPlay (z-[100]); sertarul de chat din QuizDetail folosește 100/101. */
  scrollTop: 100,
  /** Modale obișnuite: fundal 200, panou 201 (AISettings, BackupExport, KeyboardShortcuts, BookChapterReader, flashcard-hub, quiz-create).  */
  modal: { backdrop: 200, panel: 201 },
  /** Modal deschis din alt modal (AISettings: sub-dialoguri). */
  modalNested: { backdrop: 210, panel: 211 },
  /** Dialogul de confirmare din Settings (fundal 1000, panou 1001). */
  settingsDialog: { backdrop: 1000, panel: 1001 },
  /** Meniu contextual din KnowledgeVault (fundal 9990, meniu 9991); ModalShell folosește aceleași valori, sub listele ThemedSelect (9998), ca să se vadă în dialog. */
  vaultMenu: { backdrop: 9990, panel: 9991 },
  /** Butonul flotant al asistentului AI (9998); fundalul ThemedSelect / PremiumSelect e tot 9998. */
  fab: { assistant: 9998 },
  /** Asistent AI: fundal 9996, panou 9999; meniurile lui interne 10001 (acoperire) / 10002 (meniu), vizualizări pe tot ecranul 10000. */
  assistant: { backdrop: 9996, panel: 9999, popoverCatcher: 10001, popover: 10002, fullscreen: 10000 },
  /** Straturi de sistem la 9999: toast-uri, controalele ferestrei, splash, dialogul de folder din Sidebar, panourile ThemedSelect/PremiumSelect, UpdateModal, ecranul de eroare RouteShell. */
  system: 9999,
  /** Dropzone-ul global de fișiere (10000). */
  dropzone: 10000,
  /** ConfirmDialog: fundal 10005, panou 10006 (AIGamificationAchievements folosește 10005). */
  confirm: { backdrop: 10005, panel: 10006 },
  /** Tur ghidat (TourEngine): suprapunere 10008, balon 10009. */
  tour: { overlay: 10008, bubble: 10009 },
  /** „Ce e nou” (WhatsNewTour). */
  whatsNew: 10010,
  /** Căutarea globală (Ctrl+K): peste orice modal și tur, sub vizualizatorul de imagine. */
  globalSearch: 10020,
  /** Vizualizator de imagine pe tot ecranul (QuizImage): fundal 19999, buton de închidere 20000 — plafonul aplicației. */
  imageViewer: { backdrop: 19999, close: 20000 },
  /** Valoarea maximă folosită în aplicație. */
  max: 20000,
} as const;
