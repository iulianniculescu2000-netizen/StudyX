import { useEffect, useState } from 'react';
import { usePageVisible } from './usePageVisible';

/** Cheie implicită: minutul curent (fiecare tic produce o valoare nouă, ca un `setNow(new Date())` simplu). */
const everyTick = (date: Date) => String(date.getTime());

/** Ziua și ora locală: un salut „Bună dimineața / ziua / seara” sau o dată afișată nu se schimbă între ele. */
export const hourBucket = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;

/**
 * Ceasul unei componente, izolat: verifică ora la fiecare `intervalMs`, dar redesenează componenta doar când
 * se schimbă `bucket(now)` (de ex. ora sau ziua). Panoul nu se mai redesenează întreg în fiecare minut ca să
 * afișeze același salut și aceeași dată.
 *
 * Cât timp fereastra e ascunsă (minimizată), ticurile stau; la revenire ceasul se actualizează imediat, deci ce
 * se vede e la fel ca înainte.
 */
export function useNow(intervalMs: number, bucket: (date: Date) => string = everyTick): Date {
  const [now, setNow] = useState(() => new Date());
  const visible = usePageVisible();

  useEffect(() => {
    if (!visible) return undefined;
    const tick = () => {
      const next = new Date();
      // Aceeași cheie: păstrăm obiectul vechi, deci React nu redesenează.
      setNow((previous) => (bucket(previous) === bucket(next) ? previous : next));
    };
    // La revenirea ferestrei (sau la montare) verificăm imediat, dar în afara corpului efectului.
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, intervalMs);
    return () => { window.clearTimeout(first); window.clearInterval(id); };
  }, [intervalMs, bucket, visible]);

  return now;
}
