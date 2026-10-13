import { logAIDebug } from '../../ai/debug';
import { getMedicalSystemPrompt } from '../aiContext';
import { QuestionsBatchSchema, parseStructuredReply } from '../ai/schemas';
import { buildQuestionTypeInstruction, type QuestionType } from '../ai/questionTypes';
import { groqChat } from './requests';
import type { GroqMessage } from './types';

export interface GeneratedQuestion {
  text: string;
  options: { text: string; isCorrect: boolean }[];
  explanation?: string;
  tags?: string[];
  reference?: string;
  type?: QuestionType;
}

export function detectLanguage(text: string): string {
  const s = text.slice(0, 500).toLowerCase();
  if (/\b(și|sau|este|sunt|nu|cu|de|în|la|pe|pentru|că|care|din|prin)\b/.test(s)) return 'română';
  if (/\b(et|ou|est|sont|ne|pas|avec|de|dans|pour|que|qui|du|par)\b/.test(s)) return 'franceză';
  if (/\b(und|oder|ist|sind|nicht|mit|von|in|für|das|die|der|den)\b/.test(s)) return 'germană';
  return 'engleză';
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isDuplicateQuestion(newText: string, existingTexts: string[]): boolean {
  const norm = newText.toLowerCase().trim().slice(0, 120);
  return existingTexts.some(existing => {
    const e = existing.toLowerCase().trim().slice(0, 120);
    const maxLen = Math.max(norm.length, e.length);
    if (maxLen === 0) return false;
    const dist = levenshtein(norm, e);
    return (1 - dist / maxLen) > 0.8;
  });
}

// ── Anti-Hallucination Validator ──────────────────────────────────────────────
// Ensures AI output is coherent: exactly 1 correct option, non-empty, non-duplicate options.
export function isValidQuestion(q: GeneratedQuestion): boolean {
  if (!q.text?.trim() || !Array.isArray(q.options) || q.options.length < 2) return false;
  // Reject a stem that is ABOUT the output format ("returnează în format JSON"),
  // not any stem that merely contains those words. The old substring test threw
  // away perfectly good medical questions — "Din ce este format nefronul?" is
  // ordinary Romanian, and every such question vanished silently.
  if (/\b(format|formatul)\s+(json|de\s+r[aă]spuns)\b|\bjson\b/i.test(q.text)) return false;

  const corrects = q.options.filter(o => o.isCorrect === true);
  // Hallucination check 1: must have exactly one correct option
  if (corrects.length !== 1) return false;
  // Hallucination check 2: correct option must have non-empty text
  if (!corrects[0].text?.trim()) return false;
  // Hallucination check 3: every option needs real text. An empty distractor
  // used to be skipped by the duplicate scan below and so passed validation,
  // leaving a blank choice in a saved quiz.
  if (q.options.some(o => !o.text?.trim())) return false;

  // Hallucination check 4: no two options may say the same thing — previously
  // only distractor-vs-correct was compared, so the AI could repeat the same
  // wrong answer twice and it was accepted.
  const normalized = q.options.map(o => o.text.toLowerCase().trim());
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const maxLen = Math.max(normalized[i].length, normalized[j].length);
      if (maxLen === 0) return false;
      if (levenshtein(normalized[i], normalized[j]) / maxLen < 0.07) return false; // >93% identical
    }
  }
  return true;
}

