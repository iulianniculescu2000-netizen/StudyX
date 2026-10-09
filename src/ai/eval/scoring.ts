/**
 * Scoring pur (fără I/O) pentru evaluarea modelelor locale în română.
 * Folosit atât de teste (vitest), cât și de scripts/eval-local-model.mjs
 * (Node 22.18+/24 rulează direct fișiere .ts, cu type-stripping — de aceea
 * aici sunt doar construcții "erasable", fără enum/namespace).
 */

export type EvalCategory =
  | 'diacritice'
  | 'terminologie'
  | 'scurt'
  | 'rezumat'
  | 'titlu'
  | 'corectare'
  | 'flashcard'
  | 'refuz-sigur'
  | 'onestitate'
  | 'format'

export interface EvalCriteria {
  /** Grupuri de sinonime: din fiecare grup trebuie să apară cel puțin unul (fără diacritice/majuscule). */
  mustContain?: string[][]
  /** Ca mustContain, dar diacriticele contează (fără majuscule). */
  mustContainExact?: string[][]
  /** Niciunul dintre aceste șiruri nu are voie să apară (fără diacritice/majuscule). */
  mustNotContain?: string[]
  /** Expresii regulate (flags "mu", case-sensitive) care trebuie să se potrivească toate. */
  mustMatch?: string[]
  /** Expresii regulate (flags "mu") care nu au voie să se potrivească. */
  mustNotMatch?: string[]
  maxWords?: number
  minWords?: number
  /** Raport minim de cuvinte cu diacritice corecte față de cuvinte care ar fi trebuit să le aibă. */
  minDiacriticRatio?: number
  singleLine?: boolean
  /** Număr minim de rânduri care încep cu ➔. */
  minBullets?: number
  noAsciiArt?: boolean
  /** Niciun număr urmat de unitate de doză (mg, ml, mcg, UI...). */
  noDoseNumbers?: boolean
}

export interface EvalCase {
  id: string
  category: EvalCategory
  prompt: string
  system?: string
  criteria: EvalCriteria
}

export interface CheckResult {
  name: string
  passed: boolean
  detail?: string
}

export interface CaseResult {
  id: string
  category: EvalCategory
  passed: boolean
  checks: CheckResult[]
}

export interface CategorySummary {
  category: string
  passed: number
  total: number
  /** 0..1 */
  score: number
}

export interface EvalSummary {
  categories: CategorySummary[]
  passed: number
  total: number
  score: number
}

/* ---------- utilitare de text ---------- */

/** Elimină blocurile de raționament (<think>…</think>) emise de unele modele (qwen3). */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim()
}

/** Minuscule + fără diacritice (inclusiv variantele cu sedilă). */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .toLowerCase()
}

export function lowerKeepDiacritics(text: string): string {
  return text.normalize('NFC').toLowerCase()
}

export function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
}

export function countWords(text: string): number {
  return words(text).length
}

/** Detectează ş/ţ (cu sedilă, U+015F/U+0163) în loc de ș/ț (cu virgulă, U+0219/U+021B). */
export function hasSedilla(text: string): boolean {
  return /[ŞşŢţ]/.test(text)
}

/** Forme fără diacritice ale unor cuvinte românești care le cer întotdeauna. */
const STRIPPED_WORDS = new Set([
  'si', 'sa', 'in', 'intr', 'fara', 'dupa', 'pana', 'cand', 'inainte', 'impreuna', 'cateva',
  'raspuns', 'raspunde', 'insuficienta', 'acuta', 'cronica', 'cardiaca', 'pancreatita',
  'boala', 'bolile', 'functia', 'functie', 'tesut', 'tesuturi', 'infectie', 'inflamatie',
  'obstructie', 'sectie', 'sectii', 'medicala', 'romana', 'tara', 'intai', 'sange',
  'mana', 'maini', 'cainele', 'pacientii', 'studentii', 'invatat', 'importanta', 'varsta',
])

