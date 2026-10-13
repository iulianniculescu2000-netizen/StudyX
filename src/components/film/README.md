# Welcome film

Seven lazy scenes share `usePlayback` and `FilmTime`. Scene visuals only project
elapsed time into styles/content; do not add independent timers, CSS transitions,
Framer Motion animations, or animated child components here. Calm motion renders
the complete static composition. Lazy loading and hidden tabs suspend the clock.
React publishes at approximately 30 fps, or 10 fps in calm mode. Pause and seeks
publish immediately; the underlying monotonic clock retains full precision.

The default caption-only story is 60 seconds. Optional local
`public/audio/intro/manifest.json` is an array of `{ id, text, durationMs }` records.
Measured duration plus 150 ms determines each scene's reading/audio time. The last
scene stays until dismissed. Missing metadata falls back to the default story.
Metadata loading has a 1.5-second fallback and is aborted on close.
Optional manifest metadata is also bundled as text for Electron's file protocol;
the recordings stay separate public assets. A successful runtime fetch refreshes
that metadata, while failed/empty fetches preserve the bundled timings.

Author-owned `narration.json` is optional and bundled when present. It accepts the
same array, `{ scenes: [...] }`, or records keyed by scene id. Its text overrides
manifest text; timing uses the larger scripted/measured duration plus 150 ms.
Do not commit/generated-edit this file or audio assets as part of film code work.

Audio is off for every new film session. The voice comes entirely from local
`public/audio/intro/<id>.mp3` recordings (intro, quiz, cards, ai, plan, exam,
finish); there is no speech synthesis or external audio service. Playback follows
scene elapsed time, including pauses, seeks, replay, and visibility. Missing files
or blocked playback leave captions available.

Keyboard: arrows move scenes, 1–7 selects a scene, Space toggles playback and R
replays outside interactive controls. Escape delegates to the existing focus trap.
Buttons retain their native keyboard activation. Selecting a scene preserves a
manual pause; replay starts from zero. Closing/skipping records welcomeFilm seen
per profile and defers the onboarding handoff so Escape affects one dialog only.

Browser assertions: the dialog exposes `data-film-scene`, `data-film-elapsed-ms`,
`data-film-scene-elapsed-ms`, and `data-film-playing`. `role=progressbar` with label
`Progres film` reports milliseconds (min 0, max total duration, now elapsed).
For audio sync, compare audio.currentTime * 1000 with scene elapsed time; drift is
corrected at 250 ms. Check mid-flip/reveal styles remain unchanged while paused.

Focused checks: `npx vitest run src/components/film --maxWorkers=2 --pool=threads` and
`npx eslint src/components/film`.
# Rafinare cinematică

Intro-ul păstrează cele șapte scene, narațiunea și comenzile existente. Fundalul comun folosește un gradient albastru și orbite SVG statice; nu adaugă cronometre sau animații independente. Cardurile folosesc aceeași paletă, iar intrările au o curbă cubică derivată din ceasul scenei, astfel încât pauza rămâne sincronizată. Prima scenă prezintă cursul și următorii pași de studiu. Previzualizarea separată se află în `previews/intro-cinematic/`.

