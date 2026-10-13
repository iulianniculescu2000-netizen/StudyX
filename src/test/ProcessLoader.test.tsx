import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProcessLoader from '../components/ui/ProcessLoader';
import { ThemeProvider } from '../theme/ThemeContext';

describe('ProcessLoader Component', () => {
  it('renders bio-orbit variant with default aria label', () => {
    render(
      <ThemeProvider>
        <ProcessLoader variant="bio-orbit" />
      </ThemeProvider>,
    );

    const loader = screen.getByRole('progressbar');
    expect(loader).toBeDefined();
    expect(loader.getAttribute('aria-label')).toBe('Se încarcă...');
  });

  it('renders label and formatted percentage', () => {
    render(
      <ThemeProvider>
        <ProcessLoader
          variant="bio-orbit"
          progress={78}
          label="Indexare grile rezidențiat..."
          sublabel="Capitol: Cardiologie"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText(/Indexare grile rezidențiat/)).toBeDefined();
    expect(screen.getByText('78%')).toBeDefined();
    expect(screen.getByText('Capitol: Cardiologie')).toBeDefined();
  });

  it('renders scanner and vortex variants without throwing', () => {
    const { rerender } = render(
      <ThemeProvider>
        <ProcessLoader variant="scanner" label="Scanare PDF..." />
      </ThemeProvider>,
    );
    expect(screen.getByText('Scanare PDF...')).toBeDefined();

    rerender(
      <ThemeProvider>
        <ProcessLoader variant="vortex" label="Sincronizare..." />
      </ThemeProvider>,
    );
    expect(screen.getByText('Sincronizare...')).toBeDefined();
  });
});
