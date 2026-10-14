import { ZOOM_ATTR, isDiagramLanguage, renderDiagramBlock } from './diagram';
import { structureRawText } from './structure';

export type ChatMode = 'grounded' | 'explain' | 'summarize' | 'diagram' | 'test' | 'mnemonic';

export type Citation = {
  source: string;
  topic: string;
  score: number;
  excerpt: string;
  /** Numărul din `[n]` din răspuns, când citarea vine din contextul numerotat. */
  n?: number;
  sourceId?: string;
  /** Pagina PDF (de la 1) a cărții compilate. */
  page?: number;
  pageEnd?: number;
  /** Numărul tipărit pe pagină în carte. */
  printedPage?: number;
  heading?: string;
  /** Nivelul sursei: 'book' (carte de bază) sau 'bank' (material). Lipsește în scopul general și la mesajele vechi. */
  tier?: 'book' | 'bank' | 'general';
};

/** Starea unei cereri „fă-mi flashcarduri / grile”: ce a ales utilizatorul și cum a mers generarea. Doar JSON simplu, ca să se salveze cu mesajul. */
export interface OptionCard {
  id: string;
  kind: 'flashcards' | 'quiz';
  status: 'pending' | 'running' | 'done' | 'cancelled' | 'error';
  /** Spațiul din care vine cererea: hotărăște ce foldere se oferă și unde ajunge rezultatul. */
  space: 'general' | 'rezidentiat';
  topic: string;
  count: number;
  difficulty: import('../../ai/flashcardPrompts').FlashcardDifficulty;
  questionType: 'single' | 'multiple';
  folder: import('../../lib/rezidentiatFlashcardFolders').FolderChoice;
  /** După generare: unde se deschid rezultatele. */
  route?: { route: string; label: string };
}

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  /** The reply is a failure notice (provider down, limit…), not an answer: no Flashcard/quiz actions, offers retry. */
  isError?: boolean;
  citations?: Citation[];
  suggestions?: string[];
  mode?: ChatMode;
  /** True when `mode` was auto-detected from the message (not user-selected). */
  autoMode?: boolean;
  /** When set, this assistant message renders an agent job (plan/progress) card. */
  agentJobId?: string;
  /** When set, renders an "open" CTA that navigates to created content. */
  openRoute?: { route: string; label: string };
  /**
   * True when this user message carried a pasted image. The image itself is
   * never persisted (avoids bloating chat history / localStorage with base64
   * blobs), so "Regenerează" on the reply can't legitimately resend it — this
   * flag lets it detect that case and say so instead of silently resending
   * just the text half of the request.
   */
  hadImage?: boolean;
  /** Provider/model that actually wrote this answer (set after streaming), so a verifier can be a different one. */
  producer?: { provider: 'groq' | 'google' | 'mistral'; model: string };
  /** Răspunsul a venit de la AI-ul local (model mic): chatul arată o notă discretă. */
  localAnswer?: boolean;
  /** Răspunsul local avea probleme grave și a fost refăcut o dată pe cloud („completat cu cloud”). */
  completedWithCloud?: boolean;
  /** Răspunsul s-a oprit la limita de lungime (nu a terminat): chatul oferă „Continuă”. */
  truncated?: boolean;
  /** Cine a scris răspunsul (furnizor, model, local/cloud) și, la local, viteza: insigna de sub răspuns. */
  served?: import('./servedBadge').ServedInfo;
  /** Saved "Verifică cu alt model" verdict. */
  crossCheck?: import('./CrossCheckCard').CrossCheckSaved;
  /** Cerere de flashcarduri / grile care așteaptă alegerile utilizatorului (nivel, număr, folder). */
  optionCard?: OptionCard;
};

export type RecommendedAction = {
  mode: ChatMode;
  label: string;
  helper: string;
  prompt: string;
};

