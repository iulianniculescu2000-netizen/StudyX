import { describe, expect, it } from 'vitest';
import { cleanBookQuote, isSetFormat, parseSetFormat } from './grileSetFormat';
import type { SourceLine } from './grileParser';

const toLines = (text: string): SourceLine[] => text.split('\n').map((t) => ({ text: t }));

const SAMPLE = `Pneumologie - Astm bronsic
35 grile · 8 CS · 27 CM
Grila 1 CM · complement multiplu · 3 corecte
Astmul bronșic cu debut în copilărie, cu un enunț foarte lung care
se rupe pe al doilea rând:
A inflamația bronșică
B obstrucția difuză
C eozinofilie în spută
D agregare familială
E hiperreactivitatea bronșică la o gamă
variată de stimuli
Răspuns corect: A, B, E
A · adevărat «• inflamația bronșică cu limfocite T, mastocite și
eozinofile.»
B · adevărat «• obstrucția difuză a căilor aeriene»
C · fals adevăr din alt loc al paginii, nu răspunde la enunț
D · fals propoziția cărții cu sensul inversat
E · adevărat «• hiperreactivitatea bronșică (HRB) la o gamă variată de stimuli»
Sursa: Kumar, p. 971
Pneumologie - Astm bronsic pagina 2
Grila 2 CS · complement simplu · 1 corect
IgE alergen-specifice sunt prezente la:
A 90%
B 30–40%
Răspuns corect: B
A · fals adevăr din alt loc al paginii, nu răspunde la enunț
B · adevărat «Termenul de „atopie" a fost inventat. lgE ale»
Sursa: Kumar, p. 971`;

describe('formatul Set de grile', () => {
  it('se recunoaște doar când are antet, cheie și explicații pe variantă', () => {
    expect(isSetFormat(toLines(SAMPLE))).toBe(true);
    expect(isSetFormat(toLines('1. Ce e astmul?\nA x\nB y\nRăspuns corect: A'))).toBe(false);
  });

  it('citește enunțul rupt, variantele pe mai multe rânduri și cheia', () => {
    const [q1, q2] = parseSetFormat(toLines(SAMPLE));
    expect(q1.text).toBe('Astmul bronșic cu debut în copilărie, cu un enunț foarte lung care se rupe pe al doilea rând:');
    expect(q1.options).toHaveLength(5);
    expect(q1.options[4].text).toBe('hiperreactivitatea bronșică la o gamă variată de stimuli');
    expect(q1.options.map((o) => o.isCorrect)).toEqual([true, true, false, false, true]);
    expect(q1.multipleCorrect).toBe(true);
    expect(q1.confidence).toBe('high');
    expect(q2.multipleCorrect).toBe(false);
    expect(q2.options.map((o) => o.isCorrect)).toEqual([false, true]);
  });

  it('explicația are cheia, citatele curățate, variantele false și sursa', () => {
    const [q1, q2] = parseSetFormat(toLines(SAMPLE));
    expect(q1.explanation).toContain('Răspuns corect: A, B, E.');
    expect(q1.explanation).toContain('A — „inflamația bronșică cu limfocite T, mastocite și eozinofile.”');
    expect(q1.explanation).toContain('C — fals: adevăr din alt loc al paginii, nu răspunde la enunț.');
    expect(q1.explanation).toContain('D — fals: propoziția cărții, cu sensul inversat.');
    expect(q1.explanation).toContain('Sursa: Kumar, p. 971');
    expect(q2.explanation).toContain('„Termenul de „atopie” a fost inventat. IgE ale”');
  });

  it('curăță greșelile de OCR sigure din citate', () => {
    expect(cleanBookQuote('receptorilor p-adrenergici, ce')).toBe('receptorilor β-adrenergici, ce');
    expect(cleanBookQuote('receptorilor Pradrenergici de la')).toBe('receptorilor β-adrenergici de la');
    expect(cleanBookQuote('selectivi p,-adrenergici, precum')).toBe('selectivi β1-adrenergici, precum');
    expect(cleanBookQuote('antilgE, leagă moleculele de lgE libere')).toBe('anti-IgE, leagă moleculele de IgE libere');
    expect(cleanBookQuote('ex. un Al NS.')).toBe('ex. un AINS.');
    expect(cleanBookQuote('astmul instabil (,,brittle asthma") și')).toBe('astmul instabil („brittle asthma”) și');
    expect(cleanBookQuote('doză mică deCSI Wheezing')).toBe('doză mică de CSI Wheezing');
    expect(cleanBookQuote('cu 4Q-60 mg pe zi')).toBe('cu 40-60 mg pe zi');
    expect(cleanBookQuote('Se Boli respiratorii obstructive 951 administrează prednison')).toBe('Se administrează prednison');
    expect(cleanBookQuote('în ţesut şi ştiinţă')).toBe('în țesut și știință');
    expect(cleanBookQuote('{PEF, peak expiratory flow) efectuate')).toBe('(PEF, peak expiratory flow) efectuate');
  });

  it('semnalează o cheie care nu se potrivește cu explicația', () => {
    const broken = SAMPLE.replace('Răspuns corect: A, B, E', 'Răspuns corect: A, B, C');
    expect(parseSetFormat(toLines(broken))[0].confidence).toBe('low');
  });
});
