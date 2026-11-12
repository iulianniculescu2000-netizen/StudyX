/**
 * „Studiază schema”: grile și flashcarduri construite local, determinist, din STRUCTURA unei scheme
 * din chat (ParsedDiagram), fără AI și fără cheie. Fișier pur: nu atinge store-urile.
 */
import { parseDiagram, type DiagramNode, type ParsedDiagram } from '../../components/ai-chat/diagram';
import { parseSchema } from '../../components/ai-chat/schemaDsl';
import type { Question } from '../../types';

export const MIN_SCHEMA_NODES = 4;
export const MAX_SCHEMA_QUESTIONS = 12;
const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'] as const;

export type StudyResult<T> = { ok: true; items: T[] } | { ok: false; message: string };

/** Parsează textul unei scheme (DSL `schema` sau mermaid flowchart). */
export function parseSchemaSource(code: string): ParsedDiagram | null {
  if (/^\s*(?:%%[^\n]*\n\s*)*(graph|flowchart)\b/.test(code)) return parseDiagram(code);
  return parseSchema(code) ?? parseDiagram(code);
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
const key = (text: string) => flat(text).toLocaleLowerCase('ro-RO');
const stripQ = (text: string) => flat(text).replace(/[?\s]+$/u, '');
const isDecision = (node: DiagramNode) => node.shape === 'decision' || /\?\s*$/.test(node.label);

/** O legătură de studiat: de la un pas, pe o ramură (opțională), la pasul următor. */
interface Step {
  from: DiagramNode;
  branch?: string;
  to: DiagramNode;
  /** Pașii care sunt alternative plauzibile la aceeași întrebare (celelalte ramuri). */
  siblings: DiagramNode[];
}

function collectSteps(diagram: ParsedDiagram): Step[] {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node]));
  const steps: Step[] = [];
  for (const node of diagram.nodes) {
    const out = diagram.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => ({ edge, to: byId.get(edge.to) }))
      .filter((entry): entry is { edge: typeof entry.edge; to: DiagramNode } => !!entry.to && entry.to.id !== node.id);
    if (out.length === 0) continue;
    if (isDecision(node)) {
      const labelled = out.filter((entry) => flat(entry.edge.label ?? ''));
      if (labelled.length < 2) continue; // o decizie are sens doar cu cel puțin două ramuri etichetate
      for (const entry of labelled) {
        steps.push({
          from: node,
          branch: flat(entry.edge.label ?? ''),
          to: entry.to,
          siblings: labelled.filter((other) => other !== entry).map((other) => other.to),
        });
      }
    } else if (out.length === 1) {
      steps.push({ from: node, to: out[0].to, siblings: [] });
    }
  }
  return steps;
}

const questionText = (step: Step) =>
  step.branch
    ? `Ce urmează dacă ${stripQ(step.from.label)} = ${step.branch}?`
    : `Ce urmează după ${stripQ(step.from.label)}?`;

const explanationFor = (step: Step) => {
  const base = step.branch
    ? `Din schemă: dacă ${stripQ(step.from.label)} = ${step.branch}, urmează ${flat(step.to.label)}.`
    : `Din schemă: după ${stripQ(step.from.label)} urmează ${flat(step.to.label)}.`;
  const note = flat(step.to.note ?? '');
  return note ? `${base} ${note}` : base;
};

/** Distractori distincți: întâi ramurile surori, apoi pași de același tip, apoi restul (fără decizii-întrebare). */
function pickDistractors(diagram: ParsedDiagram, step: Step, offset: number): string[] {
  const seen = new Set([key(step.to.label), key(step.from.label)]);
  const out: string[] = [];
  const take = (nodes: DiagramNode[]) => {
    const rotated = nodes.length ? [...nodes.slice(offset % nodes.length), ...nodes.slice(0, offset % nodes.length)] : nodes;
    for (const node of rotated) {
      const label = flat(node.label);
      if (!label || seen.has(key(label)) || out.length >= 4) continue;
      seen.add(key(label));
      out.push(label);
    }
  };
  take(step.siblings);
  take(diagram.nodes.filter((node) => node.shape === step.to.shape && node.id !== step.to.id));
  take(diagram.nodes.filter((node) => node.id !== step.to.id && !isDecision(node)));
  return out;
}

