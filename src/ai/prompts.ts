import type { Question } from '../types';
import type { AIContextPayload, MistakeBankEntry, UserProfileData, WeakTopic } from './types';
import { buildQuestionTypeInstruction, type QuestionType } from '../lib/ai/questionTypes';
import { DEFAULT_EXAM_STYLE, type ExamStyle } from '../lib/ai/examStyle';
import { buildExemplarBlock } from '../data/questionExemplars';
import { PERSONA_CORE, STRUCTURED_OUTPUT_RULES, TERMINOLOGY_RULE } from './promptKit';

export const AI_PERSONALITY =
  `${PERSONA_CORE} Ești exigent și foarte clar. ` +
  'Nu accepți explicații superficiale. Prioritizezi înțelegerea mecanismelor patologice, ' +
  `nu memorarea mecanică. ${TERMINOLOGY_RULE} ` +
  'Raționamentul tău urmează structura: fiziopatologie -> clinic -> diagnostic -> tratament.';

export const GROUNDING_RULES =
  'REGULI STRICTE:\n' +
  '1. Folosește prioritar informațiile din contextul extras din biblioteca studentului.\n' +
  '2. Dacă o informație nu apare în context, poți completa din cunoștințe medicale generale, ' +
  'dar marchează clar acea parte ca "(cunoștințe generale)".\n' +
  '3. Nu inventa valori de laborator, doze, scoruri sau statistici.\n' +
  '4. Răspunde exclusiv în limba română.\n' +
  '5. Nu formula întrebări despre document, fișier, PDF sau "cursul încărcat"; întreabă doar despre conținutul medical.\n' +
  '6. Opțiunile de răspuns trebuie să fie concise, clare și utile pentru examen, nu propoziții lungi copiate integral.\n' +
  '7. Evită să repeți textual pasaje întregi din context; reformulează fidel și precis.';

/**
 * House style for generated questions, calibrated against the real thing:
 * the official rezidențiat papers (2021–2024) plus two Romanian question banks
 * (~2000 parsed items). What the corpus actually shows:
 *
 *  - 97% of bank items and every official item have exactly five options, A–E;
 *  - the official exam is complement simplu throughout — one correct answer;
 *  - stems are short (~75 characters) and 66–92% end in a colon, completed by
 *    the options, rather than being full interrogative sentences;
 *  - options are short too (~35–70 characters) and belong to one category:
 *    all drug classes, all thresholds, all mechanisms;
 *  - abbreviations get expanded at first use: "boală cronică de rinichi (BCR)";
 *  - 14–31% of stems are negative ("o singură afirmație este incorectă", "NU");
 *  - clinical vignettes are the exception (~5–8%), not the rule;
 *  - numeric thresholds and named criteria (KDIGO, DUKE) appear constantly.
 */
export const RESIDENCY_STYLE_RULES =
  'STIL DE GRILĂ (calibrat pe subiectele oficiale de rezidențiat și pe culegerile românești):\n' +
  '- enunț scurt, de o singură frază, care se termină de regulă cu ":" și este completat de opțiuni ' +
  '(ex. "Segmentul tubului digestiv afectat în colita ulcerativă este:", "Deficitul de antitrombină:")\n' +
  '- alternativ, formulări de tip afirmație: "Referitor la X este adevărat că:", "Alegeți afirmația corectă privind X:", ' +
  '"Care dintre următoarele afirmații referitoare la X este adevărată:"\n' +
  '- opțiuni scurte (3–15 cuvinte), din aceeași categorie logică: toate clase de medicamente, toate praguri numerice, ' +
  'toate mecanisme — niciodată amestecate ca să se ghicească răspunsul după formă\n' +
  '- explicitează abrevierea la prima folosire: "boală cronică de rinichi (BCR)", "tromboembolism venos (TEV)"\n' +
  '- folosește praguri, stadializări și criterii cu nume atunci când tema le are ' +
  '(clasificarea KDIGO, criteriile DUKE, gradele HTA, valori de laborator) — dar numai valori stabile, larg acceptate\n' +
  '- din când în când (aproximativ 1 din 7) folosește un enunț negativ: "o singură afirmație este incorectă:", ' +
  '"NU este caracteristic pentru:", "cu excepția:" — scris cu majuscule la cuvântul-cheie, ca la examen\n' +
  '- cazurile clinice sunt rare la examenul real (sub 10%): folosește-le rar și scurt, nu la fiecare întrebare\n' +
  '- nu numerota opțiunile în text și nu scrie "A.", "B." în câmpul opțiunii — literele sunt adăugate de aplicație';

