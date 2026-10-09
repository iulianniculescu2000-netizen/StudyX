# Lansarea unei versiuni StudyX

Aplicația se actualizează din repo-ul **[studyx-releases](https://github.com/iulianniculescu2000-netizen/studyx-releases)**, separat de codul sursă. Linia de versiuni începe de la **1.0.0**.

## Ce citește aplicația

- `electron/updater.cjs` caută în `studyx-releases`: `version.json`, `manifests/<versiune>.json` și releaseul GitHub cu installerul.
- `package.json › build.publish` (owner/repo) indică același repo pentru `latest.yml` (updaterul nativ).
- Versiunea din aplicație vine din `package.json`; `version.json` din rădăcina proiectului trebuie să o repete.

## Pași pentru o versiune nouă

1. Ridică versiunea în `package.json`, `package-lock.json` (primele două apariții) și `version.json` (inclusiv `manifestUrl`). Trei segmente: electron-builder și updaterul nu acceptă patru.
2. Pune noutățile în „Ce e nou”: `CURRENT_TOUR_VERSION` și `RELEASE_DISPLAY_NAME` din `src/tutorial/tourMeta.ts`, apoi diapozitivele din `src/components/WhatsNewTour.tsx`. Tururile cu `repeatOnNewVersion: true` se reiau o dată pentru cine le-a văzut într-o versiune mai veche.
3. Verifică: `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src --quiet`, `npm run test:run`, `npm run security:scan`.
4. Construiește installerul (imaginile expertului se regenerează cu `python scripts/generate-installer-art.py`):

   ```bash
   node scripts/patch-nsis-ro.cjs    # completează în română mesajele expertului (idempotent)
   npm run build
   npx electron-builder --config.directories.output=C:/Users/<tu>/studyx-build-<versiune>
   ```

   Apoi copiază `StudyX-Setup-<versiune>.exe`, `latest.yml` și `.blockmap` în `release/` (ignorat de git). Un output în afara proiectului evită erorile `EPERM` din `release/`.
5. Publică (cere un token GitHub cu drept de scriere pe `studyx-releases`, în `GH_TOKEN`; nu îl salva în fișiere):

   ```bash
   node scripts/release-now.cjs "prima noutate || a doua noutate"
   ```

   Scriptul creează releaseul `v<versiune>`, urcă installerul, `latest.yml` și `.blockmap`, apoi scrie `version.json`, `manifests/<versiune>.json` și `version-history.json` în repo.
6. Comite și împinge codul în `StudyX`; pune eticheta `v<versiune>` pe același commit.

Nu lansa fără să verifici installerul pe un calculator curat: instalare, pornire, filmul de bun venit și actualizarea de la versiunea anterioară.
