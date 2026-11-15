---
name: studyx-chat-live-test
description: Cum testezi pe viu chatul AI și căutarea în cărți din StudyX (Electron izolat + CDP), cum măsori ce pagini ajung la model și capcanele căutării cu vectori locali. Folosește-l când verifici fidelitatea față de cărți, citările, „Deschide în carte” sau schimbi `src/ai/retriever.ts`.
---

# Test live al chatului

## Pornire (fără să atingi datele reale și portul 5173)
- Vite de test pe 5199 (`.Codex/launch.json` › `studyx-web-test`).
- Electron izolat, din PowerShell:
  `$env:STUDYX_USER_DATA = Join-Path $env:TEMP 'studyx-chat-test'; $env:STUDYX_DEV_URL='http://localhost:5199'; $env:NODE_ENV='development'; Start-Process .\node_modules\.bin\electron.cmd -ArgumentList '.','--remote-debugging-port=9333'`
- Profilul `studyx-chat-test` are deja cheia Groq pusă de proprietar. Nu introduce chei, nu citi `ai.json`.
- Driver: `chromium.connectOverCDP('http://127.0.0.1:9333')` din `@playwright/test`, pagina cu `5199` în URL.

## Trimiterea unui mesaj
- Caseta: `getByLabel('Mesaj pentru AI')`; chatul se deschide cu `getByLabel('Deschide chatul AI')`.
- Nu apăsa Escape (închide chatul, caseta se re-montează și clicul „nu e stabil”). Așteaptă ~1 s, `focus()`, apoi `press('Enter')`.
- Gata când `getByLabel('Oprește generarea')` dispare.
- Răspunsul brut + citările: `localStorage['studyx:chat:messages:v2:rezidentiat']`, ultimul mesaj (`content`, `citations[].page/heading/excerpt`).
- Groq gratuit dă „limita de utilizare … în N secunde” după ~4 întrebări la rând: așteaptă, nu e bug.

## Ce pagini ajung la model (fără AI)
În pagină: `await import('/src/ai/retriever.ts?t='+Date.now())` și `retrieveRelevantChunks(q, null, 8, { rezidentiat: true })`, apoi `filterRelevantChunks(diversifyChunks(r, 5))` din `src/components/ai-chat/` (exact calea chatului). Pragul cărților e 0,3.
Textul de referință al cărților: `src/data/rezidentiat/library/kumar.pages.json` (index 0 = pagina 1; fragmentele indexate au `page` = index + 1).

## Capcane învățate (19 oct 2026)
- Vectorul local (`embedTextLocal`, 256) e un hash de cuvinte fără IDF, cu „tratament/diagnostic” ponderate ×2,5: nu e semantic. De aceea ponderea lui e plafonată (`LOCAL_SEMANTIC_WEIGHT`).
- Cuvintele generale ale întrebării („clinic”, „tratament”) sunt în aproape toate fragmentele; normalizarea BM25 le cântărește după IDF (`MIN_TERM_IDF_SHARE`).
- O regulă „fragmentul trebuie să conțină un termen rar” pare bună, dar taie „insuficiență cardiacă” (termen frecvent în carte) și „poliartrita” (cartea scrie „artrita reumatoidă”). Respinsă.
- Căutare bună ≠ răspuns fidel: cu paginile corecte, gpt-oss tot poate adăuga detalii din afara cărții sau inventa când cartea nu are răspunsul (CASPAR). Verifică răspunsul cu textul paginii.
- Regresie: `src/ai/retrieverLongQuery.test.ts` rulează întrebări reale pe tot textul Kumar.
