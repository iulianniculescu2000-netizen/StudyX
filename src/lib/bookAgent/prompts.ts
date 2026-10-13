/**
 * Prompturile agentului „Vezi în carte”. Doi pași scurți, fiecare cu JSON strict:
 *  1. localizatorul înțelege grila (ce afecțiune/subiect, abrevieri desfăcute, sinonime) ca să caute cuvintele din carte;
 *  2. judecătorul alege, din pasajele găsite, pe cel care susține răspunsul corect și marchează propozițiile (cu rol).
 * Niciunul nu scrie text nou pentru student: textul afișat rămâne cel din carte.
 */
import { BOOK_SOURCE_NAME, type PassageCandidate, type PassageQuery } from '../bookPassage';
import { chapterOutline } from '../bookKnowledge';

export const AGENT_SYSTEM_PROMPT =
  'Ești agentul de surse al unei aplicații de pregătire pentru rezidențiat. Găsești în manualele românești pasajul care susține răspunsul corect al unei grile. ' +
  'Nu scrii și nu rezumi conținut medical: alegi și marchezi text care există deja. Dacă nu ești sigur, spui asta. Răspunzi doar cu JSON valid.';

export const HIGHLIGHT_LEGEND: Record<'answer' | 'question' | 'distractor', string> = {
  answer: 'Susține răspunsul corect',
  question: 'Contextul din enunț',
  distractor: 'De ce celelalte variante sunt greșite',
};

const linesOf = (items: ReadonlyArray<string | undefined | false>) => items.filter(Boolean).join('\n');

export function buildLocatorPrompt(query: PassageQuery): string {
  return linesOf([
    'Pregătește căutarea în manuale (în română) pentru grila de mai jos.',
    '',
    `GRILĂ: ${query.question}`,
    `RĂSPUNS CORECT: ${query.answer.trim()}`,
    query.explanation && `EXPLICAȚIE: ${query.explanation.trim()}`,
    '',
    'CAPITOLE (număr | carte | titlu | pagini):',
    chapterOutline(),
    '',
    'Răspunde STRICT cu JSON: {"topic":"afecțiunea sau subiectul, 2-6 cuvinte","terms":["..."],"book":"K|L|S|null","chapters":[12]}',
    '- "chapters": 1-3 numere din lista de capitole, unde ar fi cel mai probabil pasajul; [] dacă nu ești sigur.',
    '- "terms": 4-8 cuvinte sau expresii din manualele românești care ar apărea în pasajul căutat: abrevierile desfăcute (AR = artrita reumatoidă), sinonime, denumirea completă a medicamentelor și a procedurilor. Fără cuvinte deja din enunț.',
    '- "book": K = Kumar și Clark (medicină internă), L = Lawrence (chirurgie), S = Sinopsis (pediatrie, dermatologie, ginecologie-obstetrică și altele); null dacă nu ești sigur.',
  ]);
}

export function buildJudgePrompt(query: PassageQuery, candidates: readonly PassageCandidate[]): string {
  const sources = candidates.map((candidate, c) => {
    const first = candidate.paras[0];
    const where = `${BOOK_SOURCE_NAME[first.book]}${first.chapter ? `, ${first.chapter}` : ''}${first.topic ? ` › ${first.topic}` : ''}, p. ${first.page}${first.heading ? `, „${first.heading}”` : ''}`;
    const body = candidate.paras.map((para, p) => `[C${c + 1}.${p + 1}] ${para.text.replace(/\n/g, ' • ')}`).join('\n');
    return `CANDIDAT C${c + 1} (${where})\n${body}`;
  }).join('\n\n');
  return linesOf([
    'Alege, dintre pasajele din carte de mai jos, ce susține răspunsul corect al grilei și marchează propozițiile importante.',
    '',
    `GRILĂ: ${query.question}`,
    `RĂSPUNS CORECT: ${query.answer.trim()}`,
    query.wrongAnswers?.length ? `VARIANTE GREȘITE: ${query.wrongAnswers.map((text) => text.trim()).filter(Boolean).join(' | ')}` : '',
    query.explanation && `EXPLICAȚIE: ${query.explanation.trim()}`,
    '',
    sources,
    '',
    'Răspunde STRICT cu un singur obiect JSON, fără alt text:',
    '{"verdict":"supports|related|none","paragraphs":["C1.1"],"highlights":[{"quote":"propoziție copiată cuvânt cu cuvânt","role":"answer|question|distractor"}],"why":"o frază în română"}',
    'Reguli:',
    '- "supports": un pasaj afirmă ce spune răspunsul corect (și parafrazat). "related": aceeași temă (aceeași afecțiune sau același tratament), dar fără afirmația exactă. "none": niciun candidat nu tratează subiectul grilei.',
    '- "paragraphs": ID-urile (ex. C2.1) ale paragrafelor care susțin răspunsul, dintr-un singur candidat, 1-3 paragrafe.',
    '- "highlights": 2-5 propoziții copiate EXACT (aceleași cuvinte și diacritice) din paragrafele alese, fiecare cu rol: "answer" = afirmă răspunsul corect; "question" = descrie situația din enunț (pacient, afecțiune, valori); "distractor" = arată de ce una dintre variantele greșite nu e potrivită. Cel puțin una cu rolul "answer".',
    '- "why": ce spune cartea despre răspunsul corect, într-o frază, fără informații care nu sunt în pasaj.',
    '- Nu alege un pasaj doar pentru că are aceleași cuvinte ca enunțul: caută cel care vorbește despre răspunsul corect. Explicația grilei poate fi formulată altfel decât cartea: contează ideea.',
  ]);
}
