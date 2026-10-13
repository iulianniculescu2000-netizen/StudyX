/**
 * Ce se caută în bibliotecă pentru un mesaj din chat, și ce fragmente merită păstrate.
 *
 * Un mesaj ca „fa mi o schema” sau „rezumă regula pentru această grilă” nu are subiect: căutat ca atare, aduce cele mai
 * apropiate fragmente din toată biblioteca (în istoric: HIV, Rubeolă, Legislație la o întrebare despre insuficiența cardiacă),
 * care apoi se citează ca surse. Subiectul trebuie luat din grila deschisă sau din conversație. Fragmentele cu scor mic nu se
 * mai arată și nu mai intră în prompt: ancorează modelul în text fără legătură.
 */

/** Sub acest scor un fragment nu e legat de întrebare (în istoric: 0,2–0,4 pentru fragmente fără legătură, 0,8–1,5 pentru cele bune). */
export const MIN_CHUNK_SCORE = 0.4;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  openRoute?: unknown;
  optionCard?: unknown;
  isError?: boolean;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cuvinte de legătură și de comandă: ce rămâne după ele e subiectul. Comparate fără diacritice. */
const NOT_A_SUBJECT = new Set((
  'te rog imi mi ma rezumi rezuma rezumat regula capcanele capcane diferentele diferente cheie referitoare referitor aceasta ' +
  'asta aceasta grila grile intrebarea schema sceham scehma shema scheme tabel tabelul algoritm diagrama fa faci face da ' +
  'dai explica explici vad vezi vezi arata arati citeste citesti despre cursul curs relevant relevanta genereaza creeaza ' +
  'flashcard flashcarduri quiz test teste mini simplu scurt detaliat mai multe putin pentru examen din cu pe si sau in la ' +
  'un o ce cum care sunt este nu doar numai inca iar dar sa ca ai am vreau vrei poti puteai'
).split(/\s+/));

function contentTokens(text: string): string[] {
  return fold(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !NOT_A_SUBJECT.has(word));
}

/** O abreviere scrisă cu majuscule („AR”, „HTA”) e subiectul, oricât de scurtă ar fi. */
const hasAbbreviation = (text: string) => /(^|[^\p{L}])[A-ZĂÂÎȘȚ]{2,5}($|[^\p{L}])/u.test(text);

/** Mesaj fără subiect propriu: comandă („fa mi o schema”) sau trimitere („această grilă”). */
export function lacksSubject(text: string): boolean {
  return contentTokens(text).length < 2 && !hasAbbreviation(text);
}

const REFERS_TO_QUESTION = /\b(aceast[aă]|asta|aceasta|grila|grilă|intrebarea|întrebarea)\b/i;

const plain = (text: string) => text.replace(/[*_`#>|]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Textul pentru căutare. Mesajele cu subiect propriu rămân neschimbate; cele fără subiect primesc întrebarea grilei deschise
 * (când se referă la ea) sau subiectul ultimului mesaj cu subiect din conversație, apoi începutul ultimului răspuns lung.
 */
export function resolveRetrievalText(
  text: string,
  context: { quizQuestion?: string; history?: readonly HistoryMessage[] },
): string {
  if (!lacksSubject(text)) return text;
  const question = context.quizQuestion?.trim();
  if (question && (REFERS_TO_QUESTION.test(text) || contentTokens(text).length === 0)) return question;

  const history = [...(context.history ?? [])].reverse();
  const userTopic = history.find((message) => message.role === 'user' && !lacksSubject(message.content));
  if (userTopic) return plain(userTopic.content).slice(0, 300);
  const answer = history.find((message) => message.role === 'assistant' && !message.isError && !message.openRoute && !message.optionCard && message.content.trim().length >= 120);
  if (answer) return plain(answer.content).slice(0, 240);
  return text;
}

/** Păstrează fragmentele cu legătură de subiect; dacă niciunul nu are, întoarce lista goală (răspuns neancorat, nu surse fără legătură). */
export function filterRelevantChunks<T extends { score: number }>(chunks: readonly T[], minScore: number = MIN_CHUNK_SCORE): T[] {
  return chunks.filter((chunk) => chunk.score >= minScore);
}
