/**
 * Modelele mai scriu uneori, într-un bloc ```schema, un „arbore” de text în loc de formatul compact al aplicației:
 * pași numerotați cu emoji (1️⃣, 2️⃣), ramuri cu ├─► / └─► și trimiteri de tipul „Da → 2️⃣”. Parserul le-ar desena ca pași
 * fără sens („1️⃣ Simetrie…”, „Da”, „2️⃣”). Aici se convertesc în formatul compact: pașii numerotați devin noduri,
 * ramurile „Da/Nu/etichetă →” devin ramuri, iar trimiterea la un alt pas îl așază ca fiu al ramurii (o singură dată).
 * Textul care nu arată așa trece neschimbat.
 */

const KEYCAP = /[0-9]️?⃣/;
const KEYCAP_ALL = /[0-9]️?⃣/g;
const TREE_GLYPH = /[├└│┌┐┘┤]|─►|─+>|└─/;
const ARROW = /\s*(?:→|->|=>|➔|➜)\s*/;
const MAX_STEPS = 24;

interface Branch {
  label?: string;
  /** Numărul pasului la care duce ramura, sau textul unui rezultat. */
  stepNo?: number;
  text?: string;
}

interface LooseStep {
  no: number;
  label: string;
  branches: Branch[];
}

/** Elimină decorul (glyphuri de arbore, marcaje markdown, emoji-cifre) dintr-un fragment de text. */
function clean(value: string): string {
  return value
    .replace(KEYCAP_ALL, '')
    .replace(/[├└│┌┐┘┤─►]+/g, ' ')
    .replace(/[*_`]{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stepNumberOf(fragment: string): number | null {
  const match = new RegExp(`^\\s*(?:\\W*)(${KEYCAP.source})\\s*$`).exec(fragment);
  if (!match) return null;
  return Number(match[1].replace(/\D/g, ''));
}

/** O ramură din „Da → 2️⃣” sau „Alte manifestări → Susțin, dar nu exclusive”. */
function branchFrom(parts: string[]): Branch {
  if (parts.length < 2) return { text: clean(parts[0] ?? '') };
  const label = clean(parts[0]);
  const targetNo = stepNumberOf(parts[parts.length - 1]);
  if (targetNo !== null) return { ...(label ? { label } : {}), stepNo: targetNo };
  const text = parts.slice(1).map(clean).filter(Boolean).join(' → ');
  return label ? { label, text } : { text };
}

function parseLoose(source: string): LooseStep[] | null {
  const steps: LooseStep[] = [];
  let current: LooseStep | null = null;
  for (const raw of source.split('\n')) {
    if (!raw.trim()) continue;
    const startsStep = KEYCAP.test(raw.trimStart().slice(0, 4)) || /^\s*\d{1,2}[.)]\s+/.test(raw);
    const isSubLine = /^\s*[├└│]/.test(raw) || /^\s{2,}(?:─►|→|->)/.test(raw);
    const stepNo = (() => {
      const keycap = KEYCAP.exec(raw.trimStart().slice(0, 4));
      if (keycap) return Number(keycap[0].replace(/\D/g, ''));
      const plain = /^\s*(\d{1,2})[.)]\s+/.exec(raw);
      return plain ? Number(plain[1]) : steps.length + 1;
    })();

    if (startsStep && !isSubLine) {
      const parts = raw.replace(/^\s*(?:[0-9]️?⃣|\d{1,2}[.)])\s*/, '').split(ARROW);
      const label = clean(parts[0] ?? '');
      if (!label) continue;
      current = { no: stepNo, label, branches: [] };
      steps.push(current);
      // „1️⃣ Pas? → Da → 2️⃣” pe aceeași linie: ramura vine după etichetă.
      if (parts.length >= 2) current.branches.push(branchFrom(parts.slice(1)));
      continue;
    }
    if (!current) continue;
    // Linie de ramură sub un pas: „├─► Da → 2️⃣”, „└─ Dacă nu → reevaluează”.
    const body = raw.replace(/^[\s├└│┌┐┘┤─►>]+/, '');
    if (!body.trim()) continue;
    const parts = body.split(ARROW);
    current.branches.push(branchFrom(parts));
  }
  return steps.length >= 2 ? steps : null;
}

/** Eticheta unei ramuri trebuie să rămână scurtă (aplicația o taie la 28 de caractere): una lungă devine un pas de sine stătător. */
const MAX_BRANCH_LABEL = 26;
const toBranchLabel = (label: string) => /^(da|nu)$/i.test(label) ? label.toLowerCase() : `[${label}]`;

function emit(steps: LooseStep[]): string {
  const byNo = new Map(steps.map((step) => [step.no, step]));
  const placed = new Set<number>();
  const out: string[] = [];
  let count = 0;

  const line = (depth: number, branch: string | undefined, text: string) => {
    count += 1;
    out.push(`${'  '.repeat(depth)}${branch ? `${branch}> ` : ''}${text}`);
  };
  const mark = (label: string) => (label.trimEnd().endsWith('?') ? '? ' : '. ');

  const place = (step: LooseStep, depth: number, branch: string | undefined) => {
    if (count >= MAX_STEPS) return;
    placed.add(step.no);
    line(depth, branch, `${mark(step.label)}${step.label}`);
    for (const next of step.branches) {
      const label = next.label ? toBranchLabel(next.label) : undefined;
      if (next.stepNo !== undefined && byNo.has(next.stepNo)) {
        const target = byNo.get(next.stepNo)!;
        // Fiecare pas se așază o singură dată; o a doua trimitere la el devine doar o ramură cu numele lui.
        if (!placed.has(target.no)) place(target, depth + 1, label ?? 'da');
        else line(depth + 1, label ?? 'da', `. ${target.label}`);
      } else if (next.text) {
        if (next.label && next.label.length > MAX_BRANCH_LABEL) line(depth + 1, undefined, `. ${next.label} -> ${next.text}`);
        else line(depth + 1, label, `. ${next.text}`);
      } else if (next.label) {
        line(depth + 1, undefined, `. ${next.label}`);
      }
    }
  };

  // Rădăcinile: pașii la care nu duce nicio ramură (de obicei primul).
  const referenced = new Set(steps.flatMap((step) => step.branches.map((branch) => branch.stepNo).filter((no): no is number => no !== undefined)));
  const roots = steps.filter((step) => !referenced.has(step.no));
  for (const root of roots.length ? roots : [steps[0]]) if (!placed.has(root.no)) place(root, 0, undefined);
  for (const step of steps) if (!placed.has(step.no)) place(step, 0, undefined);
  return out.join('\n');
}

/** Convertește schema „arbore de text” în formatul compact; orice altceva întoarce neschimbat. */
export function normalizeLooseSchema(source: string): string {
  if (!KEYCAP.test(source) && !TREE_GLYPH.test(source)) return source;
  const steps = parseLoose(source);
  return steps ? emit(steps) : source;
}
