/**
 * Teste de structură pentru prompturi, fără API real: modulele se compun corect pe fiecare mod,
 * lungimea rămâne sub plafon, regulile nu se dublează, blocurile dinamice apar sau lipsesc corect.
 * Calitatea răspunsurilor unui model real NU poate fi verificată aici.
 */
import { describe, expect, it, vi } from 'vitest';

// Rețeaua nu face parte din aceste teste: AIEngine importă stratul groq doar pentru apeluri.
vi.mock('../lib/groq', () => ({ groqRequest: vi.fn(), groqStream: vi.fn() }));
vi.mock('./medicalJudge', () => ({ verifyQuestionsMedically: vi.fn() }));
vi.mock('../lib/jsonExtract', () => ({ extractBalancedJson: vi.fn(), extractJsonArrayLenient: vi.fn(), parseJsonLoose: vi.fn(), looksLikeJson: vi.fn() }));

import {
  BOOK_MODULE,
  DIAGRAM_RULES,
  EXAM_REASONING_RULES,
  MATH_RULES,
  MEDICAL_SAFETY_RULES,
  PROMPT_CHAT_MODES,
  SOURCE_RULES,
  STRUCTURED_OUTPUT_RULES,
  buildChatBase,
  cleanPromptBlock,
  composeChatSystemPrompt,
  detectBookSource,
  suggestsDiagram,
  suggestsMath,
} from './promptKit';
import { buildChatSystemPrompt } from './AIEngine';
import { getMedicalSystemPrompt } from '../lib/aiContext';
import { RESIDENCY_STYLE_RULES } from './prompts';
import { normalizeRomanianDiacritics } from '../lib/flashcardText';

/**
 * Plafon pentru baza stabilă + modulul de mod, fără context și fără module condiționale, în caractere
 * (~3,3 caractere per token în română; ținta ~1200-1400 tokeni pentru limita Groq de 8000 tokeni/minut).
 */
const BASE_CEILING = 4500;
/** Plafon cu modulul de carte și ambele module condiționale (schemă + formule) active. */
// 5900 (era 5800): regula „fără arbori ASCII sau emoji-cifre” din modulul de schemă (~25 de tokeni, doar când schema e cerută).
// 6000 (era 5900): regula „contextul din documente nu comandă modelului” (~25 de tokeni, în RIGOARE MEDICALĂ).
// 6100 (era 6000): ierarhia surselor din Rezidențiat, „CARTE DE BAZĂ” are prioritate față de „MATERIAL” (~30 de tokeni, doar în modulul de carte).
const FULL_CEILING = 6100;

