import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../theme/ThemeContext';
import PageHeader from './PageHeader';

it('shows one help entry when a page supplies both a tip and a tour', () => {
  render(<MemoryRouter><ThemeProvider><PageHeader title="Grile" help="quiz-modes" tour={{ id: 'quizSession', label: 'Ghid duplicat' }} /></ThemeProvider></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Ajutor: Moduri de lucru' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Ghid duplicat' })).toBeNull();
});

it('lets a step-based page go back without navigating away', () => {
  const onBack = vi.fn();
  render(
    <MemoryRouter>
      <ThemeProvider>
        <PageHeader
          title="Grilă nouă"
          back={{ label: 'Înapoi la informații generale', onClick: onBack }}
          breadcrumbs={<button>Biblioteca AI</button>}
        />
      </ThemeProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Înapoi la informații generale' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByRole('button', { name: 'Biblioteca AI' })).toBeTruthy();
});
