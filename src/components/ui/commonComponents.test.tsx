import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Inbox } from 'lucide-react';
import { ThemeProvider } from '../../theme/ThemeContext';
import PageHeader from './PageHeader';
import SectionLabel from './SectionLabel';
import EmptyState from './EmptyState';
import PageSkeleton from './PageSkeleton';
import ErrorState from './ErrorState';

function wrap(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{node}</ThemeProvider>
    </MemoryRouter>,
  );
}

describe('PageHeader', () => {
  it('afișează eyebrow, titlu, subtitlu, înapoi și acțiuni', () => {
    wrap(
      <PageHeader
        eyebrow="Rezidențiat"
        title="Organizare"
        subtitle="Planul tău"
        back={{ to: '/rezidentiat', label: 'Rezidențiat' }}
        actions={<button>Exportă</button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Organizare' })).toBeTruthy();
    expect(screen.getByText('Planul tău')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Rezidențiat/ }).getAttribute('href')).toBe('/rezidentiat');
    expect(screen.getByRole('button', { name: 'Exportă' })).toBeTruthy();
  });

  it('merge și doar cu titlu', () => {
    wrap(<PageHeader title="Setări" />);
    expect(screen.getByRole('heading', { name: 'Setări' })).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('SectionLabel', () => {
  it('randează un h2', () => {
    wrap(<SectionLabel>Discipline</SectionLabel>);
    expect(screen.getByRole('heading', { level: 2, name: 'Discipline' })).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('are titlu și acțiune link și acțiune buton', () => {
    const onClick = vi.fn();
    wrap(
      <EmptyState
        icon={Inbox}
        title="Nimic aici"
        body="Adaugă prima grilă."
        primary={{ label: 'Creează', to: '/create' }}
        secondary={{ label: 'Importă', onClick }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nimic aici' })).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('link', { name: 'Creează' }).getAttribute('href')).toBe('/create');
    fireEvent.click(screen.getByRole('button', { name: 'Importă' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fără acțiuni nu are butoane', () => {
    wrap(<EmptyState icon={Inbox} title="Gol" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('PageSkeleton', () => {
  it('este marcat ca ocupat', () => {
    wrap(<PageSkeleton />);
    expect(screen.getByTestId('page-skeleton').getAttribute('aria-busy')).toBe('true');
  });
});

describe('ErrorState', () => {
  it('arată mesajul, reîncercarea și detaliile strânse', () => {
    const onRetry = vi.fn();
    wrap(<ErrorState title="Ups" body="Nu s-a putut încărca." onRetry={onRetry} details="stack-ul" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const details = screen.getByText('stack-ul').closest('details');
    expect(details).toBeTruthy();
    expect(details?.hasAttribute('open')).toBe(false);
  });
});
