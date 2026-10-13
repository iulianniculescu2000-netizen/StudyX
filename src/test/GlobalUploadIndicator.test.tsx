import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import GlobalUploadIndicator from '../components/app/GlobalUploadIndicator';
import { useVaultUploadStore } from '../store/vaultUploadStore';
import { ThemeProvider } from '../theme/ThemeContext';

describe('GlobalUploadIndicator Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useVaultUploadStore.setState({ tasks: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders null when there are no tasks', () => {
    const { container } = render(
      <ThemeProvider>
        <GlobalUploadIndicator />
      </ThemeProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders top floating pill while indexing is in progress', () => {
    useVaultUploadStore.setState({
      tasks: [
        {
          id: 'task-1',
          file: new File([], 'cardiologie.pdf'),
          fileName: 'cardiologie.pdf',
          fileSize: 1024,
          type: 'pdf',
          status: 'indexing',
          progressPercent: 45,
          stepText: 'Indexare conținut...',
          startedAt: Date.now(),
        },
      ],
    });

    render(
      <ThemeProvider>
        <GlobalUploadIndicator />
      </ThemeProvider>,
    );

    expect(screen.getByText(/Indexare în fundal \(1\)\.\.\./)).toBeDefined();
    expect(screen.getByText('cardiologie.pdf')).toBeDefined();
  });

  it('shows success and auto-dismisses after 3.5 seconds', async () => {
    useVaultUploadStore.setState({
      tasks: [
        {
          id: 'task-2',
          file: new File([], 'grile_uro.pdf'),
          fileName: 'grile_uro.pdf',
          fileSize: 1024,
          type: 'pdf',
          status: 'completed',
          progressPercent: 100,
          stepText: 'Finalizat',
          startedAt: Date.now(),
        },
      ],
    });

    render(
      <ThemeProvider>
        <GlobalUploadIndicator />
      </ThemeProvider>,
    );

    // Initial success state
    expect(screen.getByText('Indexare finalizată')).toBeDefined();

    // Fast-forward past the 3.5s auto-dismiss timer
    act(() => {
      vi.advanceTimersByTime(3600);
    });

    // Completed tasks were cleared from store
    expect(useVaultUploadStore.getState().tasks.length).toBe(0);
  });
});