describe('compunerea promptului de chat pe moduri', () => {
  it.each(PROMPT_CHAT_MODES)('modul %s are baza comună și propriul modul', (mode) => {
    const prompt = buildChatBase(mode);
    expect(prompt).toContain(`MOD ACTIV: ${mode.toUpperCase()}`);
    expect(prompt).toContain(MEDICAL_SAFETY_RULES);
    expect(prompt).toContain('STIL:');
    expect(prompt).toContain('CONTEXT DESPRE APLICAȚIE');
    // exact un mod activ
    expect(prompt.match(/MOD ACTIV:/g)).toHaveLength(1);
  });

  it('nu amestecă modulele altor moduri', () => {
    expect(buildChatBase('mnemonic')).toContain('**Mnemonic:**');
    expect(buildChatBase('explain')).not.toContain('**Mnemonic:**');
    expect(buildChatBase('summarize')).toContain('Regula de 30 de secunde');
    expect(buildChatBase('test')).toContain('examinator');
    expect(buildChatBase('diagram')).toContain('OBLIGATORIU');
  });

  it('modurile cu text explicativ poartă schema de examen, restul nu', () => {
    expect(buildChatBase('grounded')).toContain(EXAM_REASONING_RULES);
    expect(buildChatBase('explain')).toContain(EXAM_REASONING_RULES);
    expect(buildChatBase('mnemonic')).not.toContain(EXAM_REASONING_RULES);
    expect(buildChatBase('test')).not.toContain(EXAM_REASONING_RULES);
  });

  it('schema și formulele sunt condiționale: doar în modul diagram sau când cererea le sugerează', () => {
    for (const mode of PROMPT_CHAT_MODES) {
      const plain = composeChatSystemPrompt({ mode, userMessage: 'care e tratamentul de prima linie în FiA instabilă?' });
      expect(plain).not.toContain(MATH_RULES);
      if (mode === 'diagram') expect(plain).toContain(DIAGRAM_RULES);
      else expect(plain).not.toContain(DIAGRAM_RULES);
    }
    const explainVague = composeChatSystemPrompt({ mode: 'explain', userMessage: 'explică-mi diabetul' });
    expect(explainVague).not.toContain(DIAGRAM_RULES);
    expect(composeChatSystemPrompt({ mode: 'explain', userMessage: 'fă-mi o schemă cu algoritmul în FiA' })).toContain(DIAGRAM_RULES);
    expect(composeChatSystemPrompt({ mode: 'explain', userMessage: 'cum calculez clearance-ul creatininei?' })).toContain(MATH_RULES);
    expect(composeChatSystemPrompt({ mode: 'grounded', includeDiagramRules: true, includeMathRules: true })).toContain(DIAGRAM_RULES);
    expect(composeChatSystemPrompt({ mode: 'diagram', includeDiagramRules: false })).not.toContain(DIAGRAM_RULES);
  });

  it('detectoarele de cerere', () => {
    expect(suggestsDiagram('fă-mi o schemă')).toBe(true);
    expect(suggestsDiagram('desenează algoritmul')).toBe(true);
    expect(suggestsDiagram('explică-mi diabetul')).toBe(false);
    expect(suggestsMath('formula debitului cardiac')).toBe(true);
    expect(suggestsMath('ce e HTA?')).toBe(false);
    expect(suggestsMath(undefined)).toBe(false);
  });

  it('modul grounded fără context și fără carte cade pe răspuns natural, fără meta-comentarii', () => {
    const prompt = composeChatSystemPrompt({ mode: 'grounded' });
    expect(prompt).not.toContain(BOOK_MODULE);
    expect(prompt).toContain('NU EXISTĂ CONTEXT');
    expect(prompt).toContain('fără meta-comentarii despre bibliotecă');
    expect(prompt).toContain(SOURCE_RULES);
  });

  it('baza stabilă rămâne sub plafon pe orice mod', () => {
    for (const mode of PROMPT_CHAT_MODES) {
      expect(buildChatBase(mode).length).toBeLessThan(BASE_CEILING);
      expect(buildChatBase(mode, { book: true, diagrams: true, math: true }).length).toBeLessThan(FULL_CEILING);
    }
  });

  it('lungimea promptului complet fără context rămâne sub plafon pe fiecare mod', () => {
    for (const mode of PROMPT_CHAT_MODES) {
      const prompt = composeChatSystemPrompt({ mode, userMessage: 'ce e HTA?' });
      expect(prompt.length, mode).toBeLessThan(BASE_CEILING + 500);
    }
  });

  it('nu are rânduri duplicate și nu repetă regulile-cheie', () => {
    for (const mode of PROMPT_CHAT_MODES) {
      const prompt = composeChatSystemPrompt({ mode, bookMode: true, contextSummary: 'ctx', includeDiagramRules: true, includeMathRules: true });
      const lines = prompt.split('\n').map((line) => line.trim()).filter((line) => line.length > 25);
      const seen = new Set<string>();
      const duplicates = lines.filter((line) => (seen.has(line) ? true : (seen.add(line), false)));
      expect(duplicates).toEqual([]);
      expect(prompt.match(/RIGOARE MEDICALĂ/g)).toHaveLength(1);
      expect(prompt.match(/Răspunde exclusiv în limba română/g)).toHaveLength(1);
      expect(prompt.match(/SURSE: nu atribui/g)).toHaveLength(1);
    }
  });
});