export const CHAT_MODES: Array<{
  id: ChatMode;
  label: string;
  shortLabel: string;
  description?: string;
  placeholder: string;
  emptyPrompts: string[];
}> = [
  {
    id: 'grounded',
    label: 'Context',
    shortLabel: 'Context',
    description: 'răspuns bazat pe biblioteca ta',
    placeholder: 'Întreabă-mă orice din cursurile tale...',
    emptyPrompts: [
      'Ce merită învățat prioritar din biblioteca mea?',
      'Găsește în curs ce pare frecvent cerut la examen.',
      'Ce părți par prea detaliate și improbabile pentru grile?',
      'Leagă tema asta de ce am greșit până acum.',
    ],
  },
  {
    id: 'explain',
    label: 'Explică',
    shortLabel: 'Explică',
    description: 'mecanisme pas cu pas, cu exemple clinice',
    placeholder: 'Ce concept medical vrei să înțelegi în profunzime?',
    emptyPrompts: [
      'Explică-mi mecanismul, apoi capcana de grilă.',
      'Explică-mi variantele unei grile: corect, greșite și când s-ar potrivi.',
      'Unde apar confuziile frecvente la tema asta?',
      'Dă-mi un exemplu clinic simplu.',
    ],
  },
  {
    id: 'summarize',
    label: 'Rezumă',
    shortLabel: 'Rezumă',
    description: 'comprimă cursul în idei-cheie pentru examen',
    placeholder: 'Ce capitol sau temă vrei comprimată pentru examen?',
    emptyPrompts: [
      'Rezumă documentul în 5 idei-cheie.',
      'Ce trebuie memorat neapărat pentru examen?',
      'Separă: foarte probabil, posibil, puțin probabil.',
      'Fă-mi o fișă scurtă pentru recapitulare.',
    ],
  },
  {
    id: 'diagram',
    label: 'Scheme',
    shortLabel: 'Scheme',
    placeholder: 'Ce temă vrei să transform în schemă?',
    emptyPrompts: [
      'Fă-mi o schemă logică din cursul curent.',
      'Transformă mecanismul într-o diagramă cu săgeți.',
      'Fă-mi un tabel diferențial între conceptele apropiate.',
      'Construiește un algoritm de diagnostic/tratament când se potrivește.',
    ],
  },
  {
    id: 'test',
    label: 'Testează',
    shortLabel: 'Testează',
    description: 'mini-quiz adaptat punctelor tale slabe',
    placeholder: 'Pe ce temă sau capitol vrei să fii testat acum?',
    emptyPrompts: [
      'Testează-mă din tema principală a bibliotecii mele.',
      'Dă-mi 3 întrebări scurte fără răspuns.',
      'Fă-mi un mini-quiz pe tema documentului curent.',
      'Verifică dacă știu diferențele esențiale.',
    ],
  },
  {
    id: 'mnemonic',
    label: 'Mnemonic',
    shortLabel: 'Mnemonic',
    description: 'asocieri vizuale și trucuri de memorare',
    placeholder: 'Ce concept greu vrei să memorezi cu un mnemonic?',
    emptyPrompts: [
      'Creează un mnemonic creativ pentru această temă.',
      'Dă-mi 3 mnemonice scurte și memorabile.',
      'Transformă noțiunile grele într-o asociere vizuală.',
      'Fă un mnemonic pentru diferențialul important.',
    ],
  },
];

// ── Markdown → HTML renderer ─────────────────────────────────────────────────
// Hand-rolled, dependency-free (this is an offline Electron app). Output is fed
// to dangerouslySetInnerHTML, so ALL user/model text is HTML-escaped before any
// transform runs. Theme-neutral colors (currentColor / rgba) so it adapts to
// light & dark without needing the theme object here.

