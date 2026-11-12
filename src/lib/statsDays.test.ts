import { describe, expect, it } from 'vitest';
import { lastLocalDays, localDayKey, tooltipMeta } from './statsDays';

describe('statsDays', () => {
  it('cheia zilei folosește calendarul local, nu UTC', () => {
    const late = new Date(2026, 4, 10, 23, 59).getTime();
    const early = new Date(2026, 4, 11, 0, 1).getTime();
    expect(localDayKey(late)).toBe('2026-05-10');
    expect(localDayKey(early)).toBe('2026-05-11');
  });

  it('ferestrea are n zile consecutive, ultima fiind azi, chiar după miezul nopții', () => {
    const now = new Date(2026, 2, 1, 0, 5);
    const days = lastLocalDays(now, 14);
    expect(days).toHaveLength(14);
    expect(days[13].key).toBe('2026-03-01');
    expect(days[12].key).toBe('2026-02-28');
    expect(days[0].key).toBe('2026-02-16');
  });

  it('trece corect peste schimbarea orei', () => {
    const keys = lastLocalDays(new Date(2026, 2, 30, 0, 30), 5).map((d) => d.key);
    expect(keys).toEqual(['2026-03-26', '2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('etichete în română', () => {
    expect(tooltipMeta('acuratete')).toEqual({ label: 'Acuratețe', unit: '%' });
    expect(tooltipMeta('sesiuni').label).toBe('Sesiuni');
  });
});
