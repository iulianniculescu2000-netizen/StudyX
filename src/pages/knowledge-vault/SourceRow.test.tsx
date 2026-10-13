import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AIKnowledgeSource } from '../../store/aiStore';
import { ThemeProvider } from '../../theme/ThemeContext';
import SourceRow from './SourceRow';

const source = (indexStatus: 'indexing' | 'error'): AIKnowledgeSource => ({
  id: 'source-1', name: 'Manual.pdf', type: 'pdf', wordCount: 1200,
  addedAt: Date.now(), indexStatus,
  ...(indexStatus === 'error' ? { indexError: 'Importul a eșuat.' } : { indexProgress: 35 }),
} as AIKnowledgeSource);

describe('SourceRow', () => {
  it.each(['indexing', 'error'] as const)('deschide detaliile stării %s în locul unui buton inert', (indexStatus) => {
    const onOpenReader = vi.fn();
    const onAsk = vi.fn();
    render(
      <ThemeProvider>
        <SourceRow
          source={source(indexStatus)} index={0} performanceLite folderName={null}
          isSearchingTop={false} menuOpen={false} menuPos={null} moving={false}
          missingPages={false} reindexState={null} reindexBusy={false} folderOptions={[]}
          onOpenReader={onOpenReader} onAsk={onAsk} onOpenStudio={vi.fn()}
          onReindex={vi.fn()} onToggleMenu={vi.fn()} onCloseMenu={vi.fn()}
          onStartMove={vi.fn()} onCancelMove={vi.fn()} onMove={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Vezi starea pentru Manual.pdf' }));
    expect(onOpenReader).toHaveBeenCalledOnce();
    expect(onOpenReader).toHaveBeenCalledWith(expect.objectContaining({ indexStatus }));
    expect(onAsk).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Întreabă' })).toBeDisabled();
  });
});
