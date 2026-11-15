---
name: studyx-depth-3d
description: Cum adaugi adâncime 3D în StudyX (tururi, „?”, micro-demo-uri, „Ce e nou”, carduri, butoane, ferestre) fără să strici clicurile, testele sau viteza. Folosește-l când pui înclinare, perspectivă, plăci de sticlă sau scene 3D pe o componentă.
---

# Adâncime 3D în StudyX

Stilul aprobat de proprietar pe 19 oct 2026: discret, în stil Apple, fără nimic care se mișcă singur la nesfârșit. Previzualizează schimbările mari înainte (pagină HTML publicată ca artifact).

## Piese gata făcute (refolosește-le, nu le rescrie)
- `src/components/depth/useTilt.ts`: `useTilt({ calm, isDark, maxX, maxY })` dă `rotateX`/`rotateY` (resort `spring.panel`) și `light` (pata de lumină), plus `onPointerMove`/`onPointerLeave`. Nu se înclină cât se scrie într-un câmp. Tot aici: `pointerTilt`, `sway` (legănare din ceasul filmului), `sheenColor`.
- `src/components/depth/GlassIconStack.tsx`: iconiță pe trei plăci de sticlă (decor, `aria-hidden`).
- `src/components/depth/TourHeroScene.tsx`: scena de la primul și ultimul pas al unui tur, generată din iconițele pașilor; un singur `usePlayback`, fără buclă.
- `src/components/whats-new/`: scenele „Ce e nou” 1.1 (`WhatsNewStage`, `scenes.tsx`, `release11.ts`). Ediția 1.1 apare doar când `RELEASE_DISPLAY_NAME` = „1.1”.
- CSS în `src/index.css`, blocul „Adâncime 3D (polish)”: `.fx-lift`/`.depth-card` se înclină sub mouse (variabilele `--tilt-x`/`--tilt-y` vin din `useFxSpotlight`, un singur ascultător pe pagină, un cadru pe mișcare), `.depth-book` (copertă în perspectivă), butoanele pline `press-feedback text-white` au volum, `.premium-modal` se ridică la deschidere.

## Reguli
- Mișcarea vine din ceasul filmului (`usePlayback`, `FilmTime`) sau din interacțiune (hover, mouse, apăsare). Fără cronometre proprii, fără `@keyframes` infinite în afara blocului „lite”.
- Mișcare redusă / lite / economisire: cadrul final, fix și drept. Orice clasă nouă cu transformare intră și în blocul „Mișcare redusă: lite” și în `@media (prefers-reduced-motion)`.
- Umbre doar prin `var(--elev-N)` (sau `--glow`/`--ring`), raze din {10,14,20,28}, resorturi doar din `spring.*` (testele `designTokens`/`motionTokens` numără).
- Scenele sunt `inert` + `aria-hidden`, iar povestea e în text (`transcript`, `sr-only`).
- Unghiuri mici: carduri cu text cel mult 3°, scene 6°. Textul pe straturi 3D se vede puțin mai moale; nu înclina formulare.

## Capcane găsite (19 oct 2026)
1. **`preserve-3d` mănâncă clicurile.** Un strat-părinte cu `transform-style: preserve-3d` și un copil înclinat: partea copilului care trece în spatele planului părintelui nu mai primește clicul (Enter merge, clicul nu). Pune `pointer-events: none` pe stratul-părinte și `auto` pe cel vizibil (vezi `TourEngine.tsx`). Verifică cu `document.elementFromPoint` pe butoane, cu mouse-ul mișcat înainte.
2. **`custom` nedefinit în variantele framer.** La ieșirea părintelui, variantele-funcție pot primi `custom` nedefinit: `dir * 70` devine NaN, resortul nu se oprește și stratul transparent rămâne peste aplicație. Normalizează: `const dir = custom === -1 ? -1 : 1`.
3. **Resort + `AnimatePresence mode="wait"` = lent.** Pentru schimbări de slide sau pas folosește `t.modal` (intrare) și `t.modalExit` (ieșire), nu `spring.panel`.
4. **Teste cu framer și timere false:** după `cleanup()`, `vi.advanceTimersByTime(500)` înainte de `vi.useRealTimers()`, altfel bucla de cadre rămâne agățată și testul următor nu mai animă.
5. **Panoul de previzualizare nu desenează cadre** cât nu ceri o captură: animațiile și ieșirile par blocate. Fă capturi între pași înainte să tragi concluzia că ceva e agățat.
6. **Fișiere CRLF:** patch-urile Python citesc cu `newline=''`, normalizează la `\n` și scriu înapoi CRLF; `assert` pe fiecare înlocuire.
7. **Hook nou în componentă montată:** în aplicația deschisă a proprietarului, HMR poate da „order of Hooks”; spune-i să reîncarce (Ctrl+R).

## Verificare
`npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src --quiet`, `npx vitest run` (inclusiv `src/components/depth/depth.test.tsx`, `src/hooks/useFxSpotlight.test.tsx`, `src/components/whats-new/WhatsNew11.test.tsx`), apoi live pe portul de test (nu 5173): clic real pe butoanele cardului, axe în ambele teme.
