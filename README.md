# StudyX

Aplicație desktop pentru studenții la medicină: grile, flashcarduri cu repetare spațiată, o bibliotecă AI care citește cursurile tale și un plan de pregătire pentru rezidențiat. Construită cu React, TypeScript, Vite și Electron.

**Versiunea curentă: 1.0.** Installerul pentru Windows și notele fiecărei versiuni sunt în [StudyX-releases](https://github.com/iulianniculescu2000-netizen/studyx-releases/releases).

## Ce poți face

- **Grile**: le creezi, le imporți (.json) sau le generezi cu AI; moduri Studiu, Simulare Examen și Cronometrat, „Mod Rezidențiat” cu penalizare ca la examen.
- **Flashcarduri**: repetare spațiată (Greu, Bine, Ușor), foldere proprii, import CSV și Anki, generare din cursuri.
- **Recapitulare**: sesiune zilnică, puncte slabe, Caiet de erori, Simulare de examen, Examen adaptiv și „Aproape de examen”.
- **Biblioteca AI**: încarci PDF, DOCX, text sau poze (cu OCR); AI-ul răspunde din ele, cu citări la pagină și „Deschide în carte”.
- **Chat și agent AI**: ceri în română grile, carduri, scheme interactive; agentul arată fiecare pas și îl poți opri.
- **Rezidențiat**: discipline și specialități, foldere proprii, **Organizare** (patru treceri prin materie, săptămâni, ritm zilnic).
- **Statistici, realizări și perspective**: acuratețe, serie de zile, prognoză de scor calculată din răspunsurile tale.
- **Ajutor în aplicație**: film de bun venit, tur de bun venit, ghiduri pe pagini și butoane „?” cu răspunsuri scurte.
- **Datele rămân la tine**: profiluri locale, backup din Setări, actualizări doar cu acordul tău.

## Instalare (Windows)

Descarcă `StudyX-Setup-<versiune>.exe` din [releases](https://github.com/iulianniculescu2000-netizen/studyx-releases/releases) și rulează-l. Expertul de instalare e în română; datele tale se păstrează la dezinstalare.

## Dezvoltare

Cerințe: Node.js ≥ 22.13.

```bash
npm install
npm run dev              # aplicația în browser (Vite)
npm run electron:dev     # aplicația desktop
```

`electron:dev` folosește datele reale din `%APPDATA%\StudyX`. Pentru teste izolate setează `STUDYX_USER_DATA` la un director temporar.

## Verificări

```bash
npm run security:scan    # caută chei/token-uri în fișiere
npx tsc -p tsconfig.app.json --noEmit
npx eslint src --quiet
npm run test:run         # Vitest
npm run build            # TypeScript + Vite
npm run verify:all       # toate cele de mai sus și verificări de runtime
```

## Configurare AI

Cheile API nu se comit în repository. Le salvezi din aplicație (Setări › Inteligență artificială; există și un ghid pentru chei gratuite) sau le ții în fișiere ignorate de Git, precum `.env.local`. Furnizori suportați: Groq, Google Gemini și Mistral, cu rezervă automată între ei când ai mai multe chei.

Dacă o cheie ajunge într-un fișier al proiectului, rulează `npm run security:scan` și rotește cheia din panoul furnizorului.

## Build și lansare

```bash
npm run electron:build   # installerul Windows (NSIS) în release/
```

Pașii pentru o versiune nouă sunt în [RELEASE.md](RELEASE.md).

## Licență

Vezi [LICENSE.txt](LICENSE.txt).
