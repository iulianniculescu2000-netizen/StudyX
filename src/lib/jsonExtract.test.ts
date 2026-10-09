import { describe, expect, it } from 'vitest';
import { extractBalancedJson, extractJsonArrayLenient, salvageJsonArrayObjects } from './jsonExtract';

const QUESTION = (n: number) =>
  `{"text":"Intrebarea ${n}?","options":[{"text":"A","isCorrect":true},{"text":"B","isCorrect":false}]}`;

describe('extractBalancedJson', () => {
  it('reads a plain JSON object', () => {
    expect(extractBalancedJson('{"a":1}')).toBe('{"a":1}');
  });

  it('reads JSON out of a markdown fence', () => {
    const parsed = JSON.parse(extractBalancedJson('```json\n{"a":1}\n```')!);
    expect(parsed).toEqual({ a: 1 });
  });

  // Regression: slicing from the first brace anywhere started inside the prose.
  it('ignores braces in a conversational preamble', () => {
    const reply = 'Sigur! Iată {desigur} rezultatul:\n```json\n{"questions":[{"text":"X"}]}\n```';
    const parsed = JSON.parse(extractBalancedJson(reply)!);
    expect(parsed).toEqual({ questions: [{ text: 'X' }] });
  });

  it('is not fooled by braces inside string values', () => {
    const reply = 'text {nu} aici {"text":"foloseste { si } in enunt","ok":true}';
    const parsed = JSON.parse(extractBalancedJson(reply)!) as { text: string; ok: boolean };
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toContain('{');
  });

  it('prefers the substantial payload over a small parseable preamble', () => {
    const reply = '{"a":1} apoi raspunsul real: {"questions":[{"text":"X"},{"text":"Y"}]}';
    const parsed = JSON.parse(extractBalancedJson(reply)!) as { questions?: unknown[] };
    expect(parsed.questions).toHaveLength(2);
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractBalancedJson('Nu pot genera acum.')).toBeNull();
  });
});

describe('salvageJsonArrayObjects', () => {
  // Regression: lastIndexOf(']') landed on an inner options array, so the whole
  // batch failed to parse and the complete questions in it were discarded.
  it('recovers the complete questions from a truncated array', () => {
    const truncated = `[${QUESTION(1)},${QUESTION(2)},{"text":"Intrebarea 3?","opti`;
    const salvaged = JSON.parse(salvageJsonArrayObjects(truncated)!) as Array<{ text: string }>;
    expect(salvaged).toHaveLength(2);
    expect(salvaged.map((q) => q.text)).toEqual(['Intrebarea 1?', 'Intrebarea 2?']);
  });

  it('returns null when nothing complete survived', () => {
    expect(salvageJsonArrayObjects('[{"text":"taiat imedi')).toBeNull();
  });

  it('skips a malformed entry without losing the rest', () => {
    const mixed = `[${QUESTION(1)},{not json},${QUESTION(2)}]`;
    const salvaged = JSON.parse(salvageJsonArrayObjects(mixed)!) as unknown[];
    expect(salvaged).toHaveLength(2);
  });
});

describe('extractJsonArrayLenient', () => {
  it('returns an intact array unchanged in meaning', () => {
    const whole = `[${QUESTION(1)},${QUESTION(2)}]`;
    expect(JSON.parse(extractJsonArrayLenient(whole)!)).toHaveLength(2);
  });

  it('falls back to salvage when the reply was cut off', () => {
    const truncated = `[${QUESTION(1)},${QUESTION(2)},{"text":"incom`;
    expect(JSON.parse(extractJsonArrayLenient(truncated)!)).toHaveLength(2);
  });

  // Regression: a reply cut right after an inner "options" array made the lenient
  // extractor return that options array instead of the questions before it.
  it('keeps the questions when the cut lands just after an inner array', () => {
    const truncated = `[${QUESTION(1)},${QUESTION(2)},{"text":"Intrebarea 3?","options":["a","b","c"],"corr`;
    const parsed = JSON.parse(extractJsonArrayLenient(truncated)!) as Array<{ text: string }>;
    expect(parsed.map((q) => q.text)).toEqual(['Intrebarea 1?', 'Intrebarea 2?']);
  });

  it('ignores a stray bracket in the preamble', () => {
    const reply = `Iată [lista] cerută:
[${QUESTION(1)},${QUESTION(2)}]`;
    expect(JSON.parse(extractJsonArrayLenient(reply)!)).toHaveLength(2);
  });

  it('handles a fenced array with a preamble', () => {
    const reply = `Iată grilele:\n\`\`\`json\n[${QUESTION(1)}]\n\`\`\``;
    expect(JSON.parse(extractJsonArrayLenient(reply)!)).toHaveLength(1);
  });
});