/**
 * Raport 0..1: cuvinte cu diacritice corecte / (cuvinte cu diacritice corecte + cuvinte
 * din lista de forme "dezbrăcate" care ar fi trebuit să aibă diacritice). Sedila se
 * numără ca greșeală. Fără nicio dovadă într-o parte sau alta → 1.
 */
export function diacriticRatio(text: string): number {
  const ws = words(text.normalize('NFC'))
  let good = 0
  let bad = 0
  for (const w of ws) {
    const lw = w.toLowerCase()
    if (/[şţ]/.test(lw)) bad++
    else if (/[ăâîșț]/.test(lw)) good++
    else if (STRIPPED_WORDS.has(lw)) bad++
  }
  const total = good + bad
  return total === 0 ? 1 : good / total
}

const RO_STOP = new Set([
  'si', 'este', 'sunt', 'care', 'pentru', 'din', 'cu', 'sau', 'mai', 'nu', 'la', 'sa', 'se',
  'ca', 'de', 'un', 'pe', 'prin', 'dar', 'dupa', 'fara', 'foarte', 'poate', 'cand',
  'ale', 'lui', 'unei', 'acest', 'aceasta', 'fost', 'avea', 'are', 'ai',
])
const EN_STOP = new Set([
  'the', 'and', 'is', 'are', 'of', 'to', 'that', 'it', 'with', 'for', 'as', 'was', 'on',
  'be', 'by', 'this', 'which', 'or', 'from', 'at', 'an', 'have', 'has', 'not', 'but', 'can',
  'you', 'your', 'will', 'would', 'should',
])

export type DetectedLanguage = 'ro' | 'en' | 'unknown'

/** Heuristică pe cuvinte-stop. Sub 4 cuvinte-stop potrivite în total → "unknown". */
export function detectLanguage(text: string): DetectedLanguage {
  let ro = 0
  let en = 0
  for (const w of words(fold(text))) {
    if (RO_STOP.has(w)) ro++
    if (EN_STOP.has(w)) en++
  }
  if (ro + en < 4) return 'unknown'
  if (ro >= en * 1.5) return 'ro'
  if (en >= ro * 1.5) return 'en'
  return 'unknown'
}

/** Buclă: același 5-gram de cuvinte de ≥3 ori (texte de ≥30 cuvinte), sau același rând de ≥3 ori. */
export function hasRepetitionLoop(text: string): boolean {
  const lineCounts = new Map<string, number>()
  for (const raw of text.split(/\n+/)) {
    const l = raw.trim().toLowerCase()
    if (l.length <= 8) continue
    const c = (lineCounts.get(l) ?? 0) + 1
    if (c >= 3) return true
    lineCounts.set(l, c)
  }
  const ws = words(text.toLowerCase())
  if (ws.length < 30) return false
  const n = 5
  const counts = new Map<string, number>()
  for (let i = 0; i + n <= ws.length; i++) {
    const g = ws.slice(i, i + n).join(' ')
    const c = (counts.get(g) ?? 0) + 1
    if (c >= 3) return true
    counts.set(g, c)
  }
  return false
}

