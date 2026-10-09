import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const TOUR_DIR = join('src', 'tutorial', 'tours');

describe('tutorial spotlight targets', () => {
  const targets = sourceFiles(TOUR_DIR).flatMap((file) => (
    [...readFileSync(file, 'utf8').matchAll(/target: '\[data-tutorial="([^"]+)"\]'/g)].map((match) => match[1])
  ));

  const anchored = new Set<string>();
  for (const file of sourceFiles('src').filter((path) => !path.startsWith(TOUR_DIR))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/data-tutorial(?:="|': ')([^"']+)/g)) anchored.add(match[1]);
  }

  it('finds the targets it checks', () => {
    expect(targets.length).toBeGreaterThan(10);
  });

  it('has an element carrying every data-tutorial a step points at', () => {
    const missing = [...new Set(targets)].filter((target) => !anchored.has(target));
    expect(missing).toEqual([]);
  });
});