/**
 * The plain track: an ordinary subject quiz, without the exam's conventions.
 * Four options, everyday phrasing, no guideline name-dropping.
 */
export const SIMPLE_STYLE_RULES = [
  'STIL DE GRILĂ (grilă simplă, pentru o materie de facultate):',
  '- enunț clar, formulat ca întrebare directă ("Care este...?", "Ce reprezintă...?") sau completabil cu ":"',
  '- exact 4 opțiuni scurte, din aceeași categorie logică, o singură variantă corectă',
  '- limbaj simplu, fără jargon inutil; explicitează abrevierile la prima folosire',
  '- fără trimiteri la clasificări sau ghiduri de specialitate dacă materia nu le cere',
  '- nu numerota opțiunile în text și nu scrie "A.", "B." în câmpul opțiunii',
].join('\n');

// Contractul de lizibilitate pentru proză (explicații, rapoarte) trăiește în promptKit; re-exportat
// aici ca importurile existente să rămână valide.
export { STRUCTURED_OUTPUT_RULES };

export const TRUSTED_GENERAL_KNOWLEDGE_RULES =
  'Când biblioteca nu acoperă complet răspunsul, completează doar cu raționament medical general stabil, compatibil cu manuale și ghiduri consacrate. ' +
  'Nu inventa citări exacte, ediții, pagini, doze, scoruri sau recomandări temporale neverificate; marchează clar ce este completare generală.';

function difficultyText(difficulty: 'easy' | 'medium' | 'hard') {
  if (difficulty === 'easy') {
    return 'UȘOR: întrebări de recunoaștere, definiții, clasificări simple și asocieri directe, fără capcane.';
  }
  if (difficulty === 'hard') {
    return 'DIFICIL: raționament clinic în mai mulți pași, diagnostic diferențial, complicații, tratament specific și situații atipice.';
  }
  return 'MEDIU: corelații fiziopatologice, interpretare clinică simplă și alegerea conduitei corecte.';
}

function weakTopicsText(weakTopics: WeakTopic[]) {
  if (weakTopics.length === 0) return 'niciun topic slab identificat încă';
  return weakTopics
    .map((topic) => `"${topic.topic}" (${topic.accuracy}% corect din ${topic.total} răspunsuri)`)
    .join(', ');
}

function mistakeBankText(mistakeBank: MistakeBankEntry[]) {
  if (!mistakeBank?.length) return '';

  const topMistakes = [...mistakeBank]
    .sort((left, right) => right.wrongCount - left.wrongCount)
    .slice(0, 5);

  return (
    'GREȘELI FRECVENTE ALE STUDENTULUI:\n' +
    topMistakes
      .map((entry) => (
        `- Topic: "${entry.topic}" | ` +
        `Greșit de ${entry.wrongCount} ori | ` +
        `Răspuns dat: "${entry.userAnswer}" | ` +
        `Tip greșeală: ${entry.mistakeType ?? 'nespecificat'} | ` +
        `Concept lipsă: ${entry.missingConcept ?? 'nespecificat'}`
      ))
      .join('\n')
  );
}

export function sanitizeUserInput(input: string) {
  return input
    .replace(/<\|.*?\|>/g, '')
    .replace(/system prompt/gi, '')
    .replace(/ignore previous instructions/gi, '')
    .split('')
    .filter((char) => char.charCodeAt(0) !== 0)
    .join('')
    .trim();
}

