import { describe, expect, it } from 'vitest';
import {
  createSpeedTracker, describeDownload, formatBytes, isSnoozed, meaningfulChanges, snoozeUntilTonight,
} from './updateUi';

const at = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m, 0, 0).getTime();

describe('snoozeUntilTonight', () => {
  it('înainte de 18:00 amână până la 18:00 în aceeași zi', () => {
    expect(snoozeUntilTonight(at(9, 30))).toBe(at(18));
    expect(snoozeUntilTonight(at(17, 59))).toBe(at(18));
  });
  it('de la 18:00 încolo amână până la 18:00 a doua zi', () => {
    expect(snoozeUntilTonight(at(18))).toBe(at(18, 0, 16));
    expect(snoozeUntilTonight(at(23, 40))).toBe(at(18, 0, 16));
  });
  it('trece corect peste sfârșitul lunii', () => {
    const lastDay = new Date(2026, 9, 31, 20, 0).getTime();
    expect(snoozeUntilTonight(lastDay)).toBe(new Date(2026, 10, 1, 18, 0).getTime());
  });
});

describe('isSnoozed', () => {
  it('ține până la limită, apoi expiră', () => {
    expect(isSnoozed(at(18), at(12))).toBe(true);
    expect(isSnoozed(at(18), at(18))).toBe(false);
    expect(isSnoozed(at(18), at(19))).toBe(false);
  });
  it('fără valoare nu e amânat', () => {
    expect(isSnoozed(null, at(12))).toBe(false);
    expect(isSnoozed(Number.NaN, at(12))).toBe(false);
  });
});

describe('formatBytes / describeDownload', () => {
  it('formatează KB și MB cu virgulă', () => {
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12,4 MB');
    expect(formatBytes(339 * 1024 * 1024)).toBe('339 MB');
    expect(formatBytes(0)).toBe('0 KB');
  });
  it('arată mărimile doar dacă există', () => {
    expect(describeDownload({ received: 0, total: 0, speed: 0 })).toBeNull();
    expect(describeDownload({ received: 5, total: 0, speed: 0 })).toBeNull();
    const mb = 1024 * 1024;
    expect(describeDownload({ received: 10 * mb, total: 80 * mb, speed: 2 * mb })).toBe('10,0 MB din 80,0 MB · 2,0 MB/s');
    expect(describeDownload({ received: 10 * mb, total: 80 * mb, speed: 0 })).toBe('10,0 MB din 80,0 MB');
  });
});

describe('createSpeedTracker', () => {
  const mb = 1024 * 1024;
  it('prima măsurătoare nu are viteză, a doua da', () => {
    const t = createSpeedTracker();
    expect(t.update(1 * mb, 50 * mb, 1000).speed).toBe(0);
    expect(t.update(3 * mb, 50 * mb, 2000).speed).toBe(2 * mb);
  });
  it('netezește saltul și ignoră evenimentele prea dese', () => {
    const t = createSpeedTracker();
    t.update(1 * mb, 50 * mb, 1000);
    t.update(3 * mb, 50 * mb, 2000); // 2 MB/s
    const burst = t.update(3 * mb + 1000, 50 * mb, 2050); // sub 0,25 s: neschimbat
    expect(burst.speed).toBe(2 * mb);
    const next = t.update(5 * mb, 50 * mb, 3000); // instant ~2 MB/s
    expect(next.speed).toBeGreaterThan(1.9 * mb);
    expect(next.speed).toBeLessThan(2.1 * mb);
  });
  it('percent fără octeți (suprapunere, -1) nu strică starea', () => {
    const t = createSpeedTracker();
    expect(t.update(0, 0, 1000)).toEqual({ received: 0, total: 0, speed: 0 });
    expect(t.update(-1, -1, 2000)).toEqual({ received: 0, total: 0, speed: 0 });
  });
});

describe('meaningfulChanges', () => {
  it('scoate rândul de rezervă din updater', () => {
    expect(meaningfulChanges(['StudyX 1.2.0'], '1.2.0')).toEqual([]);
    expect(meaningfulChanges(['StudyX update'], '1.2.0')).toEqual([]);
  });
  it('păstrează notele reale, fără goluri și dubluri', () => {
    expect(meaningfulChanges(['  Copie înainte de actualizare ', '', 'Copie înainte de actualizare', 'Progres cu viteză'], '1.2.0'))
      .toEqual(['Copie înainte de actualizare', 'Progres cu viteză']);
  });
  it('acceptă lipsa notelor', () => {
    expect(meaningfulChanges(undefined)).toEqual([]);
  });
});
