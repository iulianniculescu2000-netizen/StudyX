'use strict';

/** Mesaje în română pentru erorile tehnice (rețea, antivirus, disc) afișate utilizatorului. */
function friendlyUpdateError(err, fallback = 'Actualizarea nu a putut fi descărcată. Încearcă din nou.') {
  const raw = String(err?.code || '') + ' ' + String(err?.message || err || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|ERR_INTERNET|ERR_NETWORK|net::|expirat|Eroare de rețea/i.test(raw)) {
    return 'Nu s-a putut contacta serverul de actualizări. Verifică conexiunea la internet și încearcă din nou.';
  }
  if (/EPERM|EACCES|EBUSY/i.test(raw)) {
    return 'Windows sau antivirusul a blocat fișierul de actualizare. Încearcă din nou sau adaugă StudyX în excepțiile antivirusului.';
  }
  if (/ENOSPC/i.test(raw)) return 'Nu este suficient spațiu pe disc pentru actualizare.';
  if (/404|Cannot find latest|HttpError: 404/i.test(raw)) {
    return 'Versiunea nouă nu este încă disponibilă pentru descărcare. Încearcă din nou mai târziu.';
  }
  if (/sha512|sha256|checksum|integritate/i.test(raw)) {
    return 'Fișierul descărcat este corupt (verificarea de integritate a eșuat). Încearcă din nou.';
  }
  // Mesajele deja scrise în română de acest modul sunt păstrate.
  if (err instanceof Error && /[ăâîșțĂÂÎȘȚ]|Serverul|Descărcarea|Fișier|Manifest/.test(err.message)) return err.message;
  return fallback;
}

module.exports = { friendlyUpdateError };
