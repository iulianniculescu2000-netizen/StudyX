import { describe, expect, it } from 'vitest';
import {
  applyGrilaRewrite,
  buildFlashcardRewriteMessages,
  buildGrilaRewriteMessages,
  judgeFlashcard,
  judgeFlashcards,
  judgeGrila,
  judgeGrile,
  parseFlashcardRewrite,
  parseGrilaRewrite,
  type GrilaLike,
} from './itemJudge';
import { messagesTokens } from './shared';

const opts = (texts: string[], correct: number[]) => texts.map((text, i) => ({ text, isCorrect: correct.includes(i) }));

const GOOD_SIMPLE: GrilaLike = {
  text: 'Semnul caracteristic al stenozei mitrale la auscultație este:',
  options: opts(
    ['Sufluu diastolic cu rulment', 'Sufluu sistolic de ejecție', 'Click mezosistolic', 'Sufluu continuu', 'Galop protodiastolic'],
    [0],
  ),
  explanation: 'Rulmentul diastolic apare prin gradientul atrioventricular.',
};

describe('judgeFlashcard', () => {
  it('un card bun are scor mare', () => {
    const j = judgeFlashcard({
      front: 'Care este cea mai frecventă cauză de stenoză mitrală?',
      back: 'Reumatismul articular acut (boala reumatismală).',
    });
    expect(j.problems).toEqual([]);
    expect(j.score).toBe(100);
    expect(j.weak).toBe(false);
  });

  it('față fără context sau cu etichetă', () => {
    expect(judgeFlashcard({ front: 'AVRT?', back: 'Tahicardie prin reintrare.' }).problems).toContain('front-context');
    expect(judgeFlashcard({ front: '[Cardiologie] Un semn clinic frecvent?', back: 'Dispnee' }).weak).toBe(true);
  });

  it('față vagă', () => {
    const j = judgeFlashcard({ front: 'Ce înseamnă asta în practică clinică?', back: 'Depinde de context clinic.' });
    expect(j.problems).toContain('front-vague');
  });

  it('spate gol sau care repetă fața', () => {
    expect(judgeFlashcard({ front: 'Definește insuficiența cardiacă acută', back: '' }).problems).toContain('back-empty');
    const echo = judgeFlashcard({ front: 'Definiția insuficienței cardiace acute', back: 'Definiția insuficienței cardiace acute' });
    expect(echo.problems).toContain('back-echo');
  });

  it('spate prea lung sau cu mai multe fapte', () => {
    expect(judgeFlashcard({ front: 'Explică fiziopatologia șocului', back: 'x '.repeat(250) }).problems).toContain('back-long');
    const multi = 'Primul fapt este acesta. Al doilea fapt este altul. Al treilea fapt e diferit. Al patrulea fapt e separat.';
    expect(judgeFlashcard({ front: 'Ce știi despre tromboembolismul pulmonar?', back: multi }).problems).toContain('back-multifact');
  });

  it('sedila e penalizată ușor', () => {
    const j = judgeFlashcard({ front: 'Ce este fibrilaţia atrială?', back: 'Aritmie supraventriculară.' });
    expect(j.problems).toEqual(['sedilla']);
    expect(j.weak).toBe(false);
  });

  it('setul: medie și indexuri slabe', () => {
    const set = judgeFlashcards([
      { front: 'Care este tratamentul de elecție în anafilaxie?', back: 'Adrenalina intramusculară.' },
      { front: 'AVRT?', back: 'Reintrare.' },
    ]);
    expect(set.weakIndexes).toEqual([1]);
    expect(set.average).toBeLessThan(100);
  });
});