const MD_BORDER = 'rgba(128,128,128,0.28)';
const MD_SOFT_BG = 'rgba(128,128,128,0.10)';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Inline-level formatting: code, bold, italic, links. Runs on already-escaped text. */
function formatInline(text: string) {
  let out = text;

  // Inline code first so its content is shielded from bold/italic transforms.
  out = out.replace(/`([^`]+?)`/g, (_match, code: string) =>
    `<code style="background:${MD_SOFT_BG};padding:1px 5px;border-radius:5px;font-size:0.88em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${code}</code>`,
  );

  // Safe links: [label](http(s)://...) only — never javascript:, data:, etc.
  out = out.replace(/\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label: string, href: string) =>
    `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:currentColor;text-decoration:underline;font-weight:600;">${label}</a>`,
  );

  // Models write literal <br> inside table cells to stack answer options; after
  // escaping it would show up as text, so restore it as the only allowed tag.
  out = out.replace(/&lt;br\s*\/?&gt;/gi, '<br/>');

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)([^*\n]{1,120}?)(?<!\s)\*([\s).,;:!?]|$)/g, '$1<em>$2</em>$3')
    .replace(/(^|[\s(])_(?!\s)([^_\n]{1,120}?)(?<!\s)_([\s).,;:!?]|$)/g, '$1<em>$2</em>$3');

  return out;
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderTable(header: string, rows: string[]) {
  const headCells = splitTableRow(header)
    .map((cell) => `<th style="text-align:left;padding:6px 10px;border:1px solid ${MD_BORDER};font-weight:800;background:${MD_SOFT_BG};">${formatInline(cell)}</th>`)
    .join('');
  const bodyRows = rows
    .map((row) => {
      const cells = splitTableRow(row)
        .map((cell) => `<td style="padding:6px 10px;border:1px solid ${MD_BORDER};vertical-align:top;">${formatInline(cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  // Wide comparison tables are unusable squeezed into the chat column, so they
  // scroll inside their own box and can be opened full-screen (see ZOOM_ATTR).
  return [
    `<div ${ZOOM_ATTR} style="overflow-x:auto;margin:10px 0;cursor:var(--cursor-zoom-in, zoom-in);">`,
    `<table style="border-collapse:collapse;font-size:0.92em;width:100%;min-width:420px;"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`,
    '</div>',
  ].join('');
}

export function formatMessage(content: string) {
  if (!content) return '';

  const escaped = escapeHtml(structureRawText(content));
  const lines = escaped.split('\n');
  const html: string[] = [];
  let i = 0;

  // Stack of open list types for nesting; entries: 'ul' | 'ol'
  const listStack: Array<'ul' | 'ol'> = [];
  const closeListsTo = (depth: number) => {
    while (listStack.length > depth) {
      html.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
    }
  };

  const paragraphBuffer: string[] = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const joined = paragraphBuffer.join('<br/>');
    html.push(`<p style="margin:6px 0;line-height:1.6;">${formatInline(joined)}</p>`);
    paragraphBuffer.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Fenced code block ──────────────────────────────────────────────────
    if (/^```/.test(trimmed)) {
      flushParagraph();
      closeListsTo(0);
      const lang = trimmed.replace(/^```/, '').trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence

      // Flowchart blocks become real SVG schemas; unparsable ones fall through
      // to the plain code block below so nothing is ever lost.
      if (isDiagramLanguage(lang)) {
        const svg = renderDiagramBlock(codeLines.join('\n'), lang);
        if (svg) {
          html.push(svg);
          continue;
        }
      }

      html.push(
        `<pre style="background:${MD_SOFT_BG};border:1px solid ${MD_BORDER};border-radius:10px;padding:10px 12px;margin:8px 0;overflow-x:auto;font-size:0.86em;line-height:1.5;"><code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${codeLines.join('\n')}</code></pre>`,
      );
      continue;
    }

    // ── Blank line ─────────────────────────────────────────────────────────
    if (trimmed === '') {
      flushParagraph();
      closeListsTo(0);
      i += 1;
      continue;
    }

    // ── Table (header row followed by separator) ───────────────────────────
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      closeListsTo(0);
      const header = trimmed;
      i += 2; // consume header + separator
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        rows.push(lines[i].trim());
        i += 1;
      }
      html.push(renderTable(header, rows));
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────────────
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      flushParagraph();
      closeListsTo(0);
      html.push(`<hr style="border:none;border-top:1px solid ${MD_BORDER};margin:12px 0;"/>`);
      i += 1;
      continue;
    }

    // ── Heading ────────────────────────────────────────────────────────────
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeListsTo(0);
      const level = heading[1].length;
      const size = level <= 1 ? '1.12em' : level === 2 ? '1.05em' : '1em';
      html.push(`<div style="margin:12px 0 6px;font-weight:900;font-size:${size};letter-spacing:0.01em;">${formatInline(heading[2])}</div>`);
      i += 1;
      continue;
    }

    // ── Blockquote ─────────────────────────────────────────────────────────
    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeListsTo(0);
      html.push(`<blockquote style="margin:8px 0;padding:4px 0 4px 12px;border-left:3px solid ${MD_BORDER};color:currentColor;opacity:0.9;">${formatInline(quote[1])}</blockquote>`);
      i += 1;
      continue;
    }

    // ── List item (ordered / unordered), indentation = nesting ─────────────
    const listMatch = line.match(/^(\s*)(?:([-•*])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const indent = listMatch[1].replace(/\t/g, '  ').length;
      const depth = Math.min(Math.floor(indent / 2) + 1, 4);
      const ordered = Boolean(listMatch[3]);
      const type: 'ul' | 'ol' = ordered ? 'ol' : 'ul';

      while (listStack.length > depth) {
        html.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
      }
      while (listStack.length < depth) {
        html.push(`<${type} style="margin:4px 0;padding-left:22px;line-height:1.55;">`);
        listStack.push(type);
      }
      // If same depth but list type switched, reopen.
      if (listStack[depth - 1] !== type) {
        html.push(listStack.pop() === 'ol' ? '</ol>' : '</ul>');
        html.push(`<${type} style="margin:4px 0;padding-left:22px;line-height:1.55;">`);
        listStack[depth - 1] = type;
      }
      html.push(`<li style="margin:2px 0;">${formatInline(listMatch[4])}</li>`);
      i += 1;
      continue;
    }

    // ── Plain paragraph line ───────────────────────────────────────────────
    closeListsTo(0);
    paragraphBuffer.push(trimmed);
    i += 1;
  }

  flushParagraph();
  closeListsTo(0);

  return html.join('');
}


const foldWords = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 5);

/**
 * Tema pentru sugestiile de după răspuns: titlul unei surse citate DOAR dacă are legătură cu ce a întrebat studentul. Titlul
 * unui pasaj regăsit e adesea capitolul din care vine (la „tratamentul anemiei feriprive”, sursa putea fi „TERAPIE INTENSIVĂ”),
 * iar sugestia „Explică-mi mai simplu tema TERAPIE INTENSIVĂ” nu are sens.
 */
export function relatedCitationTopic(prompt: string, citations: readonly Citation[]): string | null {
  const asked = new Set(foldWords(prompt).map((word) => word.slice(0, 5)));
  for (const citation of citations) {
    const topic = citation.topic?.trim();
    if (!topic) continue;
    if (foldWords(topic).some((word) => asked.has(word.slice(0, 5)))) return topic;
  }
  return null;
}

export function buildFollowUpSuggestions(
  prompt: string,
  citations: Citation[],
  mode: ChatMode,
  scopedSourceName?: string | null,
  focusTopic?: string | null,
) {
  if (scopedSourceName) {
    return [
      `Rezumă-mi ${scopedSourceName} în 5 idei-cheie.`,
      `Ce merită memorat prioritar din ${scopedSourceName}?`,
      `Generează 5 întrebări strict din ${scopedSourceName}.`,
    ];
  }

  if (mode === 'test') {
    return [
      'Mai dă-mi 3 întrebări puțin mai grele.',
      'Acum arată-mi și răspunsurile corecte.',
      'Testează-mă doar din conceptele unde greșesc des.',
    ];
  }

  if (mode === 'mnemonic') {
    return [
      'Fă-l mai scurt și mai catchy.',
      'Mai dă-mi două variante complet diferite.',
      'Leagă-l de un exemplu clinic ușor de vizualizat.',
    ];
  }

  if (mode === 'diagram') {
    return [
      'Transformă schema într-un tabel diferențial.',
      'Adaugă capcanele de examen lângă fiecare ramură.',
      'Fă-mi o versiune de memorat în 60 de secunde.',
    ];
  }

  if (mode === 'summarize') {
    // Dacă ai cerut deja o fișă, nu o mai propune încă o dată.
    if (/fi[sșş][aăe]/i.test(prompt)) {
      return [
        'Scoate doar capcanele frecvente.',
        'Spune-mi ce trebuie memorat neapărat.',
        'Generează 3 întrebări scurte pe tema asta.',
      ];
    }
    return [
      'Comprimă totul într-o fișă de 30 de secunde.',
      'Scoate doar capcanele frecvente.',
      'Spune-mi ce trebuie memorat neapărat.',
    ];
  }

  const topTopic = relatedCitationTopic(prompt, citations);
  if (topTopic) {
    return [
      `Explică-mi mai simplu tema "${topTopic}".`,
      `Care sunt capcanele frecvente la "${topTopic}"?`,
      `Generează 3 întrebări de verificare pentru "${topTopic}".`,
    ];
  }
  if (citations.length > 0) {
    // Sursa citată nu are legătură clară cu întrebarea: sugestii despre răspunsul dat, fără o „temă” inventată.
    return [
      'Explică-mi mai simplu răspunsul de mai sus.',
      'Care sunt capcanele frecvente la acest subiect?',
      'Generează 3 întrebări de verificare pe subiectul acesta.',
    ];
  }

  if (focusTopic) {
    return [
      `Testează-mă doar din ${focusTopic}.`,
      `Rezumă-mi ${focusTopic} ca pentru examen.`,
      `Fă-mi un mnemonic rapid pentru ${focusTopic}.`,
    ];
  }

  if (/mnemonic|mnemon/i.test(prompt)) {
    return [
      'Fă-l mai scurt și mai ușor de memorat.',
      'Transformă-l într-o asociere vizuală.',
      'Dă-mi încă două variante diferite.',
    ];
  }

  return [
    'Rezumă-mi răspunsul în 3 puncte.',
    'Ce ar trebui să rețin pentru examen?',
    'Generează 3 întrebări scurte pe tema asta.',
  ];
}

export interface AgentFollowUpInput {
  /** Seturi de grile create de agent. */
  quizCount: number;
  /** Pachete de flashcarduri create de agent. */
  deckCount: number;
  /** Subiectul sau cursul cerut (primul pas al planului), dacă există. */
  topic?: string | null;
  /** Cel puțin un set creat a ajuns într-un folder. */
  placedInFolder: boolean;
  /** Planul a eșuat complet. */
  failedAll: boolean;
}

/**
 * Sugestii după ce agentul a lucrat (creat grile sau flashcarduri): pașii care urmează firesc, nu cele generice de chat. Fiecare
 * propoziție trebuie să treacă prin detectorul de comenzi (`looksLikeAgentCommand`), ca un clic să pornească agentul, nu chatul simplu.
 */
export function buildAgentFollowUps({ quizCount, deckCount, topic, placedInFolder, failedAll }: AgentFollowUpInput): string[] {
  if (failedAll) return ['Mai încearcă.'];
  const about = topic?.trim() ? ` despre ${topic.trim()}` : '';
  const out: string[] = [];
  if (quizCount > 0) out.push(`Mai fă 5 grile asemănătoare${about}.`);
  if (deckCount > 0) out.push(`Mai fă 10 flashcarduri${about}.`);
  if (!placedInFolder) out.push('Pune-le într-un folder.');
  if (quizCount > 0 && deckCount === 0 && topic?.trim()) out.push(`Fă flashcarduri${about}.`);
  return out.slice(0, 3);
}

/**
 * A short, proactive opener for the empty chat — the assistant "speaks first"
 * based on the strongest current study signal (weak topic, due reviews, recent
 * import). Returns the default greeting when nothing notable is happening.
 */
export function buildProactiveGreeting(
  weakTopics: Array<{ topic: string; accuracy: number }>,
  dueCount: number,
  recentSourceName?: string | null,
): { title: string; subtitle: string; proactive: boolean } {
  const weak = weakTopics[0];

  if (weak && weak.accuracy < 60) {
    return {
      title: `Hai să lucrăm la ${weak.topic}`,
      subtitle: `Am observat că ${weak.topic} îți dă bătăi de cap (${weak.accuracy}% acuratețe). Pot să-ți explic conceptele cheie sau să-ți fac un set scurt de verificare — tu alegi.`,
      proactive: true,
    };
  }

  if (dueCount >= 5) {
    return {
      title: `Ai ${dueCount} itemi de recapitulat`,
      subtitle: 'Pot să-ți construiesc un plan rapid pentru azi sau să te testez direct din ce e scadent. Cu ce începem?',
      proactive: true,
    };
  }

  if (recentSourceName) {
    return {
      title: `Am indexat „${recentSourceName}"`,
      subtitle: `Vrei un rezumat pentru examen, o schemă logică sau un mini-test din „${recentSourceName}"?`,
      proactive: true,
    };
  }

  return {
    title: 'Cu ce te pot ajuta?',
    subtitle: '',
    proactive: false,
  };
}

export function getContextState(citations: Citation[]) {
  if (citations.length === 0) return 'Răspuns general';
  const averageScore = citations.reduce((sum, citation) => sum + citation.score, 0) / citations.length;
  if (averageScore >= 0.78) return 'Ancorat în bibliotecă';
  if (averageScore >= 0.52) return 'Parțial ancorat';
  return 'Context limitat';
}

export function buildRecommendedActions(
  weakTopics: Array<{ topic: string; accuracy: number }>,
  dueCount: number,
  scopedSourceName?: string | null,
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const primaryWeakTopic = weakTopics[0];

  if (primaryWeakTopic) {
    // Routes to the agent (generate_from_mistakes) → a real, saved, targeted set.
    actions.push({
      mode: 'test',
      label: 'Recapitulare greșeli',
      helper: 'Set de grile țintit pe ce greșești des',
      prompt: 'Fă-mi 10 grile de recapitulare din greșelile mele.',
    });
    actions.push({
      mode: 'test',
      label: 'Test pe punctul slab',
      helper: `${primaryWeakTopic.topic} · ${primaryWeakTopic.accuracy}% acuratețe`,
      prompt: `Testează-mă din ${primaryWeakTopic.topic}. Pune-mi 3 întrebări scurte, una câte una, și așteaptă răspunsul meu.`,
    });
    actions.push({
      mode: 'mnemonic',
      label: 'Mnemonic de fixare',
      helper: `Memorie rapidă pentru ${primaryWeakTopic.topic}`,
      prompt: `Creează-mi 3 mnemonice scurte și memorabile pentru ${primaryWeakTopic.topic}.`,
    });
  }

  if (dueCount > 0) {
    actions.push({
      mode: 'summarize',
      label: 'Plan pentru azi',
      helper: `${dueCount} itemi cer atenție`,
      prompt: 'Pe baza progresului meu, spune-mi foarte concret ce ar trebui să recapitulăm astăzi și în ce ordine.',
    });
  }

  if (scopedSourceName) {
    actions.unshift({
      mode: 'summarize',
      label: 'Rezumat document',
      helper: scopedSourceName,
      prompt: `Rezumă-mi documentul "${scopedSourceName}" în idei-cheie, capcane și ce trebuie memorat primul.`,
    });
    actions.unshift({
      mode: 'diagram',
      label: 'Schema document',
      helper: scopedSourceName,
      prompt: `Fă-mi o schemă logică din documentul "${scopedSourceName}": concepte principale, relații cauză-efect, capcane și ce este probabil la examen.`,
    });
  }

  return actions
    .filter((action, index, array) => array.findIndex((entry) => entry.label === action.label) === index)
    .slice(0, 3);
}
