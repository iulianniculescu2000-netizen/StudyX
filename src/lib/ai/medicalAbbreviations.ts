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
  TEP: 'trombembolismul pulmonar',
};

const TOKEN = /(?<![\p{L}\d])(AR|SA|LES|APs|AIJ|HTA|BPOC|IMA|AVC|DZ|IRC|TEP)(?![\p{L}\d])/gu;

/** „tratamentul AR” → „tratamentul AR (AR = artrita reumatoidă)”; textul fără abrevieri rămâne identic. */
export function explainAbbreviations(topic: string): string {
  const found = [...new Set([...topic.matchAll(TOKEN)].map((match) => match[1]))];
  if (found.length === 0) return topic;
  return `${topic} (${found.map((abbreviation) => `${abbreviation} = ${ABBREVIATIONS[abbreviation]}`).join('; ')})`;
}
