; ============================================================
;  StudyX - script NSIS personalizat pentru expertul de instalare
;  Inclus prin nsis.include din package.json (electron-builder).
;  Fisierul e salvat UTF-8 cu BOM: NSIS (Unicode) citeste corect diacriticele.
; ============================================================

; ── Pagina de bun venit ──────────────────────────────────────
!define MUI_WELCOMEPAGE_TITLE "Bun venit la instalarea StudyX"
!define MUI_WELCOMEPAGE_TEXT "Acest expert instalează StudyX 1.0 pe calculatorul tău.$\r$\n$\r$\nStudyX strânge într-un singur loc grilele, flashcardurile, biblioteca AI și planul tău pentru rezidențiat.$\r$\n$\r$\nÎnchide celelalte ferestre StudyX, apoi apasă Înainte."

; ── Pagina de final ──────────────────────────────────────────
!define MUI_FINISHPAGE_TITLE "StudyX este instalat"
!define MUI_FINISHPAGE_TEXT "Totul e gata.$\r$\n$\r$\nLa prima pornire vei vedea un scurt film de bun venit și un tur al aplicației. Datele tale rămân pe acest calculator, iar la dezinstalare sunt păstrate."
!define MUI_FINISHPAGE_RUN_TEXT "Pornește StudyX acum"
!define MUI_FINISHPAGE_LINK "Pagina proiectului StudyX"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/iulianniculescu2000-netizen/StudyX"

; Pagina de bun venit apare în expertul de instalare (electron-builder nu o adaugă singur).
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  BrandingText "StudyX 1.0  |  Învață. Repetă. Reușește."
!macroend

; ── Dupa instalare ───────────────────────────────────────────
!macro customInstall
  ; Nimic in plus: electron-builder creeaza scurtaturile, intrarile din registru si dezinstalatorul.
!macroend

; ── Dupa dezinstalare ────────────────────────────────────────
!macro customUnInstall
  ; Datele utilizatorului se pastreaza intentionat (profiluri, progres, biblioteca AI, backup-uri),
  ; ca sa supravietuiasca dezinstalarii si reinstalarii.
!macroend
