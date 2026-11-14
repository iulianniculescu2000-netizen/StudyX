import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AIExplanationPanel } from './ai-panels';
import { OPEN_BOOK_EVENT, type OpenBookDetail } from '../../components/ai-chat/citations';
import { BUNDLED_BOOK_NAMES } from '../../lib/bundledBookNames';
import { THEMES } from '../../theme/themes';
import type { AIAnalysisResult } from '../../ai/types';

const theme = THEMES.light;

const analysis = (citations: AIAnalysisResult['citations']): AIAnalysisResult => ({
  explanation: 'Metotrexatul este tratamentul de fond [1].',
  mistakeType: '',
  rule: '',
  confidence: 0.8,
  citations,
});

function renderPanel(result: AIAnalysisResult) {
  return render(
    <AIExplanationPanel
      aiLoading={false}
      aiText={result.explanation}
      analysisResult={result}
      examMode={false}
      usesRemoteAI
      nextTopicHint={null}
      revealed
      onExplain={() => undefined}
      theme={theme}
    />,
  );
}

describe('sursele din explicația unei grile', () => {
  it('arată cartea și pagina și deschide cartea la pagina citată', () => {
    renderPanel(analysis([{
      n: 1, id: 'c1', sourceId: 'kumar', source: BUNDLED_BOOK_NAMES.kumar.replace(/\.pdf$/, ''), page: 75,
      label: 'Kumar, p. 75', excerpt: 'Pot fi utilizate combinații…', tier: 'book',
    }]));
    const chip = screen.getByRole('button', { name: /Deschide în carte, sursa 1/ });
    expect(chip.textContent).toContain('p. 75');

    const opened = vi.fn();
    window.addEventListener(OPEN_BOOK_EVENT, opened);
    fireEvent.click(chip);
    window.removeEventListener(OPEN_BOOK_EVENT, opened);
    const detail = (opened.mock.calls[0][0] as CustomEvent<OpenBookDetail>).detail;
    expect(detail.book).toBe('K');
    expect(detail.pdfPage).toBe(75);
  });

  it('fără surse citate nu arată niciun buton de sursă', () => {
    renderPanel(analysis([]));
    expect(screen.queryByTestId('explanation-sources')).toBeNull();
  });
});
