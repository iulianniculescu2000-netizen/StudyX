import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AIThinkingIndicator from '../components/ai-chat/AIThinkingIndicator';
import { ThemeProvider } from '../theme/ThemeContext';

describe('AIThinkingIndicator Component', () => {
  it('renders default reasoning step in status container', () => {
    render(
      <ThemeProvider>
        <AIThinkingIndicator />
      </ThemeProvider>,
    );

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeDefined();
    expect(screen.getByText(/Analizez contextul întrebării medicale/)).toBeDefined();
    expect(screen.getByText(/Raționament clinic în desfășurare/)).toBeDefined();
  });

  it('renders custom step text when provided', () => {
    render(
      <ThemeProvider>
        <AIThinkingIndicator stepText="Verific baremul oficial..." />
      </ThemeProvider>,
    );

    expect(screen.getByText('Verific baremul oficial...')).toBeDefined();
  });

  it('renders compact mode properly', () => {
    render(
      <ThemeProvider>
        <AIThinkingIndicator compact stepText="Sintetizez grila..." />
      </ThemeProvider>,
    );

    expect(screen.getByText('Sintetizez grila...')).toBeDefined();
  });
});
