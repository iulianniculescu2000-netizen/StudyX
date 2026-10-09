import { getMedicalSystemPrompt } from '../aiContext';
import { groqChat } from './requests';
import { groqStream } from './streaming';

export async function explainWrongAnswer(
  questionText: string,
  userAnswer: string,
  correctAnswer: string,
  userContext?: string
): Promise<string> {
  const forgotContext = /am uitat contextul/i.test(userAnswer);
  const studentAnswerLine = forgotContext
    ? 'Studentul foloseste flashcardul pentru active recall si nu a formulat raspunsul din memorie.'
    : `Raspunsul studentului: "${userAnswer}".`;

  return groqChat([
    { role: 'system', content: getMedicalSystemPrompt('explainer', userContext) },
    {
      role: 'user',
      content: `Explică SCURT și DIRECT. Maxim 4-5 propoziții totale, fără eseuri.

Întâi verifică medical dacă "${correctAnswer}" este chiar răspunsul corect (grila poate fi generată automat și greșită). Dacă e greșit, începe cu „⚠️ Grila pare greșită — corect este de fapt «...»" și explică; nu apăra o cheie eronată. Dacă nu ești sigur, spune-o în loc să alegi la întâmplare.

Dacă e corect, FORMAT:
1. De ce "${correctAnswer}" e corect — 1-2 propoziții cu mecanismul cheie.
2. De ce răspunsul ales cade — 1 propoziție, direct, cu confuzia clasică din spate.
3. Cum se întreabă la examen / regula de reținut — 1 propoziție memorabilă.

Nu repeta întrebarea. Nu enumera toate variantele. Răspunde în română.

Întrebare: ${questionText}
${studentAnswerLine}
Răspuns marcat ca corect în grilă: "${correctAnswer}"`,
    },
  ], 0.3);
}

// ── New smart AI functions ──────────────────────────────────────────────────────

/**
 * Streaming inline explanation for a revealed answer in QuizPlay.
 * Explains the correct answer + why wrong options are wrong.
 * Personalized via userContext.
 */
export async function explainAnswerInline(
  questionText: string,
  options: { text: string; isCorrect: boolean }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  userContext?: string
): Promise<void> {
  const correct = options.find(o => o.isCorrect)?.text ?? '';
  const wrong = options.filter(o => !o.isCorrect).map(o => `"${o.text}"`).join(', ');

  await groqStream([
    { role: 'system', content: getMedicalSystemPrompt('explainer', userContext) },
    {
      role: 'user',
      content: `Întrebare: "${questionText}"
Răspuns marcat ca CORECT în grilă: "${correct}"
Variante marcate ca greșite: ${wrong}

Această grilă a putut fi generată automat, deci cheia poate conține erori.
PASUL 0 — VERIFICĂ medical dacă "${correct}" este chiar răspunsul corect:
- Dacă este corect: explică normal.
- Dacă este GREȘIT (altă variantă e corectă sau enunțul/cheia au o eroare): spune răspicat din prima propoziție, ex: "⚠️ Atenție: grila pare greșită — răspunsul corect real este «...», nu «${correct}»", apoi explică de ce. NU justifica o cheie greșită. Dacă nu ești sigur, spune-o deschis.

Dacă cheia este corectă, explică pentru un student la medicină, în această ordine:
- răspunsul direct și de ce e bun (mecanismul fiziologic sau fiziopatologic decisiv),
- de ce fiecare variantă greșită pică și când ar putea deveni corectă,
- capcana de examen și cum se întreabă de obicei,
- regula scurtă de reținut.

Răspunde în română, concis, dar fără superficialitate.`,
    },
  ], onChunk, 0.3, signal);
}

/**
 * Generates a personalized daily study recommendation for Dashboard.
 * Falls back to a deterministic tip if no AI key or user data.
 */
