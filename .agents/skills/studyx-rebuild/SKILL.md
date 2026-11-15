---
name: studyx-rebuild
description: Pașii pentru rebuild-ul final al lui StudyX 1.0.0 (installer, release guard, teste pe calculator curat), cu regulile de publicare. Folosește-l doar când proprietarul cere rebuild; nu publică nimic singur.
---

# Rebuild 1.0.0

**Regula de aur:** nu publica, nu da push, nu pune tag fără acordul explicit al proprietarului. Versiunea rămâne 1.0.0; nu atinge `CURRENT_TOUR_VERSION`.

1. `git status --short` curat (ce nu e al nostru, ca `src/lib/searchIndex.ts` sau `.agents/`, nu se adaugă fără să afli ce e). Rulează tot din skill-ul `studyx-verify`.
2. Oprește `electron:dev` dacă rulează (altfel `EBUSY`).
3. `npm run electron:build -- --config.directories.output=C:/Users/Iulia/studyx-build-1.0.0` (în `release/` pică cu `EPERM`).
4. `npm run release:guard` (versiuni coerente, `latest.yml` cu hash, secrete).
5. Test pe un calculator curat sau profil izolat: pornire, cărțile de bază se pregătesc singure (~15 s), Rezidențiat, Biblioteca AI, test de actualizare. Nu instala installerul pe calculatorul de lucru (același `appId` îl înlocuiește pe cel real).
6. Spune-i proprietarului: republicarea aceluiași număr de versiune NU actualizează automat instalările existente de 1.0.0.
7. Publicarea (repo-ul `studyx-releases`) doar după „da” explicit, cu un singur pas confirmat odată.
