/**
 * Abrevieri medicale românești frecvente și echivalențele lor, pentru expandarea interogărilor
 * din Biblioteca AI. Lista este MICĂ și verificabilă pe intenție: doar abrevieri fără ambiguitate
 * evidentă în cardiologie/medicină internă (de aceea lipsesc, de pildă, FA, IRA sau VS, care au
 * două sensuri uzuale). Expandarea e bidirecțională: „IC" aduce și „insuficiență cardiacă", iar
 * „insuficiență cardiacă" aduce și „IC".
 *
 * Fără diacritice în date: potrivirea se face pe text normalizat (vezi `normalizeSearchText`).
 */
// Import circular cu searchText.ts (care citește KNOWN_ABBREVIATION_KEYS): sigur, ambele se folosesc doar în funcții.
import { stemRo } from './searchText';

export interface MedicalAbbreviation {
  /** Forma scrisă în majuscule, ca în cărți (ex. "IC"). */
  abbr: string;
  /** Forma completă canonică, fără diacritice. */
  full: string;
  /** Alte formulări ale aceluiași concept (fără diacritice). */
  aliases?: string[];
}

export const MEDICAL_ABBREVIATIONS: readonly MedicalAbbreviation[] = [
  { abbr: 'IC', full: 'insuficienta cardiaca' },
  { abbr: 'ICC', full: 'insuficienta cardiaca congestiva' },
  { abbr: 'HTA', full: 'hipertensiune arteriala' },
  { abbr: 'TA', full: 'tensiune arteriala' },
  { abbr: 'IMA', full: 'infarct miocardic acut', aliases: ['infarct miocardic'] },
  { abbr: 'SCA', full: 'sindrom coronarian acut' },
  { abbr: 'DZ', full: 'diabet zaharat' },
  { abbr: 'BPOC', full: 'bronhopneumopatie obstructiva cronica' },
  { abbr: 'AVC', full: 'accident vascular cerebral', aliases: ['stroke', 'ictus'] },
  { abbr: 'TEP', full: 'tromboembolism pulmonar' },
  { abbr: 'TVP', full: 'tromboza venoasa profunda' },
  { abbr: 'IRC', full: 'insuficienta renala cronica' },
  { abbr: 'ECG', full: 'electrocardiograma', aliases: ['ekg'] },
  { abbr: 'HDS', full: 'hemoragie digestiva superioara' },
  { abbr: 'UGD', full: 'ulcer gastro-duodenal' },
  { abbr: 'BRGE', full: 'boala de reflux gastroesofagian' },
  { abbr: 'CHC', full: 'carcinom hepatocelular' },
  { abbr: 'LES', full: 'lupus eritematos sistemic' },
  { abbr: 'PAR', full: 'poliartrita reumatoida', aliases: ['artrita reumatoida'] },
  { abbr: 'TBC', full: 'tuberculoza' },
  { abbr: 'AINS', full: 'antiinflamatoare nesteroidiene' },
  { abbr: 'IECA', full: 'inhibitori ai enzimei de conversie a angiotensinei' },
  { abbr: 'CIVD', full: 'coagulare intravasculara diseminata' },
  { abbr: 'SDRA', full: 'sindrom de detresa respiratorie acuta' },
  { abbr: 'ITU', full: 'infectie de tract urinar', aliases: ['infectie urinara'] },
  { abbr: 'FEVS', full: 'fractia de ejectie a ventriculului stang' },
  { abbr: 'HVS', full: 'hipertrofie ventriculara stanga' },
  { abbr: 'BAV', full: 'bloc atrioventricular' },
];

/** Alte perechi de sinonime certe (fără abreviere), ca grupuri de formulări echivalente. */
export const MEDICAL_SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['fibrilatie atriala', 'fibrilatie auriculara'],
  ['insuficienta cardiaca', 'decompensare cardiaca'],
  ['hipertensiune arteriala', 'tensiune arteriala crescuta'],
  // Kumar scrie „deficit de fier”, studentul întreabă de „anemia feriprivă”: fără grup, căutarea nu găsea pagina de tratament.
  ['anemie feripriva', 'anemie sideropenica', 'anemie prin deficit de fier', 'deficit de fier'],
  // Kumar scrie „acalazia”, Lawrence „achalazia”: fără grup, întrebarea „acalazia” rata capitolul din Lawrence.
  ['acalazie', 'achalazie'],
  // „Tratament de fond” în reumatologie = DMARD (remisive), cum scrie Kumar la artrita reumatoidă.
  ['tratament de fond', 'dmard', 'antireumatice modificatoare de boala', 'remisive'],
  // „Managementul X” în întrebare, „Tratament” / „Gestionarea” ca titlu în carte.
  ['management', 'tratament', 'gestionare', 'conduita terapeutica'],
];

