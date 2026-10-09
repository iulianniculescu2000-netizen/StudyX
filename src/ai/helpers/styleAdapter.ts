/**
 * (e) styleAdapter — fragmente scurte de prompt per mod și nivel de student, pentru a înlocui modulele
 * mari de mod din `promptKit.ts` (MODE_MODULES + EXAM_REASONING_RULES) când se vrea economie de tokeni
 * (modelul local, rute `light`, utilizatori aproape de limita gratuită). Costul fiecărui fragment e
 * testat față de modulul existent.
 *
 * Nu schimbă regulile de siguranță/limbă (acelea rămân în blocurile comune); înlocuiește doar „rolul”
 * și structura răspunsului.
 */
export type StyleMode = 'explain' | 'simple' | 'summarize' | 'review' | 'test' | 'mnemonic' | 'diagram' | 'exam';
export type StudentLevel = 'beginner' | 'intermediate' | 'advanced';

const MODE_FRAGMENTS: Record<StyleMode, string> = {
  explain: 'MOD: explică. Definiție -> mecanism -> clinic -> capcană; întâi răspunsul direct, apoi de ce.',
  simple: 'MOD: simplu. Pe înțelesul unui student din anul 2: o analogie, fraze scurte, un exemplu, fără jargon nedefinit.',
  summarize: 'MOD: rezumat. Doar ce cade la examen: mecanisme, diferențe, criterii, excepții; ➔ la enumerări; final: „Regula de 30 de secunde”.',
  review: 'MOD: recapitulare rapidă. 5-7 puncte-cheie ➔, fiecare sub 15 cuvinte, apoi capcana cea mai frecventă.',
  test: 'MOD: examinator. Întrebări despre mecanism și diferențial, nu definiții; răspunsurile doar dacă le cere.',
  mnemonic: 'MOD: mnemonic. 2 mnemonice distincte, corecte medical; pentru fiecare: **Mnemonic**, **Se desface**, **Când ajută**.',
  diagram: 'MOD: schemă. Un bloc ```mermaid (flowchart/mindmap), apoi 3 „noduri de examen”.',
  exam: 'MOD: examen. Răspuns direct, de ce, capcana celorlalte variante, cum se întreabă la examen.',
};

const LEVEL_FRAGMENTS: Record<StudentLevel, string> = {
  beginner: 'Nivel: începător: pași mici, termenii noi definiți pe loc.',
  intermediate: 'Nivel: mediu: fără bazele, accent pe legături și diferențial.',
  advanced: 'Nivel: avansat: direct la capcane și excepții.',
};

/** Nivelul din acuratețea recentă (0-100); fără date → intermediar. */
export function levelFromAccuracy(accuracyPct: number | null | undefined): StudentLevel {
  if (accuracyPct === null || accuracyPct === undefined || !Number.isFinite(accuracyPct)) return 'intermediate';
  if (accuracyPct < 50) return 'beginner';
  if (accuracyPct >= 78) return 'advanced';
  return 'intermediate';
}

/** Detectează modul cerut dintr-un mesaj (reguli simple, fără LLM); null dacă nu e clar. */
export function detectStyleMode(message: string): StyleMode | null {
  const m = message.toLowerCase();
  if (/\b(pe scurt|recapitul|revizuire|repede|rapid)/.test(m)) return 'review';
  if (/\b(simplu|pe în?[țt]eles|ca unui|ca pentru un|eli5|ca la)\b/.test(m)) return 'simple';
  if (/\b(rezum|sintez)/.test(m)) return 'summarize';
  if (/\b(mnemonic|mnemotehnic|cum re[țt]in)/.test(m)) return 'mnemonic';
  if (/\b(sch[ei]m[aă]|diagram|flowchart|algoritm)/.test(m)) return 'diagram';
  if (/\b(grile|grila|testeaz|examineaz|[îi]ntreab[aă]-m[aă])/.test(m)) return 'test';
  if (/\b(explic|cum func|de ce|mecanism)/.test(m)) return 'explain';
  return null;
}

export interface StyleInput {
  mode: StyleMode;
  level?: StudentLevel;
}

/** Fragmentul de prompt: mod + (opțional) nivel. 20-45 tokeni. */
export function styleFragment({ mode, level }: StyleInput): string {
  return level ? `${MODE_FRAGMENTS[mode]} ${LEVEL_FRAGMENTS[level]}` : MODE_FRAGMENTS[mode];
}
