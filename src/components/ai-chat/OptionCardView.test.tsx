import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../../theme/ThemeContext';
import OptionCardView from './OptionCardView';
import type { OptionCard } from './shared';
import { expectNoA11yViolations } from '../../test/a11y';

const card = (extra: Partial<OptionCard> = {}): OptionCard => ({
  id: 'c1', kind: 'quiz', status: 'pending', space: 'rezidentiat', topic: 'tratamentul AR',
  count: 30, difficulty: 'auto', questionType: 'single', folder: { mode: 'existing', id: '__auto_quiz__' },
  ...extra,
});

function Harness({ value, onEdit = () => {} }: { value: OptionCard; onEdit?: (patch: Partial<OptionCard>) => void }) {
  const theme = useTheme();
  return <OptionCardView card={value} theme={theme} onEdit={onEdit} onSubmit={() => {}} onCancel={() => {}} onOpen={() => {}} />;
}
const wrap = (node: React.ReactNode) => render(<MemoryRouter><ThemeProvider>{node}</ThemeProvider></MemoryRouter>);

describe('OptionCardView', () => {
  it('păstrează subiectul cerut în câmpul „Subiect” și lasă editarea lui', () => {
    const onEdit = vi.fn();
    wrap(<Harness value={card()} onEdit={onEdit} />);
    const input = screen.getByLabelText('Subiectul') as HTMLInputElement;
    expect(input.value).toBe('tratamentul AR');
    fireEvent.change(input, { target: { value: 'artrita reumatoidă' } });
    expect(onEdit).toHaveBeenCalledWith({ topic: 'artrita reumatoidă' });
  });

  it('nu are probleme de accesibilitate (axe), nici în starea de rezumat', async () => {
    const pending = wrap(<Harness value={card()} />);
    await expectNoA11yViolations(pending.container);
    pending.unmount();
    const done = wrap(<Harness value={card({ status: 'done', route: { route: '/play/x', label: 'Rezolvă acum' } })} />);
    await expectNoA11yViolations(done.container);
  }, 30_000);
});
