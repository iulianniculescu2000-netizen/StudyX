import { useAIStore } from '../../store/aiStore';
import { groqStream } from '../groq';
import { friendlyAIError } from '../ai/friendlyError';
import {
  DAY_TARGET, activePhase, addDays, donePages, mondayOf, studyStats, totalPages,
} from './engine';
import type { Plan, PlanState } from './types';

export function hasAIKey(): boolean {
  const { apiKey, providerKeys } = useAIStore.getState();
  return !!apiKey.trim() || Object.values(providerKeys).some((key) => !!key?.trim());
}

/** The numbers the assistant is allowed to talk about: the last eight weeks, the streak, the plan's pace. */
function snapshot(plan: Plan, s: PlanState, today: string) {
  const st = studyStats(s, today);
  const ph = Math.min(activePhase(plan, today), 4);
  const planned = plan.topics.reduce((a, c) => a + (c.b[ph - 1] <= today ? c.pages : 0), 0);

  const weeks: Array<{ saptamana: string; ore: number; grile: number; corecte: number }> = [];
  let monday = mondayOf(today);
  for (let k = 0; k < 8; k += 1) {
    let h = 0; let g = 0; let ok = 0;
    for (let j = 0; j < 7; j += 1) {
      const l = s.log[addDays(monday, j)];
      if (l) { h += l.h ?? 0; g += l.g ?? 0; ok += l.ok ?? 0; }
    }
    weeks.unshift({ saptamana: monday, ore: Number(h.toFixed(2)), grile: g, corecte: ok });
    monday = addDays(monday, -7);
  }

  return {
    azi: today,
    examen: s.exam,
    faza_activa: ph,
    pagini_terminate: Math.round(donePages(plan, s, ph)),
    pagini_planificate_pana_azi: Math.round(planned),
    total_pagini: Math.round(totalPages(plan)),
    tinta_ore_pe_saptamana: DAY_TARGET.reduce((a, b) => a + b, 0),
    saptamani: weeks,
    zile_inregistrate: st.days.length,
    serie_zile: st.streak,
    ore_medii_pe_zi_saptamanii: st.weekdayAvg.map((v) => (v === null ? null : Number(v.toFixed(2)))),
    note_recente: st.days.slice(-14).map((d) => ({ zi: d, ore: s.log[d].h, energie: s.log[d].e, nota: s.log[d].n ?? '' })),
  };
}

const INSTRUCTION =
  'Ești un coleg de studiu care ajută un student la medicină să se pregătească pentru rezidențiat (examen în noiembrie 2027). '
  + 'Mai jos sunt datele lui din jurnalul de studiu, în format JSON. Scrie în română, direct și simplu, fără introduceri de complezență. '
  + 'Structura: (1) ce merge bine, (2) riscuri sau tipare (regularitate, volum de ore, acuratețe la grile, ritm față de plan), '
  + '(3) trei ajustări concrete pentru săptămâna următoare. Folosește doar cifrele din date, nu inventa nimic; '
  + 'dacă datele sunt prea puține pentru o concluzie, spune asta explicit. Maxim 220 de cuvinte. Fără sfaturi medicale.';

/**
 * Asks the app's assistant (the same keys and providers as the chat) for a short read on the student's rhythm.
 * Streams the text through `onText`; throws a readable Error when there is no key or the provider refuses.
 */
export async function analyzeProgress(
  plan: Plan,
  s: PlanState,
  today: string,
  { signal, onText }: { signal?: AbortSignal; onText: (text: string) => void },
): Promise<string> {
  if (!hasAIKey()) throw new Error('Adaugă o cheie AI în Setări ca să poți folosi analiza.');
  let text = '';
  try {
    await groqStream(
      [{ role: 'user', content: `${INSTRUCTION}\n\n${JSON.stringify(snapshot(plan, s, today))}` }],
      (delta) => { text += delta; onText(text); },
      0.4,
      signal,
      true,
    );
    return text;
  } catch (error) {
    if (signal?.aborted) return text;
    throw new Error(friendlyAIError(error));
  }
}