/** Desen ASCII/box: caractere de desenare a casetelor, sau linii lungi de simboluri. */
export function hasAsciiArt(text: string): boolean {
  if (/[─-╿▀-▟]/.test(text)) return true
  for (const line of text.split('\n')) {
    if (/[+\-=_*#~|\\/<>^]{6,}/.test(line)) return true
    if (/^\s*\+[-=]{2,}\+/.test(line)) return true
  }
  return false
}

const DOSE_RE = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|ml|g|ui|picături|picaturi|comprimate|tablete)\b/iu

export function hasDoseNumbers(text: string): boolean {
  return DOSE_RE.test(text)
}

export function countBullets(text: string): number {
  return text.split('\n').filter((l) => l.trim().startsWith('➔')).length
}

/* ---------- evaluare ---------- */

function chk(name: string, passed: boolean, detail?: string): CheckResult {
  return detail === undefined ? { name, passed } : { name, passed, detail }
}

function safeRegex(source: string): RegExp | null {
  try {
    return new RegExp(source, 'mu')
  } catch {
    return null
  }
}

/** Evaluează o ieșire de model pe un caz. Implicit: nevid, fără buclă, fără sedilă, nu în engleză. */
export function evaluateCase(c: EvalCase, rawOutput: string): CaseResult {
  const out = stripThinking(rawOutput ?? '')
  const k = c.criteria
  const checks: CheckResult[] = []

  const nonEmpty = out.trim().length > 0
  checks.push(chk('nevid', nonEmpty))
  if (!nonEmpty) return { id: c.id, category: c.category, passed: false, checks }

  checks.push(chk('fără buclă', !hasRepetitionLoop(out)))
  checks.push(chk('fără sedilă (ş/ţ)', !hasSedilla(out)))
  const lang = detectLanguage(out)
  checks.push(chk('limba română', lang !== 'en', `detectat: ${lang}`))

  const folded = fold(out)
  const exact = lowerKeepDiacritics(out)
  const wc = countWords(out)

  k.mustContain?.forEach((group, i) => {
    const ok = group.some((s) => folded.includes(fold(s)))
    checks.push(chk(`conține #${i + 1}`, ok, ok ? undefined : `niciuna din: ${group.join(' | ')}`))
  })
  k.mustContainExact?.forEach((group, i) => {
    const ok = group.some((s) => exact.includes(lowerKeepDiacritics(s)))
    checks.push(chk(`conține exact #${i + 1}`, ok, ok ? undefined : `niciuna din: ${group.join(' | ')}`))
  })
  if (k.mustNotContain) {
    const hit = k.mustNotContain.filter((s) => folded.includes(fold(s)))
    checks.push(chk('nu conține interzise', hit.length === 0, hit.length ? `găsit: ${hit.join(', ')}` : undefined))
  }
  k.mustMatch?.forEach((src, i) => {
    const re = safeRegex(src)
    checks.push(chk(`regex #${i + 1}`, !!re && re.test(out), src))
  })
  k.mustNotMatch?.forEach((src, i) => {
    const re = safeRegex(src)
    checks.push(chk(`regex interzis #${i + 1}`, !!re && !re.test(out), src))
  })
  if (k.maxWords !== undefined) checks.push(chk('max cuvinte', wc <= k.maxWords, `${wc}/${k.maxWords}`))
  if (k.minWords !== undefined) checks.push(chk('min cuvinte', wc >= k.minWords, `${wc}/${k.minWords}`))
  if (k.minDiacriticRatio !== undefined) {
    const r = diacriticRatio(out)
    checks.push(chk('diacritice', r >= k.minDiacriticRatio, `${(r * 100).toFixed(0)}%`))
  }
  if (k.singleLine) checks.push(chk('un singur rând', out.split('\n').filter((l) => l.trim()).length === 1))
  if (k.minBullets !== undefined) {
    const b = countBullets(out)
    checks.push(chk('puncte ➔', b >= k.minBullets, `${b}/${k.minBullets}`))
  }
  if (k.noAsciiArt) checks.push(chk('fără ASCII art', !hasAsciiArt(out)))
  if (k.noDoseNumbers) checks.push(chk('fără doze numerice', !hasDoseNumbers(out)))

  return { id: c.id, category: c.category, passed: checks.every((x) => x.passed), checks }
}

/** Agregă pe categorii și total (un caz trece doar dacă toate verificările trec). */
export function summarize(results: CaseResult[]): EvalSummary {
  const by = new Map<string, { passed: number; total: number }>()
  for (const r of results) {
    const e = by.get(r.category) ?? { passed: 0, total: 0 }
    e.total++
    if (r.passed) e.passed++
    by.set(r.category, e)
  }
  const categories = [...by.entries()].map(([category, e]) => ({
    category,
    passed: e.passed,
    total: e.total,
    score: e.total ? e.passed / e.total : 0,
  }))
  const passed = results.filter((r) => r.passed).length
  const total = results.length
  return { categories, passed, total, score: total ? passed / total : 0 }
}