// ── Smart Context Chunking ────────────────────────────────────────────────────
// Splits long medical texts into overlapping chunks that fit within the AI context window.
export function chunkText(text: string, maxSize = 4500, overlap = 350, maxChunks = 4): string[] {
  if (text.length <= maxSize) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(start + maxSize, text.length);
    if (end < text.length) {
      // Prefer natural paragraph/sentence breaks over arbitrary cuts
      const floor = start + Math.floor(maxSize * 0.55);
      const breakAt = [
        text.lastIndexOf('\n\n', end),
        text.lastIndexOf('\n', end),
        text.lastIndexOf('. ', end),
        text.lastIndexOf(' ', end),
      ].find(p => p > floor && p > -1);
      if (breakAt !== undefined) end = breakAt + 1;
    }
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ── Question Generation (with chunking + anti-hallucination) ──────────────────
export async function generateQuestionsFromText(
  text: string,
  count = 5,
  difficulty = 3,
  existingQuestionTexts: string[] = [],
  onProgress?: (generated: number, total: number) => void,
  questionTypes?: QuestionType[],
): Promise<GeneratedQuestion[]> {
  const cleanText = text
    .replace(/\f/g, '\n').replace(/^\s*\d{1,4}\s*$/gm, '')
    .replace(/[ \t]{3,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  if (cleanText.length < 80)
    throw new Error('Textul extras din PDF este prea scurt. Încearcă un alt PDF sau un fișier text.');

  const language = detectLanguage(cleanText);
  const diffMap: Record<number, string> = {
    1: 'UȘOR: întrebări directe, terminologie de bază.',
    2: 'UȘOR-MEDIU: concepte de bază cu raționament simplu.',
    3: 'MEDIU: mix memorare și raționament clinic standard.',
    4: 'DIFICIL: raționament complex, diagnostice diferențiale, capcane subtile.',
    5: 'EXPERT: termeni medicali rari, capcane sofisticate, prezentări atipice — nivel rezidențiat.',
  };
  const difficultyInstruction = diffMap[Math.max(1, Math.min(5, difficulty))] ?? diffMap[3];
  const systemPrompt = getMedicalSystemPrompt('examiner') +
    `\nCreezi întrebări EXCLUSIV din textul primit. LIMBĂ: ${language}. DIFICULTATE: ${difficultyInstruction}`;

  // ── Smart chunking: split long texts into digestible pieces ──────────────────
  const chunks = chunkText(cleanText, 6500, 400, Math.max(2, Math.min(10, Math.ceil(count / 10))));
  const perChunk = Math.max(1, Math.ceil(count / chunks.length));

  const allQuestions: GeneratedQuestion[] = [];
  const seenTexts: string[] = [...existingQuestionTexts];

  for (const chunk of chunks) {
    if (allQuestions.length >= count) break;
    const needed = Math.min(perChunk, count - allQuestions.length);
    const typeInstruction = questionTypes && questionTypes.length > 0
      ? `\n${buildQuestionTypeInstruction(needed, questionTypes)}`
      : '';
    const typeFormatField = questionTypes && questionTypes.length > 0 ? ',"type":""' : '';

    const userPrompt = `Creează exact ${needed} întrebări grilă bazate EXCLUSIV pe textul de mai jos.

REGULI:
- Un singur răspuns corect (isCorrect: true), 3 distractori plauzibili
- Distractori: din ACEEAȘI categorie, lungime similară cu răspunsul corect, plauzibili medical dar greșiți; NU folosi "toate de mai sus", "niciunul", "ambele A și B"
- Câmp "explanation": justificare medicală (2-3 fraze): de ce varianta corectă e corectă + de ce fiecare distractor e greșit
- Câmp "tags": 3-5 cuvinte cheie ex: ["cardiologie","fibrilație"]
- Câmp "reference": referință Harrison/Gomella sau "" dacă nu există
- NU genera întrebări despre JSON/format
- Răspunde DOAR cu JSON pur, fără markdown${typeInstruction}

TEXT:
---
${chunk.slice(0, 5000)}
---

Format (${needed} obiecte):
[{"text":"?","options":[{"text":"A","isCorrect":false},{"text":"B","isCorrect":true},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false},{"text":"E","isCorrect":false}],"explanation":"...","tags":["tag"],"reference":""${typeFormatField}}]`;
    logAIDebug('generateQuestionsFromText.prompt', { questionTypes, needed, userPrompt });

    let raw = '';
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const msgs: GroqMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      if (attempt > 0) {
        msgs.push({ role: 'assistant', content: raw });
        msgs.push({ role: 'user', content: `Eroare JSON: ${lastError}. Returnează DOAR array JSON valid.` });
      }
      try {
        raw = await groqChat(msgs, 0.2, { skipLibraryContext: true, task: 'questions' });
        // The prompt asks for a bare array, so no JSON mode here; the schema decides if the reply is usable
        // and, when it is not, its message goes back to the model on the next attempt.
        const check = parseStructuredReply(raw, QuestionsBatchSchema);
        if (check.ok) break;
        lastError = check.error;
      } catch (e: unknown) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt === 2 && allQuestions.length === 0)
          throw new Error(`Eroare API după 3 încercări: ${lastError}`);
      }
    }

    const structured = parseStructuredReply(raw, QuestionsBatchSchema);
    if (!structured.ok) {
      logAIDebug('generateQuestionsFromText:invalid', structured.error);
      continue; // bad chunk — try next
    }
    // Elements the schema could not salvage were already dropped one by one.
    const parsed: GeneratedQuestion[] = structured.data.questions;

    // ── Anti-hallucination filter + deduplication ────────────────────────────
    const valid = parsed
      .filter(isValidQuestion)
      .filter(q => !isDuplicateQuestion(q.text, seenTexts));

    valid.forEach(q => seenTexts.push(q.text));
    allQuestions.push(...valid);
    onProgress?.(Math.min(allQuestions.length, count), count);
  }

  // ── Silent regeneration pass ──────────────────────────────────────────────
  // If we're still short, make one more targeted call emphasizing the gap.
  if (allQuestions.length < count && chunks.length > 0) {
    const missing = count - allQuestions.length;
    const avoidHint = seenTexts.slice(0, 3).map(t => t.slice(0, 60)).join(' | ');
    const regenPrompt = `Creează exact ${missing} întrebări grilă SUPLIMENTARE din textul de mai jos.
IMPORTANT: Întrebările trebuie să fie COMPLET DIFERITE de: "${avoidHint}"

TEXT:
---
${chunks[0].slice(0, 5000)}
---

Format: [{"text":"?","options":[{"text":"A","isCorrect":false},{"text":"B","isCorrect":true},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false},{"text":"E","isCorrect":false}],"explanation":"...","tags":[],"reference":""}]`;

    try {
      const regenRaw = await groqChat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: regenPrompt },
      ], 0.35, { skipLibraryContext: true, task: 'questions' });
      const regenStructured = parseStructuredReply(regenRaw, QuestionsBatchSchema);
      if (regenStructured.ok) {
        const regenParsed: GeneratedQuestion[] = regenStructured.data.questions;
        const regenValid = regenParsed
          .filter(isValidQuestion)
          .filter(q => !isDuplicateQuestion(q.text, seenTexts));
        allQuestions.push(...regenValid);
      }
    } catch { /* silent — partial results are better than a total failure */ }
  }

  if (allQuestions.length === 0)
    throw new Error('Răspuns AI invalid — încearcă din nou sau verifică textul PDF.');

  return allQuestions.slice(0, count);
}

