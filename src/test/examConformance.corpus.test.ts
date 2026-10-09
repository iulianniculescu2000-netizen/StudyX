/**
 * Validates the yardstick against the thing it was measured on.
 *
 * The targets in `examConformance.ts` came from the real question banks, so the
 * real questions must score high when fed back through the scorer. If a future
 * change to the metrics quietly breaks that, this test fails and the score
 * stops meaning "looks like the exam".
 *
 * The corpus lives outside the repo (the user's own PDFs), so the whole suite
 * skips when the files aren't there — it is a calibration check, not a gate.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { formatConformanceReport, scoreExamConformance } from '../lib/ai/examConformance';
import type { Question } from '../types';

const CORPUS = [
  'C:/Users/Asus/Desktop/Rezidentiat/Grile/Grile Rezidentiat (3500).pdf',
  'C:/Users/Asus/Desktop/Rezidentiat/Grile/Modele Grile 1.pdf',
];

const available = CORPUS.filter((path) => existsSync(path));

async function parseQuestions(path: string, fromPage: number, toPage: number): Promise<Question[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  let text = '';
  for (let page = fromPage; page <= Math.min(toPage, doc.numPages); page += 1) {
    const rendered = await doc.getPage(page);
    const content = await rendered.getTextContent();
    text += content.items.map((item: { str?: string; hasEOL?: boolean }) => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
    rendered.cleanup();
  }
  await loadingTask.destroy();

  const lines = text.split('\n').map((line) => line.replace(/\s+/g, ' ').replace(/\s+([,;:.])/g, '$1').trim()).filter(Boolean);
  const questions: Question[] = [];
  let current: { stem: string; options: string[] } | null = null;

  const push = () => {
    if (!current || current.options.length < 3 || current.stem.length < 15) return;
    questions.push({
      id: String(questions.length),
      text: current.stem,
      multipleCorrect: false,
      difficulty: 'medium',
      explanation: '',
      // The banks print no key in the body; the shape is what is being measured.
      options: current.options.map((option, index) => ({ id: String(index), text: option, isCorrect: index === 0 })),
    });
  };

  for (const line of lines) {
    const stem = line.match(/^(\d{1,3})[.)]\s*(\*|\^)?\s*(.+)$/);
    const option = line.match(/^([A-E])[.)]\s+(.+)$/);
    if (stem && !option) {
      push();
      current = { stem: stem[3], options: [] };
      continue;
    }
    if (option && current) {
      current.options.push(option[2]);
      continue;
    }
    if (!current) continue;
    if (current.options.length === 0) current.stem += ` ${line}`;
    else current.options[current.options.length - 1] += ` ${line}`;
  }
  push();

  return questions;
}

describe.skipIf(available.length === 0)('the real exam scores high on its own yardstick', () => {
  it.each(available)('%s', async (path) => {
    const questions = await parseQuestions(path, 30, 120);
    expect(questions.length).toBeGreaterThan(50);

    const report = scoreExamConformance(questions, 'residency');
    console.log(`${path.split('/').pop()}: ${report.score}/100 din ${report.questions} grile reale`);
    report.metrics.forEach((metric) => {
      console.log(`  ${metric.ok ? '✓' : '✗'} ${metric.id}: ${metric.id.endsWith('Length') ? Math.round(metric.value) : `${Math.round(metric.value * 100)}%`} (țintă ${metric.target})`);
    });

    expect(report.score).toBeGreaterThanOrEqual(83);
  }, 300000);
});

/**
 * Scores a set exported from the app, so a generated batch can be compared with
 * the exam on demand:
 *
 *   STUDYX_EVAL_QUIZ="C:/cale/catre/set-exportat.json" npx vitest run src/lib/ai/examConformance.corpus.test.ts
 *
 * Accepts either a single quiz export or an array of them.
 */
const exportPath = process.env.STUDYX_EVAL_QUIZ;

describe.skipIf(!exportPath || !existsSync(exportPath))('a generated set, measured against the exam', () => {
  it('reports how close it lands', () => {
    const parsed = JSON.parse(readFileSync(exportPath!, 'utf-8'));
    const quizzes = Array.isArray(parsed) ? parsed : [parsed];
    const questions: Question[] = quizzes.flatMap((quiz: { questions?: Question[] }) => quiz.questions ?? []);
    expect(questions.length).toBeGreaterThan(0);

    const style = JSON.stringify(quizzes).includes('grila-simpla') ? 'simple' : 'residency';
    console.log(formatConformanceReport(scoreExamConformance(questions, style)));
  });
});
