/**
 * Abrevieri medicale folosite în cereri („tratamentul AR”) care, fără explicație, lasă modelul să aleagă singur
 * (AR poate fi artrită reumatoidă, aritmie sau altceva) și să genereze întrebări despre altă patologie.
 * Lista e scurtă și doar pentru sensurile dominante în pregătirea de rezidențiat; abrevierile necunoscute rămân neatinse.
 */
const ABBREVIATIONS: Record<string, string> = {
  AR: 'artrita reumatoidă',
  SA: 'spondilita anchilozantă',
  LES: 'lupus eritematos sistemic',
  APs: 'artrita psoriazică',
  AIJ: 'artrita idiopatică juvenilă',
  HTA: 'hipertensiunea arterială',
  BPOC: 'boala pulmonară obstructivă cronică',
  IMA: 'infarctul miocardic acut',
  AVC: 'accidentul vascular cerebral',
  DZ: 'diabetul zaharat',
  IRC: 'insuficiența renală cronică',
  TEP: 'tromboembolismul pulmonar',
};

const TOKEN = /(?<![\p{L}\d])(AR|SA|LES|APs|AIJ|HTA|BPOC|IMA|AVC|DZ|IRC|TEP)(?![\p{L}\d])/gu;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Utilizatorul a explicat deja abrevierea: „SA (stenoză aortică)”, „stenoza aortică (SA)”, sau subiectul vorbește despre aortă. */
function alreadyExplained(topic: string, abbreviation: string, expansion: string): boolean {
  if (new RegExp(String.raw`(?<![\p{L}\d])${abbreviation}\s*\(`, 'u').test(topic)) return true;
  if (new RegExp(String.raw`\(\s*${abbreviation}\s*\)`, 'u').test(topic)) return true;
  const plain = fold(topic);
  if (plain.includes(fold(expansion))) return true;
  // AR și SA sunt și „regurgitație/stenoză aortică”: dacă subiectul pomenește aorta, sensul e deja ales.
  return (abbreviation === 'AR' || abbreviation === 'SA') && /aort/.test(plain);
}

/**
 * „tratamentul AR” → „tratamentul AR (AR = artrita reumatoidă)”; textul fără abrevieri rămâne identic, la fel ca abrevierile
 * pe care utilizatorul le-a explicat deja.
 */
export function explainAbbreviations(topic: string): string {
  const found = [...new Set([...topic.matchAll(TOKEN)].map((match) => match[1]))]
    .filter((abbreviation) => !alreadyExplained(topic, abbreviation, ABBREVIATIONS[abbreviation]));
  if (found.length === 0) return topic;
  return `${topic} (${found.map((abbreviation) => `${abbreviation} = ${ABBREVIATIONS[abbreviation]}`).join('; ')})`;
}