export async function generateClinicalCase(
  text: string,
  count = 3
): Promise<GeneratedQuestion[]> {
  const cleanText = text
    .replace(/\f/g, '\n').replace(/[ \t]{3,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);

  if (cleanText.length < 80)
    throw new Error('Textul este prea scurt pentru generarea de cazuri clinice.');

  const language = detectLanguage(cleanText);
  const userPrompt = `Creează ${count} cazuri clinice bazate EXCLUSIV pe textul de mai jos. Limbă: ${language}.

STRUCTURA OBLIGATORIE:
- "text": istoricul pacientului detaliat (sex, vârstă, simptome, analize) + întrebarea clinică
  Ex: "Pacient 45 ani, bărbat, dispnee 3 săptămâni, edeme gambiere. FCC=110. Rx: cardiomegalie. Diagnostic?"
- "options": 5 opțiuni (A-E), un singur răspuns corect — formatul de la rezidențiat
- "explanation": argumentare medicală (3-4 fraze)
- "tags": 3-5 cuvinte cheie
- "reference": Harrison/Gomella sau ""

TEXT:
---
${cleanText}
---

Format JSON pur (${count} cazuri):
[{"text":"Pacient...?","options":[{"text":"A","isCorrect":false},{"text":"B","isCorrect":true},{"text":"C","isCorrect":false},{"text":"D","isCorrect":false},{"text":"E","isCorrect":false}],"explanation":"...","tags":["tag"],"reference":""}]`;

  let raw = '';
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryNote = lastError
      ? `\n\nATENTIE: Ultima incercare a returnat un răspuns invalid (${lastError}). Returneaza STRICT un array JSON valid, fara text sau markdown in afara lui.`
      : '';
    try {
      raw = await groqChat([
        { role: 'system', content: getMedicalSystemPrompt('examiner') + '\nGenerează cazuri clinice EXCLUSIV din textul primit.' },
        { role: 'user', content: userPrompt + retryNote },
      ], 0.3, { skipLibraryContext: true, task: 'questions' });
      // Aceeași schemă lenientă ca la grile: acceptă JSON tăiat, virgule finale, chat în jur — nu doar JSON.parse brut.
      const check = parseStructuredReply(raw, QuestionsBatchSchema);
      if (check.ok) break;
      lastError = check.error;
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  const structured = parseStructuredReply(raw, QuestionsBatchSchema);
  if (!structured.ok) throw new Error('Nu s-a putut genera cazul clinic — încearcă din nou.');

  const parsed: GeneratedQuestion[] = structured.data.questions;
  const seenTexts: string[] = [];
  const valid = parsed
    .filter(isValidQuestion)
    .filter((q) => !isDuplicateQuestion(q.text, seenTexts));
  valid.forEach((q) => seenTexts.push(q.text));

  return valid.slice(0, count);
}
