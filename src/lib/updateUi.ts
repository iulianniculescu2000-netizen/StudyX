/**
 * Logica pură din fereastra de actualizări: „Amână până diseară”, viteza și
 * mărimea descărcării, lista „Ce s-a schimbat”. Fără React, ca să se testeze simplu.
 */

export const UPDATE_SNOOZE_KEY = 'studyx-update-snooze-until';
const EVENING_HOUR = 18;

/** Momentul până la care nu mai deranjăm: 18:00 azi, sau 18:00 mâine dacă ora 18 a trecut deja. */
export function snoozeUntilTonight(now: number): number {
  const d = new Date(now);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate(), EVENING_HOUR, 0, 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export function isSnoozed(until: number | null, now: number): boolean {
  return typeof until === 'number' && Number.isFinite(until) && now < until;
}

export function loadSnoozeUntil(): number | null {
  try {
    const raw = Number(localStorage.getItem(UPDATE_SNOOZE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function persistSnoozeUntil(until: number | null): void {
  try {
    if (until === null) localStorage.removeItem(UPDATE_SNOOZE_KEY);
    else localStorage.setItem(UPDATE_SNOOZE_KEY, String(until));
  } catch {
    // stocarea poate lipsi (mod privat); amânarea ține atunci doar până la repornire
  }
}

/** „12,4 MB”, „850 KB”; cu virgulă zecimală, ca în restul aplicației. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 100 ? 0 : 1).replace('.', ',')} MB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export interface DownloadStats {
  received: number;
  total: number;
  /** octeți pe secundă, netezit; 0 cât timp nu are suficiente măsurători */
  speed: number;
}

export const EMPTY_DOWNLOAD_STATS: DownloadStats = { received: 0, total: 0, speed: 0 };

/** Textul „12,4 MB din 80 MB · 2,1 MB/s”, sau null dacă procesul principal nu trimite mărimile. */
export function describeDownload(stats: DownloadStats): string | null {
  const { received, total, speed } = stats;
  if (!(received > 0) || !(total > 0)) return null;
  const base = `${formatBytes(Math.min(received, total))} din ${formatBytes(total)}`;
  return speed > 0 ? `${base} · ${formatSpeed(speed)}` : base;
}

/**
 * Calculează viteza din evenimentele de progres. Media mobilă exponențială netezește
 * salturile; un eveniment fără octeți noi nu strică ultima viteză cunoscută.
 */
export function createSpeedTracker() {
  let lastAt = 0;
  let lastReceived = 0;
  let speed = 0;
  return {
    update(received: number, total: number, now: number): DownloadStats {
      const whole = total > 0 ? total : 0;
      if (!(received > 0)) return { received: 0, total: whole, speed: Math.round(speed) };
      if (lastAt > 0 && received >= lastReceived) {
        const dt = (now - lastAt) / 1000;
        if (dt >= 0.25) {
          const instant = (received - lastReceived) / dt;
          speed = speed > 0 ? speed * 0.6 + instant * 0.4 : instant;
          lastAt = now;
          lastReceived = received;
        }
      } else {
        lastAt = now;
        lastReceived = received;
      }
      return { received, total: whole, speed: Math.round(speed) };
    },
  };
}

/**
 * Notele manifestului fără rândul de rezervă pe care îl pune `normalizeReleaseNotes`
 * când lansarea nu are note („StudyX 1.2.0” / „StudyX update”).
 */
export function meaningfulChanges(changes: readonly string[] | undefined, version?: string): string[] {
  if (!changes) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of changes) {
    const line = typeof raw === 'string' ? raw.trim() : '';
    if (!line || seen.has(line)) continue;
    if (/^StudyX update$/i.test(line)) continue;
    if (version && line.toLowerCase() === `studyx ${version}`.toLowerCase()) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}
