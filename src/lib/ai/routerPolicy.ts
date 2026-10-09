/**
 * Euristică ieftină (0 tokeni): întrebarea este despre CUM se folosește aplicația
 * („unde găsesc butonul de reindexare?”), nu despre medicină. Pe ea nu are sens să se caute
 * în cărțile studentului: regăsirea ar aduce fragmente medicale irelevante și le-ar cita.
 */

const APP_QUESTION_RES: RegExp[] = [
  /\b(?:buton\w*|meniu\w*|optiune\w*|setari\w*|setare|ecran\w*|pagina de|bara laterala)\b/,
  /\b(?:reindex\w*|sincronizar\w*|sincronizez)\b/,
  /\bcum (?:folosesc|adaug|import|salvez|mut|sterg|creez|pornesc|opresc|activez|dezactivez) (?:o |un |de |)(?:carte|carti|folder|set|pachet|cheie|cheia|aplicatia|profil\w*|grile|grilele|flashcard\w*)\b/,
  /\b(?:in|din) (?:studyx|aplicatie|aplicatia)\b/,
  // Mecanica furnizorilor AI: limite, chei, trecerea automată pe alt furnizor.
  /\b(?:tokeni|tokens?|fallback|cota (?:zilnica|gratuita|de utilizare)|limita (?:de utilizare|zilnica|gratuita))\b/,
  /\b(?:chei? api|cheia api|furnizorul ai|provider(?:ul)? ai|alt furnizor|alt provider|alt model ai)\b/,
  /\bunde (?:gasesc|e|este|se afla|vad|apare|merg)\b[^?]{0,40}\b(?:butonul|optiunea|meniul|setarea|pagina|folderul|cartile|cheia)\b/,
];

export function isAppQuestion(message: string): boolean {
  const norm = (message ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm || norm.length > 220) return false;
  return APP_QUESTION_RES.some((re) => re.test(norm));
}