describe('judgeGrila', () => {
  it('o grilă bună de complement simplu', () => {
    const j = judgeGrila(GOOD_SIMPLE);
    expect(j.problems).toEqual([]);
    expect(j.weak).toBe(false);
  });

  it('număr greșit de variante', () => {
    const q = { ...GOOD_SIMPLE, options: GOOD_SIMPLE.options.slice(0, 4) };
    expect(judgeGrila(q).problems).toContain('option-count');
    expect(judgeGrila(q, 'simple').problems).not.toContain('option-count');
  });

  it('complement simplu fără răspuns corect sau cu două', () => {
    expect(judgeGrila({ ...GOOD_SIMPLE, options: opts(GOOD_SIMPLE.options.map((o) => o.text), []) }).problems).toContain('correct-count');
    expect(judgeGrila({ ...GOOD_SIMPLE, multipleCorrect: false, options: opts(GOOD_SIMPLE.options.map((o) => o.text), [0, 1]) }).problems).toContain('flag-mismatch');
  });

  it('complement multiplu: 2-4 corecte din 5', () => {
    const texts = ['Dispnee', 'Ortopnee', 'Edeme', 'Hemoptizie', 'Cianoză'];
    const ok = judgeGrila({ text: 'Sunt semne de insuficiență cardiacă stângă:', options: opts(texts, [0, 1, 3]), multipleCorrect: true, explanation: 'x' });
    expect(ok.problems).toEqual([]);
    const five = judgeGrila({ text: 'Sunt semne de insuficiență cardiacă stângă:', options: opts(texts, [0, 1, 2, 3, 4]), multipleCorrect: true, explanation: 'x' });
    expect(five.problems).toContain('correct-count');
    const one = judgeGrila({ text: 'Sunt semne de insuficiență cardiacă stângă:', options: opts(texts, [0]), multipleCorrect: true, explanation: 'x' });
    expect(one.problems).toContain('correct-count');
  });

  it('variante duplicate și „toate de mai sus”', () => {
    const dup = judgeGrila({ ...GOOD_SIMPLE, options: opts(['Sufluu diastolic', 'Sufluu diastolic', 'Click', 'Galop', 'Frecătură'], [0]) });
    expect(dup.problems).toContain('dup-options');
    const all = judgeGrila({ ...GOOD_SIMPLE, options: opts(['A', 'B', 'C', 'D', 'Toate cele de mai sus'], [4]) });
    expect(all.problems).toContain('all-of-above');
  });

  it('indiciu de lungime: singura corectă e cu mult mai lungă', () => {
    const q: GrilaLike = {
      ...GOOD_SIMPLE,
      options: opts(
        ['Sufluu sistolic', 'Click mezosistolic', 'Galop protodiastolic', 'Sufluu continuu', 'Sufluu diastolic de umplere cu rulment, întărire presistolică și pocnet de deschidere a mitralei'],
        [4],
      ),
    };
    expect(judgeGrila(q).problems).toContain('length-cue');
  });

  it('cuvinte absolute, fără explicație și sedilă', () => {
    const q: GrilaLike = {
      text: 'Despre hipertensiunea arterială esenţială este adevărat:',
      options: opts(['Apare întotdeauna cu simptome', 'Se tratează exclusiv chirurgical', 'Crește riscul vascular', 'Nu necesită control', 'Dispare spontan'], [2]),
    };
    const p = judgeGrila(q).problems;
    expect(p).toContain('absolute-word');
    expect(p).toContain('no-explanation');
    expect(p).toContain('sedilla');
  });

  it('enunț scurt sau interminabil', () => {
    expect(judgeGrila({ ...GOOD_SIMPLE, text: 'IMA?' }).problems).toContain('stem-short');
    expect(judgeGrila({ ...GOOD_SIMPLE, text: 'Un pacient foarte complicat. '.repeat(30) }).problems).toContain('stem-long');
  });

  it('setul de grile', () => {
    const bad: GrilaLike = { text: 'IMA?', options: opts(['a', 'b'], [0, 1]) };
    const set = judgeGrile([GOOD_SIMPLE, bad]);
    expect(set.weakIndexes).toEqual([1]);
  });
});

describe('rescriere LLM minimă', () => {
  const cards = [
    { front: 'Care este tratamentul de elecție în anafilaxie?', back: 'Adrenalina intramusculară.' },
    { front: 'AVRT?', back: 'Reintrare.' },
    { front: '[Cardio] Semn?', back: 'Dispnee' },
  ];

  it('trimite doar elementele slabe și rămâne în buget', () => {
    const set = judgeFlashcards(cards);
    const messages = buildFlashcardRewriteMessages(cards, set);
    expect(messages[1].content).not.toContain('anafilaxie');
    expect(messages[1].content.split('\n')).toHaveLength(2);
    expect(messagesTokens(messages)).toBeLessThanOrEqual(130);
  });

  it('plafonează numărul de elemente trimise', () => {
    const many = Array.from({ length: 30 }, () => ({ front: 'AVRT?', back: 'x' }));
    const msgs = buildFlashcardRewriteMessages(many, judgeFlashcards(many), 8);
    expect(msgs[1].content.split('\n')).toHaveLength(8);
  });

  it('parsează doar răspunsuri valide pentru indexurile cerute', () => {
    const reply = '```json\n[{"i":1,"front":"Ce este AVRT?","back":"Tahicardie prin reintrare atrioventriculară."},{"i":9,"front":"x","back":"y"},{"i":2,"front":"","back":"z"}]\n```';
    const map = parseFlashcardRewrite(reply, [1, 2]);
    expect([...map.keys()]).toEqual([1]);
    expect(map.get(1)?.front).toBe('Ce este AVRT?');
    expect(parseFlashcardRewrite('nu e json', [1]).size).toBe(0);
    expect(parseFlashcardRewrite(null, [1]).size).toBe(0);
  });

  it('grile: păstrează numărul de variante și poziția celor corecte', () => {
    const original: GrilaLike = {
      text: 'IMA?',
      options: opts(['a', 'b', 'c', 'd', 'e'], [2]),
    };
    const set = judgeGrile([original]);
    const msgs = buildGrilaRewriteMessages([original], set);
    expect(messagesTokens(msgs)).toBeLessThanOrEqual(130);

    const good = '[{"i":0,"text":"Care este cauza cea mai frecventă de IMA?","options":["Ruptura plăcii","Vasospasm","Embolie","Arterită","Disecție"]}]';
    const parsed = parseGrilaRewrite(good, [original], [0]);
    const applied = applyGrilaRewrite(original, parsed.get(0)!);
    expect(applied.options.map((o) => o.isCorrect)).toEqual([false, false, true, false, false]);
    expect(applied.options[2].text).toBe('Embolie');

    const wrongCount = '[{"i":0,"text":"x","options":["a","b"]}]';
    expect(parseGrilaRewrite(wrongCount, [original], [0]).size).toBe(0);
  });
});