/** Regula repetată înainte și după context: modelul o respectă mai bine când o vede și la final. */
function subjectRuleText(subject: string) {
  return (
    `SUBIECT OBLIGATORIU: „${subject}”. Enunțul și răspunsul corect al fiecărei întrebări sunt despre acest subiect, nu despre altă ` +
    'patologie, specialitate sau capitol. Entitățile înrudite pot apărea doar ca distractori sau în diagnosticul diferențial. ' +
    'Abrevierile explicate în subiect se citesc așa cum sunt explicate. ' +
    'Dacă nu poți formula suficiente întrebări fidele subiectului, returnează mai puține, nu schimba subiectul.'
  );
}

export function buildQuestionPrompt(
  profile: UserProfileData | null,
  weakTopics: WeakTopic[],
  difficulty: 'easy' | 'medium' | 'hard',
  contextPayload?: AIContextPayload,
  questionType: 'single' | 'multiple' = 'single',
  questionTypes?: QuestionType[],
  count = 1,
  examStyle: ExamStyle = DEFAULT_EXAM_STYLE,
  subject?: string,
) {
  const typeInstruction = questionTypes && questionTypes.length > 0
    ? buildQuestionTypeInstruction(count, questionTypes)
    : '';
  const safeContext = contextPayload?.summary ?? '';
  // Pe un subiect fix, greșelile și topicurile slabe din alte teme nu au ce căuta în prompt.
  const mistakeSection = !subject && profile?.mistakeBank?.length ? mistakeBankText(profile.mistakeBank) : '';
  const subjectRule = subject ? subjectRuleText(subject) : '';

  const profileLine = profile
    ? `PROFIL STUDENT: dificultate curentă ${profile.currentDifficulty}, acuratețe globală ${profile.globalAccuracy}%, streak ${profile.streak}.`
    : 'Profil student indisponibil. Generează pentru nivel mediu.';

  const vignetteInstruction = difficulty === 'hard'
    ? 'Pentru HARD: creează scenarii clinice complete, cu pacient, simptome, semne cheie și context relevant.'
    : difficulty === 'medium'
      ? 'Pentru MEDIUM: include 1-2 date clinice sau paraclinice care cer interpretare.'
      : 'Pentru EASY: păstrează întrebarea directă și clară.';

  const distractorInstruction =
    'DISTRACTORI: plauzibili clinic și construiți din confuzii reale (entități apropiate, praguri vecine, inversarea cauzei cu efectul), nu răspunsuri absurde. ' +
    'Fără indicii de formă: răspunsul corect nu e mai lung sau mai detaliat decât celelalte și nu stă mereu pe aceeași poziție; ' +
    'evită „toate de mai sus”, „niciuna” și cuvintele absolute („întotdeauna”, „niciodată”) când nu sunt ele însele adevărul.';

  const commonQualityRules = 'distractorii plauzibili din aceeași categorie, fără a menționa numele fișierului sau documentului, fără formulări meta de tip "conform cursului", fără opțiuni mai lungi de 18 cuvinte.';

  const answerQualityInstruction = questionType === 'multiple'
    ? `Cerințe obligatorii (COMPLEMENT MULTIPLU): exact 5 opțiuni, ÎNTRE 2 ȘI 4 răspunsuri corecte (isCorrect:true) pe întrebare, cel mai des 3 — niciodată unul singur și niciodată toate cinci. Enunțul cere afirmații ("Următoarele afirmații despre X sunt adevărate:", "Selectați afirmațiile false referitoare la X:", "Care dintre următoarele...") iar fiecare opțiune este o afirmație completă, care poate fi judecată singură ca adevărată sau falsă, nu o continuare a enunțului. ${commonQualityRules}`
    : examStyle === 'residency'
      ? `Cerințe obligatorii (COMPLEMENT SIMPLU, ca la rezidențiat): exact 5 opțiuni (A-E), exact 1 răspuns corect, ${commonQualityRules}`
      : `Cerințe obligatorii (COMPLEMENT SIMPLU clasic, pentru o materie de facultate): exact 4 opțiuni (A-D), exact 1 răspuns corect, ${commonQualityRules}`;

  const option = (correct: boolean) => `{"text":"","isCorrect":${correct}}`;
  const optionList = questionType === 'multiple'
    ? [option(true), option(true), option(false), option(false), option(false)]
    : [option(true), ...Array.from({ length: examStyle === 'residency' ? 4 : 3 }, () => option(false))];
  const jsonSchema = `{"questions":[{"text":"","options":[${optionList.join(',')}],"explanation":"1-2 propoziții scurte, fără „;”: de ce e corectă și care e capcana principală","tags":["topic"],"difficulty":"easy|medium|hard","sources":[""]}]}`;

  return [
    AI_PERSONALITY,
    GROUNDING_RULES,
    TRUSTED_GENERAL_KNOWLEDGE_RULES,
    examStyle === 'residency' ? RESIDENCY_STYLE_RULES : SIMPLE_STYLE_RULES,
    profileLine,
    subjectRule,
    subject ? '' : `TOPICURI SLABE DE PRIORITIZAT: ${weakTopicsText(weakTopics)}.`,
    mistakeSection,
    `NIVEL CERUT: ${difficultyText(difficulty)}`,
    vignetteInstruction,
    distractorInstruction,
    answerQualityInstruction,
    // Anchors last before the context: the model copies the shape it saw most
    // recently, and prose rules alone never got the stems short enough.
    buildExemplarBlock(examStyle, questionType),
    typeInstruction,
    safeContext
      ? `CONTEXT DIN BIBLIOTECA STUDENTULUI:\n${safeContext}`
      : 'Nu există context în bibliotecă. Folosește doar cunoștințe medicale generale.',
    subjectRule,
    'Returnează strict JSON valid, fără text înainte sau după. Schema este:',
    jsonSchema,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildExplanationPrompt(
  userAnswer: string,
  correctAnswer: string,
  question?: Question,
  contextPayload?: AIContextPayload,
) {
  const answeredCorrectly = userAnswer.trim() !== '' && userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
  const optionLines = question?.options
    .map((option, index) => {
      const label = String.fromCharCode(65 + index);
      return `${label}. ${sanitizeUserInput(option.text)}${option.isCorrect ? ' [CORECT]' : ''}`;
    })
    .join('\n');

  return [
    AI_PERSONALITY,
    GROUNDING_RULES,
    TRUSTED_GENERAL_KNOWLEDGE_RULES,
    answeredCorrectly
      ? 'SCOP: explicație CLARĂ după o grilă rezolvată CORECT: confirmă de ce e bună alegerea și arată capcana în care ai fi putut cădea. Acoperă mecanismul corect și variantele apropiate. Nu scrie eseuri, dar nu sacrifica niciun mecanism important.'
      : 'SCOP: explicație CLARĂ după o grilă greșită. Acoperă mecanismul corect și toate variantele greșite cheie. Nu scrie eseuri, dar nu sacrifica niciun mecanism important.',
    STRUCTURED_OUTPUT_RULES,
    'STRUCTURA EXPLICAȚIEI — exact aceste patru secțiuni, în această ordine, separate prin linie goală (\\n\\n în JSON):\n' +
      '**✅ De ce e corect:** mecanismul fiziopatologic cheie, 1-2 propoziții.\n\n' +
      (answeredCorrectly
        ? '**⚠️ Capcana clasică:** ce variantă apropiată ar tenta alți studenți și de ce cade, 1-2 propoziții.\n\n'
        : '**❌ De ce cade varianta ta:** ce confuzie clinică clasică reprezintă, 1-2 propoziții.\n\n') +
      '**⚠️ Celelalte variante:** listă cu „- ”, câte un rând scurt pentru fiecare variantă greșită rămasă.\n\n' +
      '**🧠 Regula de examen:** o singură propoziție scurtă și memorabilă.',
    'Nu repeta întrebarea. Fii direct ca un profesor care corectează oral.',
    question ? `ÎNTREBAREA: ${sanitizeUserInput(question.text)}` : '',
    optionLines ? `OPȚIUNI:\n${optionLines}` : '',
    `RĂSPUNS STUDENT: ${sanitizeUserInput(userAnswer)}`,
    `RĂSPUNS CORECT: ${sanitizeUserInput(correctAnswer)}`,
    contextPayload?.summary ? `CONTEXT RELEVANT:\n${contextPayload.summary}` : '',
    'Returnează strict JSON:\n' +
      '{"explanation":"cele patru secțiuni Markdown de mai sus, separate prin \\n\\n","mistakeType":"confuzie_mecanism|inversare_tratament|diagnostic_diferential|lipsa_cunostinte|citire_superficiala|altul","rule":"regula scurta de retinut","confidence":0.0,"missingConcept":"concept lipsa","recommendedTopic":"topic recomandat","relatedConcepts":[""],"sources":[""]}',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildMnemonicPrompt(concept: string, contextPayload?: AIContextPayload, correctAnswer?: string) {
  return [
    AI_PERSONALITY,
    GROUNDING_RULES,
    TRUSTED_GENERAL_KNOWLEDGE_RULES,
    `CONCEPT: ${sanitizeUserInput(concept)}`,
    correctAnswer ? `RĂSPUNS CORECT DE REȚINUT: ${sanitizeUserInput(correctAnswer)}` : '',
    contextPayload?.summary ? `CONTEXT:\n${contextPayload.summary}` : '',
    'Creează un mnemonic medical memorabil pentru studenți români. Poate fi acronim, rimă, poveste scurtă sau asociere vizuală.',
    'REGULĂ DE CORECTITUDINE: fiecare literă sau element al mnemonicului corespunde unui element real și complet din ce trebuie reținut; nu adăuga, nu omite și nu inventa fapte ca să iasă acronimul. Dacă nu poți face un acronim corect, folosește o imagine sau o rimă.',
    'Returnează strict JSON: {"mnemonic":"textul mnemonic complet"}',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildHintPrompt(question: Question, contextPayload?: AIContextPayload) {
  return [
    AI_PERSONALITY,
    GROUNDING_RULES,
    TRUSTED_GENERAL_KNOWLEDGE_RULES,
    `ÎNTREBAREA: ${sanitizeUserInput(question.text)}`,
    `OPȚIUNI: ${sanitizeUserInput(question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option.text}`).join(' | '))}`,
    `RĂSPUNS CORECT (indiciile duc la el, nu la altă variantă): ${sanitizeUserInput(question.options.filter((option) => option.isCorrect).map((option) => option.text).join('; '))}`,
    contextPayload?.summary ? `CONTEXT:\n${contextPayload.summary}` : '',
    'Generează 3 indicii progresive, de la vag la aproape complet. „light” și „medium” NU numesc și nu descriu transparent răspunsul corect; doar „full” poate fi explicația aproape completă.',
    'Returnează strict JSON:\n' +
      '{"light":"indiciu vag","medium":"indiciu mediu","full":"explicatia aproape completa"}',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildWrongOptionsPrompt(question: Question, contextPayload?: AIContextPayload) {
  const options = question.options.map((option) => option.text).join(' | ');
  const correctOption = question.options.find((option) => option.isCorrect)?.text ?? '';

  return [
    AI_PERSONALITY,
    GROUNDING_RULES,
    TRUSTED_GENERAL_KNOWLEDGE_RULES,
    `ÎNTREBAREA: ${sanitizeUserInput(question.text)}`,
    `OPȚIUNI: ${sanitizeUserInput(options)}`,
    `RĂSPUNS CORECT: ${sanitizeUserInput(correctOption)}`,
    contextPayload?.summary ? `CONTEXT:\n${contextPayload.summary}` : '',
    'Pentru fiecare opțiune greșită explică:\n' +
      '- de ce e greșită,\n' +
      '- în ce context ar fi putut deveni corectă,\n' +
      '- ce confuzie clasică reprezintă.',
    'Returnează strict JSON: {"options":[{"option":"","whyWrong":"","whenCorrect":"","classicConfusion":""}]}',
  ]
    .filter(Boolean)
    .join('\n\n');
}
