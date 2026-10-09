import { groqRequest } from '../../groq';
import { requestStructured } from '../structured';
import { logAIDebug } from '../../../ai/debug';
import { AgentPlanSchema } from '../schemas';
import { clampStudioPackCount, clampStudioQuestionCount } from '../studioGeneration';
import { DEFAULT_EXAM_STYLE, detectExamStyle, type ExamStyle } from '../examStyle';
import { useQuizStore } from '../../../store/quizStore';
import { useFolderStore } from '../../../store/folderStore';
import { useAIStore } from '../../../store/aiStore';
import { rezidentiatFolderIds, scopedReadySources, type SourceScope } from '../sourceScope';
import { type AgentPlan } from './types';
import { normalizeName } from './shared';
import { DESTRUCTIVE_ACTIONS, QUESTION_CONFIRM_THRESHOLD, TOPIC_CONFIRM_THRESHOLD, extractQuizIntent } from './intent';

export function folderPaths(items: Array<{ id: string; name: string; parentId?: string | null }>): string[] {
  const byId = new Map(items.map((folder) => [folder.id, folder]));
  return items.map((folder) => {
    const names = [folder.name];
    const guard = new Set<string>([folder.id]);
    let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    while (parent && !guard.has(parent.id)) {
      guard.add(parent.id);
      names.unshift(parent.name);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return names.join(' / ');
  });
}

export function buildPlannerPrompt(contextStyle: ExamStyle) {
  const { libraryFolders: allLibraryFolders } = useAIStore.getState();
  const scope: SourceScope = contextStyle === 'residency' ? 'rezidentiat' : 'general';
  const rezFolders = rezidentiatFolderIds(allLibraryFolders);
  // The planner only knows the library of the thread the command was typed in.
  const libraryFolders = allLibraryFolders.filter((folder) => rezFolders.has(folder.id) === (scope === 'rezidentiat'));
  const folders = useFolderStore.getState().folders;
  const quizzes = useQuizStore.getState().quizzes;

  const sources = scopedReadySources(scope).slice(0, 40).map((s) => s.name);
  const quizFolderNames = folderPaths(folders).slice(0, 60);
  const libFolderNames = folderPaths(libraryFolders).slice(0, 60);
  const quizTitles = quizzes.slice(0, 60).map((q) => q.title);

  return [
    'Ești motorul de comenzi al aplicației de studiu StudyX. Transformi comanda utilizatorului într-un PLAN de acțiuni JSON.',
    'Răspunde STRICT cu un singur obiect JSON, fără markdown, fără text în plus.',
    '',
    'Format:',
    '{"isCommand": true|false, "needsClarification": true|false, "reply": "confirmare scurtă în română", "steps": [ ...pași... ]}',
    '',
    'Dacă mesajul NU e o comandă de acțiune (ci o întrebare normală, conversație), pune "isCommand": false, "needsClarification": false, "reply": "" și "steps": [].',
    '',
    'Dacă mesajul CLAR cere o acțiune dar îți lipsește o informație esențială ca să construiești pașii corect (ce curs, ce subiect, ce cantitate, ce folder — și nu poți deduce nimic rezonabil din conversație), pune "isCommand": false, "needsClarification": true, "steps": [] și scrie în "reply" O SINGURĂ întrebare scurtă și directă care cere EXACT informația lipsă (nu reformula toată comanda, nu te scuza). Exemple: userul zice doar "fă-mi grile" fără subiect/curs → reply: "Despre ce curs sau subiect vrei grilele?". Userul zice "mută-l în folder" fără să spună care set → reply: "Care set vrei să-l mut?".',
    '- NU folosi needsClarification pentru lucruri pe care le poți rezolva singur cu reguli rezonabile (ex. cantitate nespecificată → foloseste implicit; folder nespecificat → rădăcină). Cere clarificare DOAR când ghicitul ar produce cu adevărat rezultatul greșit (subiect/curs lipsă, țintă ambiguă între mai multe opțiuni asemănătoare).',
    '',
    'Acțiuni disponibile (folosește exact aceste nume):',
    '- create_folder: {"action":"create_folder","name":"Nume","parent":"NumeFolderParinte (optional, pt subfolder)"}',
    '- create_library_folder: {"action":"create_library_folder","name":"Nume","parent":"NumeFolderParinte (optional, pt subfolder de bibliotecă)"}  // folder pt cursuri în Bibliotecă',
    '- generate_quiz_pack: {"action":"generate_quiz_pack","source":"nume curs din bibliotecă","folder":"nume folder destinatie (optional)","packCount":N,"questionsPerPack":N,"questionType":"single|multiple","difficulty":"auto|easy|medium|hard"}',
    '- generate_quiz_topic: {"action":"generate_quiz_topic","topic":"subiectul cerut de user, EXACT cum l-a formulat","folder":"nume folder destinatie (optional)","questionsPerPack":N,"questionType":"single|multiple","difficulty":"auto|easy|medium|hard"}  // grile pe un subiect general (cunoștințe medicale generale ale AI-ului), FĂRĂ curs din bibliotecă',
    '- generate_from_mistakes: {"action":"generate_from_mistakes","count":N,"folder":"nume folder destinatie (optional)","questionType":"single|multiple"}  // grile de recapitulare țintite pe greșelile salvate ale studentului (NU are nevoie de sursă)',
    '- create_flashcards: {"action":"create_flashcards","source":"nume curs din bibliotecă","folder":"nume folder destinatie (optional)","count":N}  // deck de flashcarduri (active recall) DINTR-UN CURS din bibliotecă',
    '- create_flashcards_topic: {"action":"create_flashcards_topic","topic":"subiectul cerut","folder":"nume folder destinatie (optional)","count":N}  // flashcarduri pe un SUBIECT general (cunoștințele medicale ale AI-ului), fără curs din bibliotecă',
    '- summarize_document: {"action":"summarize_document","source":"nume curs din bibliotecă"}  // rezumat structurat pentru examen al unui curs din bibliotecă',
    '- create_study_plan: {"action":"create_study_plan","examName":"Numele examenului","studyDays":N,"hoursPerDay":N}  // plan de studiu personalizat bazat pe biblioteca curentă și SM-2',
    '- move_quiz: {"action":"move_quiz","quiz":"titlu set","folder":"nume folder"}',
    '- rename_quiz: {"action":"rename_quiz","quiz":"titlu actual","newName":"titlu nou"}',
    '- delete_quiz: {"action":"delete_quiz","quiz":"titlu set"}',
    '- rename_folder: {"action":"rename_folder","name":"nume actual","newName":"nume nou"}',
    '- delete_folder: {"action":"delete_folder","name":"nume folder"}',
    '',
    'Reguli:',
    '- Folderele de mai jos pot fi imbricate: un folder scris ca „Parinte / Copil" înseamnă că „Copil" e subfolder al lui „Parinte". Ca să pui ceva într-un subfolder, folosește exact numele subfolderului (ex. „Copil") la câmpul "folder". Ca să creezi un subfolder nou, folosește create_folder cu "parent" = numele folderului părinte.',
    '- Dacă userul cere generare într-un folder care nu există, adaugă întâi un pas create_folder, apoi generate_quiz_pack cu același "folder".',
    '- "flashcard"/"flashcarduri"/"flascarduri"/"carduri"/"fișe" cerute explicit → flashcarduri, NU grile. "count" = numărul cerut (implicit 15).',
    '- Dacă userul NUMEȘTE un curs din bibliotecă → create_flashcards. Dacă cere flashcarduri pe un subiect/temă, sau nu numește niciun curs → create_flashcards_topic. NU pune isCommand:false doar pentru că nu există curs în bibliotecă.',
    '- "greșeli"/"greșesc"/"unde greșesc"/"recapitulare greșeli"/"din ce am greșit" → generate_from_mistakes (NU cere sursă; folosește banca de greșeli).',
    '- "rezumă"/"rezumat"/"sinteză" pentru un curs din bibliotecă → summarize_document.',
    '- "complement multiplu"/"răspunsuri multiple"/"mai multe răspunsuri corecte" → questionType:"multiple". "complement simplu"/"un singur răspuns" → questionType:"single". Implicit "single".',
    `- "examStyle" alege formatul: "residency" = grile ca la rezidențiat, cu 5 variante (A-E); "simple" = grilă clasică de facultate, cu 4 variante (A-D). Implicit (dacă userul nu cere clar unul din cele două): "${contextStyle}" — asta pentru că ${contextStyle === 'residency' ? 'userul discută în secțiunea Rezidențiat' : 'userul discută în afara secțiunii Rezidențiat'}. Pune celălalt format DOAR dacă userul cere explicit (ex. "rezidențiat"/"ca la examen" → residency; "grile simple"/"pentru facultate" → simple).`,
    '- "grilă"/"grile"/"întrebări"/"întrebare" = NUMĂRUL DE ÎNTREBĂRI (questionsPerPack). "set"/"seturi"/"pachet"/"pachete" = NUMĂRUL DE PACHETE (packCount).',
    '- IMPLICIT packCount = 1. Pune packCount > 1 DOAR dacă userul cere explicit mai multe "seturi"/"pachete", SAU dacă numărul de întrebări depășește 60 (abia atunci împarte în pachete de maxim 60 fiecare).',
    '- NU inventa numere și NU exagera. Exemple: "2 grile" → packCount:1, questionsPerPack:2. "10 întrebări" → packCount:1, questionsPerPack:10. "3 seturi a câte 20" → packCount:3, questionsPerPack:20. "150 de grile" → packCount:3, questionsPerPack:50.',
    '- Atenție: un număr lângă numele cursului (ex. "Cursul 2") NU e un număr de grile, e parte din numele cursului.',
    '- Pentru generare de grile: dacă userul NUMEȘTE un curs/sursă și acesta EXISTĂ în bibliotecă (lista de mai jos), folosește generate_quiz_pack. Dacă userul cere grile pe un SUBIECT/temă generală (nu numește un curs, sau cursul numit nu există), folosește generate_quiz_topic cu "topic" = subiectul cerut — NU pune isCommand:false doar pentru că nu există curs în bibliotecă; AI-ul poate genera din cunoștințe medicale generale.',
    '- Folosește isCommand:false DOAR când mesajul chiar nu e o comandă de acțiune (întrebare normală, conversație), nu când lipsește un curs din bibliotecă.',
    '- "topic" (la generate_quiz_topic și create_flashcards_topic) trebuie să fie MEREU un subiect medical concret. Dacă userul face referire la conversație („despre subiectul discutat", „din tema de mai sus", „despre asta", „ce am vorbit acum"), înlocuiește referința cu subiectul real din mesajele anterioare (ex. „embolia pulmonară"). NU scrie niciodată „subiectul discutat", „tema de mai sus" sau alt text-referință în câmpul "topic".',
    '- Dacă referința nu poate fi rezolvată din conversație, pune isCommand:false, needsClarification:true și cere clarificare în "reply".',
    '- „Bagă-le / pune-le / mută-le în folderul X” fără să numească un set: „le” = cel mai recent set creat, adică PRIMUL titlu din „Seturi existente” (lista e în ordinea recenței). Folosește move_quiz cu acel titlu și folderul X. Dacă folderul nu e numit, pune isCommand:false, needsClarification:true și întreabă în „reply” în ce folder.',
    '',
    `Cursuri în bibliotecă: ${sources.length ? sources.join(' | ') : '(niciunul)'}`,
    `Foldere grile: ${quizFolderNames.length ? quizFolderNames.join(' | ') : '(niciunul)'}`,
    `Foldere bibliotecă: ${libFolderNames.length ? libFolderNames.join(' | ') : '(niciunul)'}`,
    `Seturi existente: ${quizTitles.length ? quizTitles.join(' | ') : '(niciunul)'}`,
  ].join('\n');
}

/**
 * Topics that are references to the conversation, not subjects: "grile despre
 * subiectul discutat". Generating on such a string produces garbage questions
 * (or a failed validation), so they are resolved against the thread first.
 */
export const REFERENTIAL_TOPIC_RE = new RegExp(
  '^(?:acest[ai]?\\s+|acel[ai]?\\s+|acelasi\\s+|aceeasi\\s+)?' +
  '(?:subiect(?:ul)?|tema|tem[ăa]|capitol(?:ul)?|materi[ae]|noti(?:unea|unile)|chestia|lucrul)?\\s*' +
  '(?:discutat[ăa]?|dezbatut[ăa]?|de mai sus|de dinainte|de dinaintea|anterior[ăa]?|precedent[ăa]?|curent[ăa]?|' +
  'de care am (?:vorbit|discutat)|despre care am (?:vorbit|discutat)|de care vorbeam|de care discutam|' +
  'de aici|de sus|de adineauri|asta|aceasta|acesta|ast[ae]a)\\.?$',
  'i',
);

export function stripDiacritics(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function isReferentialTopic(topic: string | undefined): boolean {
  const cleaned = stripDiacritics((topic ?? '').trim().toLowerCase()).replace(/\s+/g, ' ');
  if (!cleaned) return true;
  if (/^(?:ce|despre ce) am (?:vorbit|discutat)/.test(cleaned)) return true;
  // "acelasi subiect" / "aceeasi tema" — a bare demonstrative + noun, no tail.
  if (/^(?:acelasi|aceeasi|acest|aceasta|acel|acea)\s+(?:subiect|tema|capitol|materie|lucru)(?:ul|a)?$/.test(cleaned)) return true;
  return REFERENTIAL_TOPIC_RE.test(cleaned);
}

/**
 * Asks the model what the thread was actually about, so "fă-mi grile despre
 * subiectul discutat" becomes a real subject. Returns null when the
 * conversation gives nothing concrete — the caller then falls back to chat
 * instead of generating questions about a placeholder.
 */
export async function resolveDiscussedTopic(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<string | null> {
  const transcript = history
    .filter((turn) => turn.content && turn.content.trim())
    .slice(-6)
    .map((turn) => `${turn.role === 'user' ? 'Student' : 'Asistent'}: ${turn.content.slice(0, 900)}`)
    .join('\n\n');
  if (!transcript.trim()) return null;

  let raw: string;
  try {
    raw = await groqRequest({
      task: 'analysis',
      messages: [
        {
          role: 'system',
          content: [
            'Primești ultima parte a unei conversații de studiu medical.',
            'Spune care este subiectul medical concret discutat, în maximum 8 cuvinte, în română.',
            'Răspunde DOAR cu subiectul, fără ghilimele, fără explicații și fără propoziții.',
            'Dacă nu există un subiect medical clar, răspunde exact: NONE',
          ].join('\n'),
        },
        { role: 'user', content: transcript },
      ],
      temperature: 0,
      maxTokens: 40,
      skipLibraryContext: true,
    });
  } catch {
    return null;
  }

  const topic = raw
    .replace(/["'`*]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!topic || /^none$/i.test(topic)) return null;
  // The prompt asks for at most 8 words; anything longer is a sentence, i.e. the
  // model ignored the format and the "topic" would poison the generator.
  if (topic.length < 3 || topic.split(/\s+/).length > 8) return null;
  if (isReferentialTopic(topic)) return null;
  return topic;
}

export async function planAgentCommand(
  command: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  contextStyle: ExamStyle = DEFAULT_EXAM_STYLE,
): Promise<AgentPlan> {
  const system = buildPlannerPrompt(contextStyle);
  // Feed the recent turns so follow-ups ("mai încearcă", "acum în Hematologie")
  // resolve against the previous request instead of being planned in isolation.
  const recentTurns = history
    .filter((turn) => turn.content && turn.content.trim())
    .slice(-6)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 600) }));
  // JSON mode + zod: a malformed plan is repaired once, and a plan that stays unreadable
  // degrades to "not a command" (the message is then answered as normal chat).
  const planned = await requestStructured({
    schema: AgentPlanSchema,
    schemaHint: '{"isCommand":true|false,"needsClarification":true|false,"reply":"...","steps":[{"action":"<una dintre acțiunile permise>", ...parametri}]}',
    label: 'agentPlan',
    task: 'analysis',
    messages: [
      { role: 'system', content: system },
      ...recentTurns,
      { role: 'user', content: command },
    ],
    temperature: 0.1,
    maxTokens: 1200,
    skipLibraryContext: true,
  });
  if (!planned.ok) {
    logAIDebug('agentPlan:unreadable', planned.error);
    return { isCommand: false, reply: '', steps: [], needsConfirm: false };
  }
  const parsed = planned.data;
  const steps = parsed.steps;

  // Deterministic correction: the planner often miscounts ("3 grile" → 3×10)
  // and drops the question type, so override generate_quiz_pack steps with what
  // the user literally wrote whenever the wording is unambiguous.
  // The two tracks matter enough not to leave them to the planner's judgement:
  // "grile de rezidentiat" and "grile simple pentru materie" are read straight
  // from the user's wording, exactly like the counts below.
  // Explicit wording always wins; absent that, fall back to the section the
  // user is actually chatting from (Rezidențiat vs. general) instead of a
  // hardcoded default — a "10 grile despre X" asked outside Rezidențiat must
  // not silently produce a set tagged 'rezidentiat' and hidden from "Toate grilele".
  const requestedStyle = detectExamStyle(command) ?? contextStyle;
  for (const step of steps) {
    if (step.action === 'generate_quiz_pack' || step.action === 'generate_quiz_topic' || step.action === 'generate_from_mistakes') {
      step.examStyle = requestedStyle;
    }
  }

  // The planner sometimes invents a destination ("Grile") the user never mentioned, and the
  // content then silently lands in whatever folder happens to carry that name. A folder is
  // only honoured when the request itself names it; otherwise the placement rules decide.
  const spokenCommand = ` ${normalizeName(command)} `;
  for (const step of steps) {
    const generates = step.action === 'generate_quiz_pack' || step.action === 'generate_quiz_topic'
      || step.action === 'generate_from_mistakes' || step.action === 'create_flashcards_topic';
    if (generates && step.folder && !spokenCommand.includes(` ${normalizeName(step.folder)} `)) {
      step.folder = undefined;
    }
  }

  // Also covers the *_topic variants (generate_quiz_topic, create_flashcards_topic) —
  // used whenever the subject isn't a matched library course, which is the common
  // case for a freeform "fă-mi N grile despre X". They used to be skipped here, so
  // a literal count the user typed ("100 de grile") got silently overwritten by
  // whatever the planner guessed, with no confirmation even for a huge request —
  // clamping happens here too (not just at execution) so the confirm card below
  // shows the number that will actually be generated, not one that quietly
  // shrinks again afterward.
  const intent = extractQuizIntent(command);
  if (intent.packCount || intent.questionsPerPack || intent.questionType) {
    for (const step of steps) {
      if (step.action === 'generate_from_mistakes') {
        if (intent.questionsPerPack !== undefined) step.count = clampStudioQuestionCount(intent.questionsPerPack);
        if (intent.questionType !== undefined) step.questionType = intent.questionType;
      } else if (step.action === 'generate_quiz_pack') {
        if (intent.questionsPerPack !== undefined) step.questionsPerPack = clampStudioQuestionCount(intent.questionsPerPack);
        if (intent.packCount !== undefined) step.packCount = clampStudioPackCount(intent.packCount);
        if (intent.questionType !== undefined) step.questionType = intent.questionType;
      } else if (step.action === 'generate_quiz_topic') {
        // Single-pack mode — a "N seturi" phrasing doesn't apply here (no pack loop),
        // so only the per-request question count is corrected.
        if (intent.questionsPerPack !== undefined) step.questionsPerPack = clampStudioQuestionCount(intent.questionsPerPack);
        if (intent.questionType !== undefined) step.questionType = intent.questionType;
      } else if (step.action === 'create_flashcards_topic') {
        if (intent.questionsPerPack !== undefined) step.count = clampStudioQuestionCount(intent.questionsPerPack);
      }
    }
  }

  // The planner is told to copy the topic verbatim, so "grile despre subiectul
  // discutat" arrives as a placeholder. Resolve it against the thread; if the
  // conversation offers nothing concrete, drop the step rather than generate
  // questions about the phrase itself.
  const referential = steps.filter(
    (step) => (step.action === 'generate_quiz_topic' || step.action === 'create_flashcards_topic')
      && isReferentialTopic(step.topic),
  );
  let droppedReferentialTopic = false;
  if (referential.length > 0) {
    const resolved = await resolveDiscussedTopic([...recentTurns, { role: 'user', content: command }]);
    for (const step of referential) {
      if (resolved) {
        step.topic = resolved;
      } else {
        steps.splice(steps.indexOf(step), 1);
        droppedReferentialTopic = true;
      }
    }
  }

  const isCommand = parsed.isCommand && steps.length > 0;
  // Dropping an unresolved referential topic can empty out an otherwise valid
  // plan without the planner itself ever having flagged the ambiguity — treat
  // that the same as an explicit needsClarification, or the user's "fă-mi
  // grile despre asta" silently falls through to being answered as chit-chat.
  const needsClarification = parsed.needsClarification || (droppedReferentialTopic && steps.length === 0);
  const clarificationReply = typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply
    : (needsClarification ? 'Despre ce curs sau subiect vrei să continui?' : '');

  const totalQuestions = steps
    .reduce((sum, step) => {
      if (step.action === 'generate_quiz_pack') return sum + (step.packCount ?? 1) * (step.questionsPerPack ?? 10);
      if (step.action === 'generate_quiz_topic') return sum + (step.questionsPerPack ?? 10);
      if (step.action === 'create_flashcards') return sum + (step.count ?? 15);
      if (step.action === 'create_flashcards_topic') return sum + (step.count ?? 15);
      if (step.action === 'generate_from_mistakes') return sum + (step.count ?? 10);
      return sum;
    }, 0);
  const hasDestructive = steps.some((step) => DESTRUCTIVE_ACTIONS.includes(step.action));
  // Below QUESTION_CONFIRM_THRESHOLD in total but still a large ask on a
  // freeform (ungrounded) topic — surface it before generating, not after,
  // so a misread subject costs a confirm click instead of a wasted batch.
  const largeTopicStep = steps.find((step) => (
    (step.action === 'generate_quiz_topic' && (step.questionsPerPack ?? 10) > TOPIC_CONFIRM_THRESHOLD)
    || (step.action === 'create_flashcards_topic' && (step.count ?? 15) > TOPIC_CONFIRM_THRESHOLD)
  ));
  const needsConfirm = isCommand && (hasDestructive || totalQuestions > QUESTION_CONFIRM_THRESHOLD || Boolean(largeTopicStep));
  const confirmReason = hasDestructive
    ? 'Comanda include ștergeri.'
    : totalQuestions > QUESTION_CONFIRM_THRESHOLD
      ? `Generare mare (~${totalQuestions} întrebări) — poate dura.`
      : largeTopicStep
        ? `Generare mare pe subiect liber („${largeTopicStep.topic}", ~${largeTopicStep.action === 'generate_quiz_topic' ? largeTopicStep.questionsPerPack : largeTopicStep.count} ${largeTopicStep.action === 'generate_quiz_topic' ? 'întrebări' : 'carduri'}) — verifică tema înainte să generez.`
        : undefined;

  return {
    isCommand,
    reply: needsClarification ? clarificationReply : (typeof parsed.reply === 'string' ? parsed.reply : ''),
    steps,
    needsConfirm,
    confirmReason,
    needsClarification,
  };
}
