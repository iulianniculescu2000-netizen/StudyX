import type { ModelStatus } from './providerStatus';

/** „14:32” azi, „mâine 02:00”, altfel „15.10, 02:00”. Ceasul vine de la apelant. */
export function formatClock(timestamp: number, now: number): string {
  const time = new Date(timestamp).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diffDays = Math.round((day(timestamp) - day(now)) / 86_400_000);
  if (diffDays === 0) return time;
  if (diffDays === 1) return `mâine ${time}`;
  if (diffDays === -1) return `ieri ${time}`;
  const date = new Date(timestamp);
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}, ${time}`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.ceil(seconds / 3600)} h`;
}

export type StatusTone = 'ok' | 'warn' | 'bad' | 'idle';

/** Eticheta scurtă și detaliul unei stări, în română. */
export function describeStatus(status: ModelStatus, now: number): { tone: StatusTone; label: string; detail?: string } {
  switch (status.kind) {
    case 'ok': return { tone: 'ok', label: 'Merge', detail: `verificat ${formatClock(status.at, now)}` };
    case 'quota': return { tone: 'warn', label: `Cotă epuizată până la ${formatClock(status.until, now)}`, detail: 'Aplicația folosește alt model până atunci.' };
    case 'rate': return { tone: 'warn', label: `Limită de cereri · încearcă peste ${formatSeconds(status.retryInSeconds)}` };
    case 'keyRejected': return { tone: 'bad', label: 'Cheie respinsă', detail: 'Furnizorul nu acceptă cheia. Verific-o sau creeaz-o din nou.' };
    case 'retired': return { tone: 'bad', label: 'Retras / indisponibil pentru cheia ta', detail: 'Nu mai e oferit pentru cheia ta; aplicația nu îl mai încearcă la alegere.' };
    case 'error': return { tone: 'warn', label: 'Fără răspuns', detail: status.detail };
    default: return { tone: 'idle', label: 'Nu e verificat încă' };
  }
}
