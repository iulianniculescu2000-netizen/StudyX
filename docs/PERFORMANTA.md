# Performanța randării: unelte și reguli

Scopul: aplicația să arate și să se miște la fel, dar să consume cât mai puțin procesor și GPU, mai ales în repaus.

## Unelte

| Comandă / loc | Ce face |
|---|---|
| `npm run perf:measure` | Pornește un Vite propriu (port 5240, fără HMR, cache în `%TEMP%\studyx-ui-harness`), deschide aplicația într-un browser fără profil, creează profilul de test „Andreea” cu date semănate și măsoară pe fiecare ecran 5 s în repaus și 5 s cu derulare: ms de fir principal pe secundă, ms de GPU pe secundă, cadre/s, cadre lungi. La CPU 1× și 4× (laptop slab emulat). Scrie `previews/performanta/rezultate/<eticheta>.json` și `.md`. |
| `npm run perf:measure -- --screens=panou,grile --theme=dark --throttle=4 --label=test` | Aceeași măsurare, restrânsă. Alte opțiuni: `--seconds`, `--width`, `--height`, `--headed`, `--root=<alt checkout>` (de ex. un `git worktree` vechi, pentru „înainte”), `--port`. |
| `npm run ui:shoot` | Capturi reale ale tuturor ecranelor (Luminos + Întunecat, 1920 plus Panou la 1280 și 2560) în `previews/capturi-<data>/`, cu `_log.txt` (erori din consolă, scroll orizontal). Opțiuni: `--out`, `--themes`, `--wide`, `--motion`. |
| Ctrl+Shift+P (doar în `npm run dev` / `electron:dev`) | Panou de diagnostic: cadre/s, cadre lungi, sarcini lungi, interacțiuni > 100 ms, CLS, animații active și **buclele care trezesc firul principal**, plus numărul de `backdrop-filter`, `filter`, `will-change`. Ascuns, nu măsoară nimic. Nu există în build-ul de producție. |
| `__studyxPerf()` în consola de dezvoltare | Același instantaneu, ca tabel. |

Niciuna nu atinge profilul real (`%APPDATA%\StudyX`) și nu pornește Electron; `STUDYX_USER_DATA` e pus implicit pe un folder temporar. `BASE=http://localhost:PORT` folosește un server deja pornit.

## Helpere în cod

- `src/hooks/usePageVisible.ts`: `usePageVisible()`, adevărat cât fereastra nu e minimizată/ascunsă (o fereastră doar fără focus rămâne „vizibilă”).
- `src/hooks/useNow.ts`: `useNow(intervalMs, bucket?)`, ceasul unei componente care redesenează doar când se schimbă cheia (`hourBucket` = ziua + ora) și stă cât fereastra e ascunsă. Folosit de Panou și de bara laterală.
- `src/dev/perfProbe.ts`: măsurătorile din panoul de diagnostic (testate în `perfProbe.test.ts`).

## Reguli (verificate de `src/test/perfGuards.test.ts`)

- O buclă infinită costă puțin doar dacă animă `transform` / `opacity` pe un element HTML: rulează pe compozitor. O buclă pe interiorul unui SVG, pe `filter`, pe culori sau prin JS (framer cu `repeat: Infinity`) trezește firul principal la fiecare cadru, pe toată aplicația.
- Fără `transition: all`; fără `will-change` permanent nou; `backdrop-filter` are buget.
- Bucle framer noi: doar cu motiv, oprite sub `calmMotion`; de preferat CSS pe transform/opacitate.
- `setInterval` sub o secundă: mereu cu `clearInterval`.
- Testul are liste cu cazurile existente. Când reduci un caz, coboară bugetul; nu-l urca fără motiv scris în commit.