export async function generateStudyRecommendation(
  userContext: string,
  dueCount: number,
  weakTopics: string[]
): Promise<string> {
  if (!userContext) {
    if (dueCount > 0) return `Ai ${dueCount} întrebări de recapitulat azi. Începe cu ele pentru a menține SM-2 activ!`;
    return 'Rezolvă prima sesiune de grile pentru a activa recomandările personalizate AI!';
  }

  return groqChat([
    { role: 'system', content: getMedicalSystemPrompt('advisor', userContext) },
    {
      role: 'user',
      content: `Recomandă-mi ce să studiez azi.${dueCount > 0 ? ` Am ${dueCount} întrebări de recapitulat.` : ''}${weakTopics.length > 0 ? ` Cele mai slabe topicuri: ${weakTopics.join(', ')}.` : ''} Răspunde EXACT în acest format, fără tabele, fără titluri și fără text în plus:
🎯 Focus: o singură propoziție scurtă (maxim 14 cuvinte)
⏱ Plan: o singură propoziție scurtă cu durata totală (maxim 14 cuvinte)
💡 Sfat: o singură propoziție scurtă (maxim 14 cuvinte)`,
    },
  ], 0.5);
}

/**
 * Generates a medical mnemonic for a hard question answered wrong repeatedly.
 */
/**
 * Streams a personalized weak-spot analysis report.
 * Call from Stats page after gathering category-level accuracy data.
 */
export async function generateWeakSpotReport(
  data: {
    weakCategories: { name: string; accuracy: number; quizCount: number }[];
    totalAccuracy: number;
    streak: number;
    totalAnswered: number;
    recentMistakeTopics: string[];
  },
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const hasData = data.weakCategories.length > 0 || data.recentMistakeTopics.length > 0 || data.totalAnswered > 0;
  if (!hasData) {
    onChunk('Nu există suficiente date de studiu. Rezolvă câteva sesiuni de grile pentru a activa raportul personalizat!');
    return;
  }
  const weakList = data.weakCategories
    .slice(0, 6)
    .map(c => `• ${c.name}: ${c.accuracy}% (${c.quizCount} grile)`)
    .join('\n');
  const mistakeTopics = data.recentMistakeTopics.slice(0, 6).join(', ');
  await groqStream(
    [
      { role: 'system', content: getMedicalSystemPrompt('advisor') },
      {
        role: 'user',
        content: `Analizează datele de studiu ale studentului și generează un raport SCURT, SPECIFIC și MOTIVANT.

DATE:
- Acuratețe globală: ${data.totalAccuracy}%
- Streak actual: ${data.streak} zile
- Total răspunsuri date: ${data.totalAnswered}
${weakList ? `\nCATEGORII CU ACURATEȚE SCĂZUTĂ:\n${weakList}` : ''}
${mistakeTopics ? `\nTOPICURI CU GREȘELI RECENTE: ${mistakeTopics}` : ''}

INSTRUCȚIUNI:
- 3-5 fraze, un singur paragraf scurt de text simplu, ton de tutor
- FĂRĂ titluri, tabele, liste, bullet points, emoji-uri sau text îngroșat; ignoră orice format structurat cerut în altă parte
- Identifică zona cea mai problematică și explică DE CE poate fi dificilă
- O recomandare concretă și acționabilă pentru săptămâna asta
- Un sfat tactic pentru examen legat de punctele slabe
- Închide cu o notă de încurajare sinceră bazată pe datele actuale
- Limbă: română, stil direct și cald`,
      },
    ],
    onChunk,
    0.5,
    signal,
    false,
    { task: 'analysis' }, // a short paragraph: the analysis budget, not the long-form chat one
  );
}

export async function generateMnemonic(
  questionText: string,
  correctAnswer: string
): Promise<string> {
  return groqChat([
    {
      role: 'system',
      content: `Ești expert în mnemonice medicale (ex: "CRAB" pentru mielom multiplu).
Scop: creează un ajutor de memorare (acronim, poveste scurtă, rimă sau asociere vizuală amuzantă) care leagă conceptul din întrebare de răspunsul corect.
Limba: română, cu diacritice corecte.
Stil: creativ, ușor de reținut, chiar și puțin absurd pentru a favoriza memorarea. Maximum 2-3 fraze.
Corectitudine: dacă faci un acronim, fiecare literă corespunde unui element real; nu inventa elemente ca să iasă cuvântul și nu adăuga fapte medicale care nu sunt în întrebare sau în răspuns.`,
    },
    {
      role: 'user',
      content: `Am nevoie de o mnemonică pentru a reține că răspunsul corect este "${correctAnswer}" pentru întrebarea: "${questionText}"`,
    },
  ], 0.85);
}
