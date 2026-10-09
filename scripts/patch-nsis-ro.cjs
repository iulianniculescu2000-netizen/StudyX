#!/usr/bin/env node
'use strict';
/**
 * Completează cu traduceri românești mesajele expertului de instalare pe care electron-builder nu le are în română
 * (pagina „Pentru cine se instalează”, dezinstalarea, cerințele de sistem). Fără ele, aceste texte apar în engleză.
 *
 * Idempotent: o cheie care are deja `ro:` rămâne neatinsă. Se rulează înaintea `electron-builder`
 * (e legat de `npm run electron:build` și descris în RELEASE.md). Modifică doar `node_modules`, nu proiectul.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATES = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'templates', 'nsis');

const RO = {
  'assistedMessages.yml': {
    chooseInstallationOptions: 'Alege opțiunile de instalare',
    chooseUninstallationOptions: 'Alege opțiunile de dezinstalare',
    whichInstallationShouldBeRemoved: 'Ce instalare vrei să elimini?',
    whoShouldThisApplicationBeInstalledFor: 'Pentru cine se instalează aplicația?',
    selectUserMode: 'Alege dacă aplicația este disponibilă tuturor utilizatorilor sau doar ție',
    whichInstallationRemove: 'Aplicația este instalată și pentru toți utilizatorii, și pentru un singur utilizator.\\nCe instalare vrei să elimini?',
    freshInstallForAll: 'Instalare nouă pentru toți utilizatorii (va cere contul de administrator)',
    freshInstallForCurrent: 'Instalare nouă doar pentru utilizatorul curent',
    onlyForMe: 'Doar pentru &mine',
    forAll: 'Oricine folosește acest calculator (toți &utilizatorii)',
    loginWithAdminAccount: 'Pentru a continua, trebuie să te autentifici cu un cont de administrator...',
    perUserInstallExists: 'Există deja o instalare pentru un singur utilizator.',
    perUserInstall: 'Există o instalare pentru un singur utilizator.',
    perMachineInstallExists: 'Există deja o instalare pentru toți utilizatorii.',
    perMachineInstall: 'Există o instalare pentru toți utilizatorii.',
    reinstallUpgrade: 'Se va reinstala sau actualiza.',
    uninstall: 'Se va dezinstala.',
  },
  'messages.yml': {
    win7Required: 'Este necesar Windows 7 sau mai nou',
    x64WinRequired: 'Este necesar Windows pe 64 de biți',
    installing: 'Se instalează, te rugăm să aștepți...',
    areYouSureToUninstall: 'Sigur vrei să dezinstalezi ${PRODUCT_NAME}?',
    appClosing: 'Se închide ${PRODUCT_NAME}...',
  },
};

let changed = 0;
for (const [file, entries] of Object.entries(RO)) {
  const full = path.join(TEMPLATES, file);
  if (!fs.existsSync(full)) {
    console.warn(`patch-nsis-ro: lipsește ${full} (electron-builder instalat?)`);
    continue;
  }
  const original = fs.readFileSync(full, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const out = [];
  let key = null;
  let hasRo = false;
  const flush = () => {
    if (key && !hasRo && entries[key]) {
      out.push(`  ro: ${entries[key]}`);
      changed += 1;
    }
  };
  for (const line of lines) {
    const top = line.match(/^([A-Za-z0-9_]+):\s*$/);
    if (top) {
      flush();
      key = top[1];
      hasRo = false;
    } else if (/^ {2}ro:/.test(line)) {
      hasRo = true;
    }
    // Liniile goale/comentariile de la sfârșitul unui bloc se păstrează după traducere.
    if (key && line.trim() === '' && !hasRo && entries[key]) {
      out.push(`  ro: ${entries[key]}`);
      hasRo = true;
      changed += 1;
    }
    out.push(line);
  }
  flush();
  const next = out.join(eol);
  if (next !== original) fs.writeFileSync(full, next, 'utf8');
}
console.log(changed > 0 ? `patch-nsis-ro: ${changed} traduceri adăugate` : 'patch-nsis-ro: nimic de făcut (deja aplicat)');
