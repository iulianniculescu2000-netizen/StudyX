import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImportFromDocument from './ImportFromDocument';
import type { GrileExtractionResult } from '../lib/ai/grileImport';
import type { ParsedQuestion } from '../lib/ai/grileParser';

const mocks = vi.hoisted(() => ({ extract: vi.fn(), infer: vi.fn(), toast: vi.fn() }));
vi.mock('../lib/ai/grileImport', () => ({ extractGrileFromFiles: mocks.extract, toQuizImportData: vi.fn(), toQuizImportDataBySpecialty: vi.fn() }));
vi.mock('../lib/ai/grileAIFallback', () => ({ inferAnswersWithAI: mocks.infer }));
vi.mock('../theme/ThemeContext', () => ({ useTheme: () => ({}) }));
vi.mock('../hooks/useAdaptiveMotion', () => ({ useAdaptiveMotion: () => ({ calmMotion: true }) }));
vi.mock('../store/quizStore', () => ({ useQuizStore: () => ({ quizzes: [], addQuiz: vi.fn(), updateQuiz: vi.fn() }) }));
vi.mock('../store/folderStore', () => ({ useFolderStore: (selector: (s: unknown) => unknown) => selector({ folders: [], addFolder: vi.fn() }) }));
vi.mock('../store/aiStore', () => ({ useAIStore: (selector: (s: unknown) => unknown) => selector({ hasKey: true }) }));
vi.mock('../store/toastStore', () => ({ useToastStore: (selector: (s: unknown) => unknown) => selector({ addToast: mocks.toast }) }));

const question: ParsedQuestion = { text: 'Enunț', options: [{ text: 'Prima', isCorrect: false }, { text: 'A doua', isCorrect: false }], multipleCorrect: false, answerSource: 'none', confidence: 'low', warnings: [] };
function result(questions: ParsedQuestion[] = []): GrileExtractionResult {
  return { questions, perFile: [], stats: { total: questions.length, withAnswer: 0, needsReview: questions.length }, dedupe: { unique: questions, duplicatesRemoved: 0, conflicts: 0 } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function upload() {
  fireEvent.change(screen.getByLabelText('Alege documente sau imagini cu grile'), { target: { files: [new File(['text'], 'grile.txt', { type: 'text/plain' })] } });
}
beforeEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
afterEach(cleanup);

describe('ImportFromDocument bounded operations', () => {
  it('excludes manually answered questions from AI inference', async () => {
    mocks.extract.mockResolvedValue(result([question, { ...question, text: 'Alt enunț' }]));
    mocks.infer.mockImplementation(async (items: ParsedQuestion[]) => items);
    render(<ImportFromDocument onDone={vi.fn()} onImportQuestions={vi.fn()} />);
    upload();
    fireEvent.click(await screen.findByRole('button', { name: 'Întrebarea 1, varianta a: Prima' }));
    fireEvent.click(screen.getByRole('button', { name: /Completează cu AI 1/ }));
    await screen.findByText(/AI nu a completat niciun răspuns/);
    expect(mocks.infer.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.infer.mock.calls[0][0][0].text).toBe('Alt enunț');
    expect(screen.getByRole('button', { name: 'Întrebarea 1, varianta a: Prima' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('discards cancelled extraction and late progress without replacing a retry', async () => {
    const first = deferred<GrileExtractionResult>();
    mocks.extract.mockReturnValueOnce(first.promise).mockResolvedValueOnce(result([question]));
    render(<ImportFromDocument onDone={vi.fn()} onImportQuestions={vi.fn()} />);
    upload();
    expect(screen.getByRole('status')).toHaveTextContent('Extrag grilele');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Anulează procesarea'));
    upload();
    await screen.findByText(/1 întrebare extrasă/);
    await act(async () => { mocks.extract.mock.calls[0][1]('late progress'); first.resolve(result([])); });
    expect(screen.getByText(/1 întrebare extrasă/)).toBeInTheDocument();
    expect(screen.queryByText('late progress')).not.toBeInTheDocument();
  });

  it('keeps extraction errors visible and retries the same file', async () => {
    mocks.extract.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(result([question]));
    render(<ImportFromDocument onDone={vi.fn()} onImportQuestions={vi.fn()} />);
    upload();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('Reîncearcă aceleași fișiere'));
    await screen.findByText(/1 întrebare extrasă/);
    expect(mocks.extract.mock.calls[1][0][0]).toBe(mocks.extract.mock.calls[0][0][0]);
  });

  it('provides empty guidance and blocks an empty import', async () => {
    mocks.extract.mockResolvedValue(result());
    render(<ImportFromDocument onDone={vi.fn()} onImportQuestions={vi.fn()} />);
    upload();
    await screen.findByText(/Nu am găsit întrebări/);
    expect(screen.getByRole('button', { name: 'Adaugă 0 în wizard' })).toBeDisabled();
    expect(screen.getByText('Reîncearcă aceleași fișiere')).toBeInTheDocument();
  });

  it('locks edits during AI, exposes real counts, and avoids false success', async () => {
    mocks.extract.mockResolvedValue(result([question]));
    const ai = deferred<ParsedQuestion[]>();
    mocks.infer.mockReturnValue(ai.promise);
    render(<ImportFromDocument onDone={vi.fn()} onImportQuestions={vi.fn()} />);
    upload();
    fireEvent.click(await screen.findByRole('button', { name: /Completează cu AI/ }));
    expect(screen.getByRole('button', { name: /varianta a:/ })).toBeDisabled();
    act(() => mocks.infer.mock.calls[0][1](1, 1));
    expect(screen.getByRole('status')).toHaveTextContent('1 din 1');
    await act(async () => ai.resolve([question]));
    expect(screen.getByRole('status')).toHaveTextContent('AI nu a completat niciun răspuns');
    expect(mocks.toast).toHaveBeenLastCalledWith(expect.any(String), 'warning', 5000);
  });

  it('preserves manual review after AI cancellation and imports only marked answers', async () => {
    mocks.extract.mockResolvedValue(result([question]));
    const ai = deferred<ParsedQuestion[]>();
    mocks.infer.mockReturnValue(ai.promise);
    const handoff = vi.fn();
    const done = vi.fn();
    render(<ImportFromDocument onDone={done} onImportQuestions={handoff} />);
    upload();
    fireEvent.click(await screen.findByRole('button', { name: /Completează cu AI/ }));
    fireEvent.click(screen.getByText('Anulează completarea AI'));
    fireEvent.click(screen.getByRole('button', { name: /varianta a:/ }));
    await act(async () => ai.resolve([{ ...question, options: [{ text: 'Prima', isCorrect: false }, { text: 'A doua', isCorrect: true }], answerSource: 'ai' }]));
    expect(screen.getByRole('button', { name: /varianta a:/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Adaugă 1 în wizard' }));
    expect(handoff.mock.calls[0][0][0].options[0].isCorrect).toBe(true);
    expect(done).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenLastCalledWith('1 întrebare adăugată în wizard.', 'success', 4000);
  });

  it('ignores late AI feedback after closing', async () => {
    mocks.extract.mockResolvedValue(result([question]));
    const ai = deferred<ParsedQuestion[]>();
    mocks.infer.mockReturnValue(ai.promise);
    const done = vi.fn();
    render(<ImportFromDocument onDone={done} onImportQuestions={vi.fn()} />);
    upload();
    fireEvent.click(await screen.findByRole('button', { name: /Completează cu AI/ }));
    fireEvent.click(screen.getByText('Renunță'));
    await act(async () => ai.resolve([question]));
    expect(done).toHaveBeenCalledOnce();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