/** Text de căutare: litere mici, fără diacritice (inclusiv ș/ț cu virgulă sau cu sedilă), spații normalizate. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ABBR_BY_KEY = new Map(MEDICAL_ABBREVIATIONS.map((entry) => [entry.abbr.toLowerCase(), entry]));

/** Chei (litere mici) ale abrevierilor cunoscute — folosite de tokenizer ca să păstreze „IC", „DZ", „TA". */
export const KNOWN_ABBREVIATION_KEYS: ReadonlySet<string> = new Set(ABBR_BY_KEY.keys());

export interface QueryExpansion {
  /** Fraze suplimentare (fără diacritice) de căutat alături de interogarea originală. */
  phrases: string[];
  /** Abrevierile găsite în interogare sau implicate de formulările complete din ea. */
  matched: { abbr: string; full: string }[];
}

/**
 * Abrevierile de 2 litere (IC, DZ, TA) se recunosc DOAR scrise cu majuscule în interogare: în
 * minuscule ar putea fi cuvinte obișnuite. Cele de 3+ litere se recunosc în orice caz.
 */
function queryAbbreviations(query: string): MedicalAbbreviation[] {
  const found: MedicalAbbreviation[] = [];
  const rawTokens = query.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const raw of rawTokens) {
    const entry = ABBR_BY_KEY.get(raw.toLowerCase());
    if (!entry) continue;
    if (raw.length <= 2 && raw !== raw.toUpperCase()) continue;
    if (!found.includes(entry)) found.push(entry);
  }
  return found;
}

/** Fraza normalizată cu fiecare cuvânt redus la rădăcină (aceeași stemare ca la căutare). */
function stemPhrase(normalized: string): string {
  return normalized.split(' ').filter(Boolean).map(stemRo).join(' ');
}

/** Expandează o interogare cu forma completă a abrevierilor și cu abrevierea formelor complete. */
export function expandMedicalQuery(query: string): QueryExpansion {
  const phrases: string[] = [];
  const matched: { abbr: string; full: string }[] = [];
  const push = (phrase: string) => {
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  };

  for (const entry of queryAbbreviations(query)) {
    matched.push({ abbr: entry.abbr, full: entry.full });
    push(entry.full);
    entry.aliases?.forEach(push);
  }

  const normalized = ` ${normalizeSearchText(query).replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ')} `;
  for (const entry of MEDICAL_ABBREVIATIONS) {
    const forms = [entry.full, ...(entry.aliases ?? [])];
    if (!forms.some((form) => normalized.includes(` ${form} `))) continue;
    // „insuficienta cardiaca" nu trebuie să se potrivească și pe „insuficienta cardiaca congestiva"
    // ca IC: fraza trebuie să apară cuvânt întreg (spațiile de mai sus), deci ICC rămâne separat.
    if (!matched.some((m) => m.abbr === entry.abbr)) matched.push({ abbr: entry.abbr, full: entry.full });
    push(entry.abbr.toLowerCase());
    // Și celelalte formulări: „poliartrita reumatoidă” aduce „artrita reumatoidă” (cum scrie Kumar), nu doar „PAR”.
    forms.filter((form) => !normalized.includes(` ${form} `)).forEach(push);
  }

  // Grupurile se potrivesc și pe forme flexionate („anemiei feriprive” = „anemie feripriva”): se compară rădăcinile.
  const stemmed = ` ${stemPhrase(normalized)} `;
  for (const group of MEDICAL_SYNONYM_GROUPS) {
    const hit = group.find((form) => normalized.includes(` ${form} `) || stemmed.includes(` ${stemPhrase(form)} `));
    if (hit) group.filter((form) => form !== hit).forEach(push);
  }

  return { phrases, matched };
}
