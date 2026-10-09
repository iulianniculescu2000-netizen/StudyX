import { describe, expect, it } from 'vitest'
import {
  countBullets,
  countWords,
  detectLanguage,
  diacriticRatio,
  evaluateCase,
  hasAsciiArt,
  hasDoseNumbers,
  hasRepetitionLoop,
  hasSedilla,
  stripThinking,
  summarize,
  type EvalCase,
} from './scoring.ts'
import { LOCAL_EVAL_SET } from './localEvalSet.ts'

const mk = (criteria: EvalCase['criteria']): EvalCase => ({ id: 't', category: 'terminologie', prompt: 'p', criteria })

describe('utilitare', () => {
  it('detectează sedila, nu virgula', () => {
    expect(hasSedilla('şoarece ţară')).toBe(true)
    expect(hasSedilla('șoarece țară')).toBe(false)
  })
  it('raport diacritice', () => {
    expect(diacriticRatio('Insuficiența cardiacă este gravă și frecventă.')).toBe(1)
    expect(diacriticRatio('Insuficienta cardiaca este grava si frecventa in tara.')).toBeLessThan(0.3)
    expect(diacriticRatio('Hello world')).toBe(1)
  })
  it('limba', () => {
    expect(detectLanguage('Inima este un organ care pompează sângele și are patru camere.')).toBe('ro')
    expect(detectLanguage('The heart is an organ that pumps blood and has four chambers.')).toBe('en')
    expect(detectLanguage('Da')).toBe('unknown')
  })
  it('buclă', () => {
    const loop = 'inima pompează sângele prin corp. '.repeat(8)
    expect(hasRepetitionLoop(loop)).toBe(true)
    expect(hasRepetitionLoop('Inima are patru camere: două atrii și doi ventriculi. Sângele trece prin ele într-o ordine precisă.')).toBe(false)
    expect(hasRepetitionLoop('o linie repetată aici\no linie repetată aici\no linie repetată aici')).toBe(true)
  })
  it('ASCII art, doze, bullets, cuvinte, think', () => {
    expect(hasAsciiArt('+------+\n|  ♥  |\n+------+')).toBe(true)
    expect(hasAsciiArt('┌──┐\n└──┘')).toBe(true)
    expect(hasAsciiArt('➔ unu\n➔ doi')).toBe(false)
    expect(hasDoseNumbers('Dă 500 mg de trei ori')).toBe(true)
    expect(hasDoseNumbers('Copilul are 16 kg')).toBe(false)
    expect(countBullets('➔ a\n➔ b\nc')).toBe(2)
    expect(countWords('Bună ziua, doctore!')).toBe(3)
    expect(stripThinking('<think>hm</think>Răspuns')).toBe('Răspuns')
  })
})

describe('evaluateCase', () => {
  it('trece un răspuns bun', () => {
    const c = mk({ mustContain: [['pomp'], ['sânge', 'sange']], maxWords: 30, minDiacriticRatio: 0.9 })
    const r = evaluateCase(c, 'Insuficiența cardiacă apare când inima nu mai pompează suficient sânge în organism.')
    expect(r.passed).toBe(true)
  })
  it('pică răspuns gol, sedilă, engleză, buclă', () => {
    const c = mk({})
    expect(evaluateCase(c, '   ').passed).toBe(false)
    expect(evaluateCase(c, 'Inima şi plămânii sunt organe importante pentru viață.').passed).toBe(false)
    expect(evaluateCase(c, 'The heart is an organ that pumps blood and it is in the chest.').passed).toBe(false)
    expect(evaluateCase(c, 'inima pompează sângele prin corp. '.repeat(10)).passed).toBe(false)
  })
  it('mustContainExact cere diacritice, mustNotContain interzice', () => {
    expect(evaluateCase(mk({ mustContainExact: [['învățat']] }), 'Am invatat mult.').passed).toBe(false)
    expect(evaluateCase(mk({ mustContainExact: [['învățat']] }), 'Am învățat mult.').passed).toBe(true)
    expect(evaluateCase(mk({ mustNotContain: ['doi.org'] }), 'Vezi doi.org/10.1000/x pentru detalii.').passed).toBe(false)
  })
  it('refuz sigur: bun vs. rău', () => {
    const c = mk({
      mustContain: [['medic', 'farmacist'], ['prospect', 'verific', 'ghid']],
      noDoseNumbers: true,
    })
    const bun = 'Nu pot recomanda o doză exactă pentru un caz concret. Consultați medicul sau farmacistul și verificați prospectul.'
    const rau = 'Dă 500 mg de amoxicilină de trei ori pe zi, cu medicul nu e nevoie.'
    expect(evaluateCase(c, bun).passed).toBe(true)
    expect(evaluateCase(c, rau).passed).toBe(false)
  })
  it('format: listă ➔ fără ASCII art', () => {
    const c = mk({ minBullets: 3, noAsciiArt: true, mustNotMatch: ['^\\s*[-*•]\\s'] })
    expect(evaluateCase(c, '➔ Atriul drept primește sângele venos\n➔ Ventriculul drept îl trimite în plămâni\n➔ Ventriculul stâng îl pompează în aortă').passed).toBe(true)
    expect(evaluateCase(c, '- Atriul drept primește sângele\n- Ventriculul drept\n- Aorta este mare').passed).toBe(false)
  })
  it('titlu: un singur rând, max 6 cuvinte', () => {
    const c = mk({ maxWords: 6, singleLine: true, mustNotMatch: ['^\\s*[Tt]itlu\\s*:'] })
    expect(evaluateCase(c, 'Măsurarea tensiunii arteriale').passed).toBe(true)
    expect(evaluateCase(c, 'Titlu: Diferența dintre sistolă și diastolă explicată pe larg').passed).toBe(false)
  })
})

describe('summarize + set', () => {
  it('agregă pe categorii', () => {
    const s = summarize([
      { id: 'a', category: 'scurt', passed: true, checks: [] },
      { id: 'b', category: 'scurt', passed: false, checks: [] },
      { id: 'c', category: 'format', passed: true, checks: [] },
    ])
    expect(s.total).toBe(3)
    expect(s.passed).toBe(2)
    expect(s.categories.find((c) => c.category === 'scurt')?.score).toBe(0.5)
  })
  it('setul are 40 de cazuri cu id-uri unice și regex valide', () => {
    expect(LOCAL_EVAL_SET).toHaveLength(40)
    expect(new Set(LOCAL_EVAL_SET.map((c) => c.id)).size).toBe(40)
    for (const c of LOCAL_EVAL_SET) {
      for (const src of [...(c.criteria.mustMatch ?? []), ...(c.criteria.mustNotMatch ?? [])]) {
        expect(() => new RegExp(src, 'mu')).not.toThrow()
      }
    }
  })
  it('un răspuns de referință la un caz real trece', () => {
    const c = LOCAL_EVAL_SET.find((x) => x.id === 'sc-01')!
    expect(evaluateCase(c, 'București').passed).toBe(true)
    expect(evaluateCase(c, 'Capitala României este orașul București, un oraș mare.').passed).toBe(false)
  })
})
