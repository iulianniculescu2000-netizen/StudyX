/**
 * Scenarii „Vezi în carte” fără AI, pe grile reale din băncile de rezidențiat (eșantion fix, determinist).
 * Un candidat e „plauzibil” când pasajul întors (text, capitol, topic) conține tema grilei (`must`).
 * Raportul cu rata de acoperire apare în consolă la fiecare rulare.
 */
import { describe, expect, it } from 'vitest';
import lawrence from '../../data/rezidentiat/lawrence-kumar.json';
import modele from '../../data/rezidentiat/modele-grile.json';
import { foldText, textOfPassage, type PassageQuery } from '../bookPassage';
import { runBookAgent, type AgentAsk } from './index';

interface RawQuestion { text: string; explanation?: string; options: Array<{ text: string; isCorrect: boolean }> }
interface Bank { specialties: Array<{ quizzes: Array<{ questions: RawQuestion[] }> }> }

/** Aceeași ordine ca la numerotarea eșantionului (disciplină › specialitate › test › întrebare). */
const flatten = (banks: Bank[]): RawQuestion[] => banks.flatMap((d) => d.specialties.flatMap((s) => s.quizzes.flatMap((q) => q.questions)));
const MODELE = flatten(modele as unknown as Bank[]);
const LAWRENCE = flatten(lawrence as unknown as Bank[]);

const queryOf = (question: RawQuestion): PassageQuery => ({
  question: question.text,
  answer: question.options.filter((o) => o.isCorrect).map((o) => o.text).join(', '),
  explanation: question.explanation,
  wrongAnswers: question.options.filter((o) => !o.isCorrect).map((o) => o.text),
});

/** [banca, indice, începutul enunțului (garanție că indicele e cel bun), tema care trebuie să apară în pasaj]. */
const SAMPLE: Array<['M' | 'L', number, string, RegExp]> = [
  ['M', 1153, 'Tratamentul de fond, de referin', /artrit/],
  ['M', 1150, 'Scopul tratamentului de fond', /artrit/],
  ['M', 1119, 'Tratamentul de fond conven', /artrit/],
  ['M', 883, 'Scorul Child-Pugh', /child|ciroz/],
  ['M', 881, 'Între cauzele cele mai frecvente de ciroza', /ciroz/],
  ['M', 844, 'Tratamentul antiviral este indicat', /hepatit|vhc/],
  ['M', 1458, 'Diagnosticul de hipertiroidism frust', /tiroid|tsh/],
  ['M', 1479, 'Tratamentul cetoacidozei diabetice', /cetoacid/],
  ['M', 1097, 'Pancreatita acuta este provocata', /pancreatit/],
  ['M', 1081, 'În apendicita acută', /apendic/],
  ['M', 1775, 'Reprezintă forme clinice de colecistită', /colecist/],
  ['M', 1644, 'În hernia inghinala directă', /hernia|inghinal/],
  ['M', 2061, 'Complicatiile otitei medii', /otit/],
  ['M', 309, 'Spitalizarea unei crize astmatice', /astm/],
  ['M', 334, 'Durata tratamentului antibiotic', /pneumon/],
  ['M', 1278, 'Stenoza pilorică la sugar', /pilor/],
  ['M', 1313, 'Diagnosticul de diabet zaharat la copil', /diabet/],
  ['M', 101, 'Indicaţia de tratament anticoagulant', /fibrila/],
  ['M', 1551, 'Sindromul clinic anemic', /anem/],
  ['M', 922, 'În caz de ulcer duodenal', /ulcer|pylori/],
  ['M', 1654, 'Care este substratul morfopatologic al sindromului lui Mirizzi', /colecist|mirizzi/],
  ['L', 303, 'Despre hernia obturatorie', /hernia|obturator/],
];

const offline: AgentAsk = async () => { throw new Error('fără AI'); };
const noWait = { sleep: async () => undefined };
const rows = SAMPLE.map(([bank, index, start, must]) => ({ question: (bank === 'M' ? MODELE : LAWRENCE)[index], start, must }));

describe('„Vezi în carte” fără AI: eșantion fix din bănci', () => {
  it('indicii eșantionului arată spre grilele așteptate', () => {
    for (const row of rows) expect(row.question?.text.startsWith(row.start), row.start).toBe(true);
  });

  it('pentru cel puțin jumătate se găsește un pasaj plauzibil, marcat „nu e verificat de AI”', async () => {
    const lines: string[] = [];
    let found = 0;
    let plausible = 0;
    for (const { question, start, must } of rows) {
      const passage = await runBookAgent(queryOf(question), offline, noWait);
      const hit = passage ? must.test(foldText(`${textOfPassage(passage)} ${passage.chapter ?? ''} ${passage.topic ?? ''}`)) : false;
      if (passage) found += 1;
      if (hit) plausible += 1;
      if (passage) expect(passage.verified).toBe(false);
      if (passage) expect(passage.highlights).toEqual([]);
      lines.push(`${hit ? 'OK  ' : passage ? 'slab' : 'nimic'} ${start.slice(0, 48)} -> ${passage ? `${passage.book} p.${passage.page}` : '-'}`);
    }
    console.log(`Acoperire fără AI: ${plausible}/${rows.length} plauzibile (${found} cu pasaj)\n${lines.join('\n')}`);
    expect(plausible).toBeGreaterThanOrEqual(Math.ceil(rows.length / 2));
  }, 120000);
});
