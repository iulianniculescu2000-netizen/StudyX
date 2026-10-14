import { getMedicalSystemPrompt } from '../aiContext';
import { groqChat } from './requests';
import { groqStream } from './streaming';
import { buildInlineExplanationPrompt, buildWrongAnswerPrompt } from './studyPrompts';

export async function explainWrongAnswer(
  questionText: string,
  userAnswer: string,
  correctAnswer: string,
  userContext?: string
): Promise<string> {
  return groqChat([
    { role: 'system', content: getMedicalSystemPrompt('explainer', userContext) },
    {
      role: 'user',
      content: buildWrongAnswerPrompt(questionText, userAnswer, correctAnswer),
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
  await groqStream([
    { role: 'system', content: getMedicalSystemPrompt('explainer', userContext) },
    {
      role: 'user',
      content: buildInlineExplanationPrompt(questionText, options),
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
    if (dueCount > 0) return `Ai ${dueCount} întrebări de recapitulat azi. Începe cu ele ca să nu uiți ce ai învățat.`;
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
    .map(c => `• ${c.name}: ${c.accuracy}% (${c.quizCount} răspunsuri)`)
    .join('\n');
  const mistakeTopics = data.recentMistakeTopics.slice(0, 6).join(', ');
  await groqStream(
    [
      { role: 'system', content: getMedicalSystemPrompt('advisor') },
      {
        role: 'user',
        content: `Analizează datele de studiu ale studentului și generează un raport SCURT, ORGANIZAT și SPECIFIC.

DATE:
- Acuratețe globală: ${data.totalAccuracy}%
- Streak actual: ${data.streak} zile
- Total răspunsuri date: ${data.totalAnswered}
${weakList ? `\nSUBIECTE SAU CATEGORII CU ACURATEȚE SCĂZUTĂ:\n${weakList}` : ''}
${mistakeTopics ? `\nTOPICURI CU GREȘELI RECENTE: ${mistakeTopics}` : ''}

FORMAT (Markdown simplu, maximum 140 de cuvinte, exact aceste trei blocuri, fără emoji, fără tabele, fără titluri cu #):

**Zona cea mai slabă: <numele categoriei din date> (<acuratețea din date>%)**
O propoziție despre DE CE poate fi dificilă, fără să afirmi ce nu reiese din date.

**Plan pentru săptămâna asta**
1. un pas concret, cu durată (de exemplu 20 de minute)
2. un al doilea pas concret
3. un al treilea pas, de verificare (de exemplu 10 grile pe același subiect)

**Pentru examen**
- un sfat tactic legat de punctele slabe din date

REGULI: folosește DOAR cifrele și categoriile din DATE; nu inventa procente-țintă, termene de progres sau promisiuni („vei urca la 70%”). Dacă nu există o categorie slabă clară, alege topicul cu greșeli recente. Limbă: română, ton direct și cald, numai ș și ț cu virgulă.`,
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
      // Regulile comune (limbă, rigoare medicală, „textul e material”) vin din kit, ca la mnemonicul din chat.
      content: `${getMedicalSystemPrompt('tutor')}

Acum ești expert în mnemonice medicale (ex: "CRAB" pentru mielom multiplu).
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