const tooSmall = (diagram: ParsedDiagram | null, min: number) => !diagram || diagram.nodes.length < min;

/** Grile (A–E, un singur răspuns corect) din decizii și lanțuri cauzale. */
export function buildSchemaQuestions(diagram: ParsedDiagram | null, newId: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)): StudyResult<Question> {
  if (!diagram || tooSmall(diagram, MIN_SCHEMA_NODES)) {
    return { ok: false, message: `Schema e prea mică pentru grile (are nevoie de cel puțin ${MIN_SCHEMA_NODES} pași).` };
  }
  const questions: Question[] = [];
  const seenText = new Set<string>();
  collectSteps(diagram).forEach((step, index) => {
    if (questions.length >= MAX_SCHEMA_QUESTIONS) return;
    const text = questionText(step);
    if (seenText.has(key(text))) return;
    const distractors = pickDistractors(diagram, step, index);
    if (distractors.length < 4) return;
    seenText.add(key(text));
    const labels = [...distractors];
    labels.splice(index % 5, 0, flat(step.to.label)); // poziția corectă variază, determinist
    questions.push({
      id: newId(),
      text,
      multipleCorrect: false,
      difficulty: step.branch ? 'medium' : 'easy',
      explanation: explanationFor(step),
      options: labels.map((label, position) => ({ id: OPTION_IDS[position], text: label, isCorrect: position === index % 5 })),
    });
  });
  if (questions.length === 0) {
    return { ok: false, message: 'Schema nu are destui pași diferiți pentru a forma variante de răspuns.' };
  }
  return { ok: true, items: questions };
}

/** Flashcarduri: față = pasul/decizia, verso = ce urmează / ramura. */
export function buildSchemaFlashcards(diagram: ParsedDiagram | null, newId: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12)): StudyResult<Question> {
  if (!diagram || diagram.nodes.length < 2) {
    return { ok: false, message: 'Schema e prea mică pentru flashcarduri.' };
  }
  const cards: Question[] = [];
  const seen = new Set<string>();
  for (const step of collectSteps(diagram)) {
    const front = step.branch
      ? `Dacă ${stripQ(step.from.label)} = ${step.branch}, ce urmează?`
      : `După ${stripQ(step.from.label)}, ce urmează?`;
    if (seen.has(key(front))) continue;
    seen.add(key(front));
    const note = flat(step.to.note ?? '');
    cards.push({
      id: newId(),
      text: front,
      multipleCorrect: false,
      difficulty: 'medium',
      explanation: note,
      options: [{ id: 'a', text: flat(step.to.label), isCorrect: true }],
    });
  }
  if (cards.length === 0) return { ok: false, message: 'Schema nu are pași legați între ei din care să fac flashcarduri.' };
  return { ok: true, items: cards };
}

/** Titlul schemei: antetul `# Titlu`, altfel primul pas. */
export function schemaTitle(diagram: ParsedDiagram | null): string {
  const raw = flat(diagram?.title ?? diagram?.nodes[0]?.label ?? '');
  return raw ? (raw.length > 60 ? `${raw.slice(0, 59).trimEnd()}…` : raw) : 'Schemă din chat';
}

/** Conținutul notiței: titlul + sursa schemei într-un bloc de cod (editabil ca text). */
export function schemaNoteText(title: string, code: string): string {
  return `${title}\n\n\`\`\`schema\n${code.trim()}\n\`\`\``;
}

/** Id stabil pentru notița unei scheme (aceeași schemă salvată de două ori înlocuiește notița). */
export function schemaNoteId(code: string): string {
  let hash = 5381;
  for (let i = 0; i < code.length; i += 1) hash = ((hash * 33) ^ code.charCodeAt(i)) >>> 0;
  return `schema-${hash.toString(36)}`;
}
