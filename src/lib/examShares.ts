import raw from '../data/rezidentiat/examShares.json';
import { apportion } from './ai/examBlueprint';

/**
 * Cât din examenul de Rezidențiat cade pe fiecare specialitate: cifre agregate pe cele 1200 de grile reale 2021–2025
 * (`scripts/build-exam-shares.py`, fără text de subiecte). O simulare de 200 de grile are astfel ~24 de cardiologie
 * și ~9 de ortopedie, nu un număr la întâmplare. Un indiciu din trecut, nu o garanție pentru examenul viitor.
 */
interface Family {
  name: string;
  keywords: string[];
  questions: number;
}
const FAMILIES = (raw as { total: number; families: Family[] }).families;
const TOTAL = (raw as { total: number }).total;

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Specialitatea din examen căreia îi aparține un nume de disciplină din bancă; potrivirea cea mai lungă câștigă. */
export function examFamilyOf(name: string): string | null {
  const text = fold(name);
  if (!text) return null;
  let best: { family: string; length: number } | null = null;
  for (const family of FAMILIES) {
    for (const keyword of family.keywords) {
      const key = fold(keyword);
      const hit = key.length < 4 ? text === key : text.includes(key);
      if (hit && (!best || key.length > best.length)) best = { family: family.name, length: key.length };
    }
  }
  return best?.family ?? null;
}

/** Grile din 200 care cad, în medie, pe o specialitate (0 dacă nu o cunoaștem). */
export function examShareOf(family: string, size = 200): number {
  const found = FAMILIES.find((f) => f.name === family);
  return found ? (found.questions * size) / TOTAL : 0;
}

/**
 * Împarte `count` grile între disciplinele disponibile, proporțional cu ponderea din examen. O disciplină care nu ajunge
 * cedează locurile celorlalte (tot după pondere); disciplinele fără pondere (Oftalmologie, Geriatrie…) completează doar la urmă.
 * `available` = câte grile are fiecare disciplină. Întoarce `null` când prea puține discipline se recunosc (ponderile nu spun nimic).
 */
export function allocateBySpecialty(count: number, available: Map<string, number>): Map<string, number> | null {
  const names = [...available.keys()];
  const familyOf = new Map(names.map((n) => [n, examFamilyOf(n)] as const));
  const totalAvailable = names.reduce((s, n) => s + (available.get(n) ?? 0), 0);
  const knownAvailable = names.reduce((s, n) => s + (familyOf.get(n) ? (available.get(n) ?? 0) : 0), 0);
  if (totalAvailable === 0 || knownAvailable / totalAvailable < 0.7) return null;

  // Ponderea unei specialități se împarte între disciplinele din bancă care îi aparțin.
  const perFamily = new Map<string, number>();
  for (const n of names) {
    const family = familyOf.get(n);
    if (family) perFamily.set(family, (perFamily.get(family) ?? 0) + 1);
  }
  const weight = new Map<string, number>();
  for (const n of names) {
    const family = familyOf.get(n);
    weight.set(n, family ? examShareOf(family) / (perFamily.get(family) ?? 1) : 0);
  }

  const take = new Map<string, number>(names.map((n) => [n, 0]));
  let left = Math.min(count, totalAvailable);
  // Runde: împarte ce a rămas după pondere între disciplinele cu loc, apoi redistribuie surplusul.
  for (let round = 0; left > 0 && round < 12; round += 1) {
    const open = names.filter((n) => (weight.get(n) ?? 0) > 0 && (take.get(n) ?? 0) < (available.get(n) ?? 0));
    if (open.length === 0) break;
    const quotas = apportion(left, open.map((n) => weight.get(n) ?? 0));
    let given = 0;
    open.forEach((n, i) => {
      const room = (available.get(n) ?? 0) - (take.get(n) ?? 0);
      const add = Math.min(quotas[i], room);
      take.set(n, (take.get(n) ?? 0) + add);
      given += add;
    });
    left -= given;
    if (given === 0) break;
  }
  // La urmă, disciplinele fără pondere (sau ce a mai rămas) completează.
  for (const n of [...names].sort((a, b) => (available.get(b) ?? 0) - (available.get(a) ?? 0))) {
    if (left <= 0) break;
    const room = (available.get(n) ?? 0) - (take.get(n) ?? 0);
    const add = Math.min(room, left);
    take.set(n, (take.get(n) ?? 0) + add);
    left -= add;
  }
  return take;
}