describe('instrucțiunile-cheie ale promptului de chat', () => {
  const base = buildChatBase('grounded');

  it('gândire de examen: răspuns direct -> de ce -> capcane -> cum se întreabă', () => {
    expect(EXAM_REASONING_RULES).toMatch(/1\. răspunsul direct[\s\S]*2\. de ce[\s\S]*3\. capcane[\s\S]*4\. cum se întreabă/);
  });

  it('clarificare: o singură întrebare, doar când e ambiguu', () => {
    expect(base).toContain('O SINGURĂ întrebare scurtă de clarificare');
    expect(base).toContain('~150-250 de cuvinte');
    expect(base).toContain('altfel răspunzi direct');
  });

  it('răspunsuri scurte la întrebări scurte, fără formule goale', () => {
    expect(base).toContain('întrebare scurtă sau factuală -> răspuns scurt');
    expect(base).toContain('Fără emoji');
    expect(base).toContain('DOAR când utilizatorul cere schemă');
    expect(base).toContain('fără formule goale');
  });

  it('anti-halucinație: valori doar cu certitudine; nicio sursă neapărută în context', () => {
    expect(base).toContain('doar când ești sigur');
    expect(base).toContain('verifici în ghidul actual');
    expect(base).toContain('nu apare explicit în blocul de context');
    expect(base).toContain('Fără context nu pomeni surse concrete');
    expect(base).toContain('nu inventa citate');
  });

  it('adaptare la student, fără să o comenteze', () => {
    expect(base).toContain('fără să o comentezi');
    expect(base).toContain('fără să o enumeri');
  });

  it('schemele: formatul compact ```schema pentru clasificări și fluxuri, mermaid pentru tipuri speciale', () => {
    expect(DIAGRAM_RULES).toContain('```schema');
    expect(DIAGRAM_RULES).toContain('```mermaid');
    for (const kind of ['sequenceDiagram', 'timeline', 'stateDiagram-v2']) {
      expect(DIAGRAM_RULES).toContain(kind);
    }
    expect(DIAGRAM_RULES).toContain('evită `mindmap`');
    expect(DIAGRAM_RULES).toContain('nu tăia informația');
    expect(DIAGRAM_RULES).toContain('tabelul Markdown');
    expect(DIAGRAM_RULES).not.toContain('flowchart TD');
  });

  it('exemplul de schemă din prompt e un bloc închis și se parsează fără erori', () => {
    const fences = DIAGRAM_RULES.match(/^```/gm) ?? [];
    expect(fences.length % 2).toBe(0);
    const blocks = [...DIAGRAM_RULES.matchAll(/```schema\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length).toBe(1);
    expect(blocks[0].split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(10);
    expect(DIAGRAM_RULES).not.toMatch(/```mermaid\n/);
  });

  it('limba: diacritice cu virgulă și termeni românești', () => {
    const prompt = buildChatBase('grounded');
    expect(prompt).toContain('niciodată cu sedilă');
    expect(prompt).toContain('poliurie');
    expect(prompt).toContain('glicemie à jeun');
  });

  it('formulele: KaTeX cu $...$ și $$...$$', () => {
    expect(MATH_RULES).toContain('niciodată \\( \\) sau \\[ \\]');
    expect(MATH_RULES).toContain('**Rezultat:**');
    expect(MATH_RULES).toContain('$...$');
    expect(MATH_RULES).toContain('$$...$$');
    expect(MATH_RULES).toContain('\\text');
  });

  it('modul diagram cere diagramă obligatorie, nu eseu', () => {
    expect(buildChatBase('diagram')).toContain('cel puțin o schemă: bloc ```schema');
  });
});

describe('modul carte / Rezidențiat', () => {
  it('se activează pe sursă de tip carte sau pe blocul de capitol', () => {
    expect(detectBookSource('Kumar și Clark – Medicină Clinică.pdf')).toBe(true);
    expect(detectBookSource('Lawrence chirurgie')).toBe(true);
    expect(detectBookSource('Notițe cardiologie.pdf')).toBe(false);
    expect(detectBookSource(undefined, '[CAPITOL CURRICULAR]\nCapitol…')).toBe(true);
    expect(detectBookSource(undefined, 'fragment obișnuit')).toBe(false);
  });

  it('adaugă ancorarea pe capitol, citarea condiționată și „ce NU e în carte”', () => {
    const prompt = composeChatSystemPrompt({ mode: 'explain', scopedSourceName: 'Kumar Clark', contextSummary: 'ceva' });
    expect(prompt).toContain(BOOK_MODULE);
    expect(BOOK_MODULE).toContain('EXACT etichetele [n]');
    expect(BOOK_MODULE).toContain('În fragmentul din carte nu apare X');
    expect(BOOK_MODULE).toContain('neconfirmat de carte');
    expect(BOOK_MODULE).toContain('nu inventa numere');
  });

  it('lipsește pe sursă obișnuită și poate fi forțat sau oprit explicit', () => {
    expect(composeChatSystemPrompt({ mode: 'grounded', scopedSourceName: 'Curs.pdf', contextSummary: 'x' })).not.toContain(BOOK_MODULE);
    expect(composeChatSystemPrompt({ mode: 'grounded', bookMode: true })).toContain(BOOK_MODULE);
    expect(composeChatSystemPrompt({ mode: 'grounded', scopedSourceName: 'Kumar', bookMode: false })).not.toContain(BOOK_MODULE);
  });
});

describe('blocurile dinamice', () => {
  it('apar când sunt date și lipsesc când nu sunt', () => {
    const bare = composeChatSystemPrompt({ mode: 'grounded' });
    for (const marker of ['CE ȘTII DESPRE STUDENT', 'REZUMATUL CONVERSAȚIEI', 'PROFIL DE STUDIU', 'STAREA STUDENTULUI', 'TOPICURI VULNERABILE', 'DOCUMENT ȚINTĂ']) {
      expect(bare).not.toContain(marker);
    }
    expect(bare).toContain('NU EXISTĂ CONTEXT');

    const full = composeChatSystemPrompt({
      mode: 'explain',
      contextSummary: '[Sursă: A]\nHTA = presiune arterială crescută',
      scopedSourceName: 'Curs HTA.pdf',
      focusTopics: ['HTA', 'FiA'],
      personalMemory: '- preferă scheme\n- învață noaptea',
      conversationSummary: '- am discutat HTA',
      studyContext: 'Student medical: 40 întrebări, acuratețe 50%.',
      tone: { state: 'frustrated', late: true },
    });
    expect(full).toContain('CE ȘTII DESPRE STUDENT');
    expect(full).toContain('- preferă scheme\n- învață noaptea');
    expect(full).toContain('REZUMATUL CONVERSAȚIEI');
    expect(full).toContain('PROFIL DE STUDIU');
    expect(full).toContain('frustrat');
    expect(full).toContain('târziu noaptea');
    expect(full).toContain('TOPICURI VULNERABILE (doar context pentru adaptare; nu schimba subiectul cerut de student): HTA, FiA');
    expect(full).toContain('DOCUMENT ȚINTĂ CURENT: Curs HTA.pdf');
    expect(full).toContain('CONTEXT DIN BIBLIOTECA UTILIZATORULUI');
    expect(full).toContain('HTA = presiune arterială crescută');
    expect(full).not.toContain('NU EXISTĂ CONTEXT');
    expect(full).toContain('etichetele [n] exacte');
  });

  it('tonul confuz cere schimbarea unghiului, nu repetarea', () => {
    const prompt = composeChatSystemPrompt({ mode: 'explain', tone: { state: 'confused', late: false } });
    expect(prompt).toContain('NU repeta explicația la fel');
    expect(prompt).not.toContain('târziu noaptea');
  });

  it('blocurile dinamice vin după partea stabilă (prompt-cache friendly)', () => {
    const prompt = composeChatSystemPrompt({ mode: 'grounded', personalMemory: 'fapt', contextSummary: 'ctx' });
    expect(prompt.indexOf('MOD ACTIV')).toBeLessThan(prompt.indexOf('CE ȘTII DESPRE STUDENT'));
    expect(prompt.indexOf('CE ȘTII DESPRE STUDENT')).toBeLessThan(prompt.indexOf('CONTEXT DIN BIBLIOTECA'));
  });

  it('hasContext explicit are prioritate față de contextul gol', () => {
    expect(composeChatSystemPrompt({ mode: 'grounded', hasContext: false, contextSummary: 'ctx' })).toContain('NU EXISTĂ CONTEXT');
  });

  it('cleanPromptBlock păstrează rândurile și scoate caracterele de control', () => {
    expect(cleanPromptBlock('a  b\u0000\n\n\n\nc \t d')).toBe('a b\n\nc d');
    expect(cleanPromptBlock(undefined)).toBe('');
  });
});

describe('buildChatSystemPrompt (AIEngine) folosește compunătorul', () => {
  it('produce același text ca promptKit pentru aceleași opțiuni', () => {
    const options = { mode: 'diagram' as const, focusTopics: ['sepsis'], personalMemory: 'fapt' };
    expect(buildChatSystemPrompt('ctx', options)).toBe(
      composeChatSystemPrompt({ mode: 'diagram', contextSummary: 'ctx', focusTopics: ['sepsis'], personalMemory: 'fapt' }),
    );
  });

  it('implicit e modul grounded', () => {
    expect(buildChatSystemPrompt('', {})).toContain('MOD ACTIV: GROUNDED');
  });
});

describe('normalizeRomanianDiacritics (de apelat la afișarea răspunsului)', () => {
  it('înlocuiește sedila cu virgulă, inclusiv cedila combinată', () => {
    expect(normalizeRomanianDiacritics('bărbaţi şi Şcoala Ţării')).toBe('bărbați și Școala Țării');
    expect(normalizeRomanianDiacritics('s\u0327i t\u0327')).toBe('și ț');
  });
});

describe('getMedicalSystemPrompt pe toate rolurile', () => {
  const prose = ['tutor', 'explainer', 'advisor'] as const;

  it.each(prose)('%s: rol + rigoare + contract de formă, o singură dată', (role) => {
    const prompt = getMedicalSystemPrompt(role);
    expect(prompt).toContain(MEDICAL_SAFETY_RULES);
    expect(prompt).toContain(STRUCTURED_OUTPUT_RULES);
    expect(prompt).not.toContain(RESIDENCY_STYLE_RULES);
    expect(prompt.match(/RIGOARE MEDICALĂ/g)).toHaveLength(1);
    expect(prompt.match(/FORMA RĂSPUNSULUI/g)).toHaveLength(1);
    expect(prompt.length).toBeLessThan(3500);
  });

  it('examiner: stil de grilă, fără reguli de formă pentru proză', () => {
    const prompt = getMedicalSystemPrompt('examiner');
    expect(prompt).toContain(RESIDENCY_STYLE_RULES);
    expect(prompt).toContain(MEDICAL_SAFETY_RULES);
    expect(prompt).not.toContain(STRUCTURED_OUTPUT_RULES);
  });

  it('rolurile se deosebesc între ele', () => {
    expect(getMedicalSystemPrompt('tutor')).toContain('mentor medical senior');
    expect(getMedicalSystemPrompt('explainer')).toContain('profesor de medicină clinică');
    expect(getMedicalSystemPrompt('advisor')).toContain('consilier de studiu');
    expect(getMedicalSystemPrompt('examiner')).toContain('examinator medical expert');
  });

  it('adaugă profilul doar când e consistent (peste 20 de caractere)', () => {
    expect(getMedicalSystemPrompt('tutor', 'scurt')).not.toContain('PROFIL STUDENT');
    const profile = 'Student medical: 120 întrebări rezolvate, acuratețe 62%.';
    const prompt = getMedicalSystemPrompt('advisor', profile);
    expect(prompt).toContain('PROFIL STUDENT:');
    expect(prompt.endsWith(profile)).toBe(true);
  });

  it('un rol necunoscut cade pe tutor, fără să arunce', () => {
    expect(getMedicalSystemPrompt('altceva' as 'tutor')).toContain('mentor medical senior');
  });
});

describe('„capcana de examen” doar la subiecte medicale', () => {
  it('regula de stil o leagă de subiectul medical, nu de orice întrebare scurtă', () => {
    const prompt = composeChatSystemPrompt({ userMessage: 'Ce este HTA?' });
    expect(prompt).toContain('doar la subiecte medicale');
    expect(prompt).toContain('nu la întrebări despre aplicație');
  });

  it('o întrebare despre aplicație primește instrucțiunea de răspuns direct, fără capcană', () => {
    const app = composeChatSystemPrompt({ userMessage: 'funcționează fallback-ul când rămân fără tokeni?', appQuestion: true });
    expect(app).toContain('ÎNTREBARE DESPRE APLICAȚIE');
    expect(app).toContain('fără „capcană de examen”');
    expect(composeChatSystemPrompt({ userMessage: 'Ce este HTA?' })).not.toContain('ÎNTREBARE DESPRE APLICAȚIE');
  });

  it('știe cum se comportă aplicația când un furnizor rămâne fără limită', () => {
    expect(composeChatSystemPrompt({ appQuestion: true })).toContain('încearcă următorul furnizor configurat cu cheie');
    expect(composeChatSystemPrompt({ userMessage: 'de ce cade furnizorul?' })).toContain('încearcă următorul furnizor configurat cu cheie');
  });

  it('o întrebare medicală primește doar nucleul despre aplicație, cu garda anti-„am salvat”', () => {
    const prompt = composeChatSystemPrompt({ userMessage: 'Ce este sepsisul?' });
    expect(prompt).not.toContain('CONTEXT DESPRE APLICAȚIE');
    expect(prompt).toContain('NU creezi, salvezi, muți sau ștergi nimic');
  });
});
