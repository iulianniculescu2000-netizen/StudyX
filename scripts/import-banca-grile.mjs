// Convertește banca din proiectul „Grile rezidentiat” în setul de import StudyX.
//   node scripts/import-banca-grile.mjs "<folder Grile rezidentiat>" [iesire.json]
// Ieșirea se importă din Grile → Import (nu intră în installer). Grilele nelivrabile
// (stare ≠ „verificat”) primesc eticheta „neverificat” și un avertisment în descriere.
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Folosire: node scripts/import-banca-grile.mjs "<folder Grile rezidentiat>" [iesire.json]');
  process.exit(1);
}
const bancaDir = path.join(src, 'Date', 'Banca grile');
const out = process.argv[3] || path.join(src, 'Lucru', 'Export StudyX', 'Banca grile.json');

/** „A, C” / „AC” / „A;C” → {A,C} */
export const parseKey = (raw) => new Set(String(raw).toUpperCase().match(/[A-E]/g) ?? []);

export function convertGrila(entry) {
  const g = entry.grila;
  const key = parseKey(g.raspuns);
  const letters = Object.keys(g.optiuni).sort();
  const verified = entry.stare === 'verificat';
  const page = g.pdf_page;
  const lines = [];
  for (const L of letters) {
    const s = g.surse?.[L];
    if (!s) continue;
    const why = key.has(L) ? 'corect' : s.motiv ? `greșit: ${s.motiv}` : null;
    if (why) lines.push(`${L}) ${why}${s.citat ? ` — „${s.citat}”` : ''}`);
  }
  const explanation = [g.explicatie, ...lines].filter(Boolean).join('\n') + `\n(${g.carte}, p. ${page})`;
  return {
    text: g.enunt,
    multipleCorrect: g.tip === 'CM' || key.size > 1,
    difficulty: 'medium',
    explanation,
    tags: [
      g.carte,
      `p. ${page}`,
      ...(g.strategie ? [`distractori:${g.strategie}`] : []),
      ...(verified ? [] : ['neverificat']),
    ],
    options: letters.map((L) => ({ text: g.optiuni[L], isCorrect: key.has(L) })),
  };
}

function main() {
  const files = fs.readdirSync(bancaDir).filter((f) => f.endsWith('.json')).sort();
  const questions = [];
  let unverified = 0;
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(bancaDir, f), 'utf8'));
    for (const e of data.grile) {
      if (e.stare !== 'verificat') unverified++;
      questions.push(convertGrila(e));
    }
  }
  const set = {
    title: 'Banca Rezidențiat — Kumar (import)',
    description: unverified
      ? `Atenție: ${unverified} din ${questions.length} grile sunt marcate „de corectat” în proiectul sursă. Cheile nu au trecut verificarea independentă; confirmă în carte înainte să te bazezi pe ele.`
      : 'Grile verificate din proiectul Grile rezidențiat.',
    emoji: '🩺',
    category: 'Rezidențiat',
    color: 'blue',
    shuffleQuestions: false,
    shuffleAnswers: true,
    penaltyMode: true,
    questions,
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(set, null, 2), 'utf8');
  console.log(`${questions.length} grile (${unverified} neverificate) → ${out}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('import-banca-grile.mjs')) main();
