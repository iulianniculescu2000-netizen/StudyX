import { describe, expect, it } from 'vitest';
import { HELP_TIPS, type HelpTipId } from './helpTips';
import { TOUR_IDS } from './tourMeta';

const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const code = Object.entries(sources)
  .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith('/tutorial/helpTips.ts'))
  .map(([, text]) => text);
const ids = Object.keys(HELP_TIPS) as HelpTipId[];

describe('registrul de indicii „?”', () => {
  it('fiecare text are titlu și corp nevide, sub 220 de caractere', () => {
    for (const id of ids) {
      const entry = HELP_TIPS[id] as { title: string; body: string };
      expect(entry.title.trim().length, id).toBeGreaterThan(0);
      expect(entry.body.trim().length, id).toBeGreaterThan(0);
      expect(entry.body.length, id).toBeLessThanOrEqual(220);
    }
  });

  it('fiecare indiciu oferă un ghid pas cu pas valid', () => {
    for (const id of ids) {
      const tour = (HELP_TIPS[id] as { tour?: string }).tour;
      expect(tour, `„${id}” trebuie să ofere un ghid`).toBeTruthy();
      expect(TOUR_IDS, id).toContain(tour);
    }
  });

  it('fiecare id din registru e folosit în cod', () => {
    for (const id of ids) {
      const used = code.some((text) => text.includes(`"${id}"`) || text.includes(`'${id}'`));
      expect(used, `„${id}” nu e folosit nicăieri`).toBe(true);
    }
  });

  it('fiecare <HelpTip id> din cod există în registru', () => {
    const missing: string[] = [];
    for (const text of code) {
      for (const match of text.matchAll(/<HelpTip[^>]*\bid="([^"]+)"/g)) if (!(match[1] in HELP_TIPS)) missing.push(match[1]);
    }
    expect(missing).toEqual([]);
  });
});
