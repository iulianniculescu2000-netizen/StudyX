# Mentenanță StudyX

Rețeta pentru o rundă de „pus la zi", în ordinea care a funcționat. Se poate repeta la 1–2 luni sau înaintea fiecărei lansări.
Se lucrează pe o ramură separată (`chore/maintenance-AAAA-LL`) și se face commit după fiecare etapă, ca orice pas să poată fi anulat fără să se piardă restul.

## 0. Înainte de a începe
- Închide aplicația desktop de dezvoltare (`npm run electron:dev`): ține blocat `node_modules/electron` și `npm` pică cu `EBUSY`.
- Pornește de pe un arbore curat: `git status`.
- Notează punctul de plecare: `npm run verify:all` trebuie să treacă.

## 1. Inventar
```bash
npm outdated          # ce e în urmă (Wanted = în intervalul din package.json, Latest = ultima versiune)
npm audit             # toate vulnerabilitățile
npm audit --omit=dev  # doar ce ajunge în aplicația livrată — asta contează cel mai mult
```

## 2. Actualizări sigure (în intervalele declarate)
```bash
npm install && npm update && npm audit fix    # NU folosi --force (nici `npm audit fix --force`: face downgrade la `mammoth`)
npm run lint && npx tsc -p tsconfig.app.json --noEmit && npm run test:run && npm run build
```
- `allowScripts` din `package.json` fixează **versiuni exacte** (`electron@x.y.z`, `core-js@x.y.z`…). După un update trebuie aliniate, altfel scriptul care descarcă executabilul Electron nu mai rulează.

## 3. Actualizări majore — câte una, separat, cu testare
| Pachet | De verificat |
|---|---|
| `electron` | Suport: doar ultimele 3 majore primesc patch-uri de securitate. Pornește `npm run electron:dev`, citește jurnalul, verifică importul de PDF. |
| `pdfjs-dist` | Testează pe un PDF real (importul din aplicație folosește `electron/pdf-worker.cjs`). API-ul se schimbă între majore (în v6: `loadingTask.destroy()`, nu `pdf.destroy()`). |
| `vitest`, `jsdom`, `jest-dom`, `concurrently` | Doar unelte de dezvoltare; verifică `npm run test:run`. |
| `lucide-react`, `framer-motion` | Verifică vizual Dashboard, Setări, Grile și animațiile. |
| `eslint` | (stare 2026-10-08: `eslint-plugin-react-hooks` 7.0.1) Vine împreună cu `eslint-plugin-react-hooks` ≥ 7.1, care adaugă reguli noi (compilator React). Amână până e timp de curățat. |
| `typescript` 7, `tesseract.js` 7 | Amânate: compilator nativ nou / OCR; testează separat. |

Dacă o actualizare strică ceva și nu se rezolvă în 15 minute: `git checkout -- package.json package-lock.json && npm install`.

## 4. Modelele AI
Furnizorii își schimbă modelele fără preaviz. Sursele de adevăr:
- Groq: <https://console.groq.com/docs/models> și `/docs/deprecations`
- Google: <https://ai.google.dev/gemini-api/docs/models> și `/docs/deprecations`
- Mistral: <https://docs.mistral.ai/getting-started/models/models_overview/>

Se actualizează în 4 locuri (menține-le identice):
1. `src/store/aiStore.ts` — tipul `AIModel`, `PROVIDER_MODELS`, modelul implicit per furnizor.
2. `src/lib/ai/modelHealing.ts` — `MODEL_CANDIDATES` (ordinea de rezervă la eroare „model dispărut").
3. `src/components/AISettings.tsx` — lista afișată utilizatorului.
4. `src/lib/groq.ts` — `FALLBACK_MODEL` și modelul de test al cheii.

Modelele scoase rămân în tipul `AIModel` (ca starea salvată veche să se migreze singură), dar dispar din liste. Verificarea automată zilnică (`modelHealing`) acoperă între timp modelele retrase.

## 5. Verificare finală
```bash
npm run verify:all      # secrete, lint, build, teste, runtime
npm audit --omit=dev    # ținta: 0
npm run electron:dev    # probă manuală pe desktop
```

## 6. Note
- Versiunea de Node cerută: ≥ 22.13 (vezi `engines`). Fluxurile GitHub folosesc Node 22/24.
- `.github/workflows/ci-cd.yml` apelează scripturi inexistente (`test:coverage`, `test:integration`, `test:e2e`) — de reparat separat.
- Vulnerabilitățile rămase în `@capacitor/cli` (xcode → uuid) afectează doar build-ul pentru iOS, pe care proiectul nu îl folosește.
- Starea la 2026-10-08: ținta lansării este v2.3.1 (`package.json` are încă 2.3.0; 2.3.1 nu a fost lansată încă). Fără lansare fără acordul utilizatorului. Dependențe actuale: electron 44.7.0, vite 8.3.3, vitest 5.0.3, jsdom 30.1.2.
- ESLint acoperă tot `src/`; verdictul: `npx eslint src --quiet`. Tipuri: `npx tsc -p tsconfig.app.json --noEmit`.
